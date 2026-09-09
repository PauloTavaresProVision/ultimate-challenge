import { vacancies } from './substitutions.ts';
import type { Express, RequestHandler } from 'express';
import { z } from 'zod';
import { db } from './db.ts';
import { encrypt } from './security.ts';
import { config } from './config.ts';
import type { WhatsApp } from './whatsapp.ts';
import { conflict } from '../../lib/tournament.ts';
import { deliveryWindow, type Delivery } from './message-schedule.ts';
const player = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(2).max(100),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  birth: z.iso
    .date()
    .refine(
      (v) => v >= '1900-01-01' && v < new Date().toISOString().slice(0, 10),
    ),
  side: z.enum(['Esquerda', 'Direita']),
  division: z.enum(['M1+', 'M1', 'M2+', 'M2']),
  status: z.enum(['Ativo', 'Inativo', 'Pendente', 'Rejeitado']),
  verified: z.boolean(),
  note: z.string().max(500),
});
const court = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(80),
  location: z.string().trim().min(1).max(150),
  active: z.boolean(),
});
const game = z.object({
  id: z.string(),
  round: z.number().int().positive(),
  division: z.enum(['M1+', 'M1', 'M2+', 'M2']),
  a: z.array(z.string()).length(2),
  b: z.array(z.string()).length(2),
  court: z.string(),
  date: z.iso.date(),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  duration: z.number().int().min(15).max(240),
  winner: z.enum(['a', 'b']).nullable(),
  published: z.boolean(),
});
const stateSchema = z.object({
  revision: z.number().int().nonnegative(),
  players: z.array(player).max(500),
  courts: z.array(court).max(50),
  games: z.array(game).max(5000),
});
const bad = (msg: string): never => {
  throw Object.assign(new Error(msg), { status: 400 });
};
export function installAdminState(
  app: Express,
  auth: RequestHandler,
  admin: RequestHandler,
  wa: WhatsApp,
  snapshot: () => Promise<unknown>,
) {
  app.put('/api/admin/state', auth, admin, async (req, res) => {
    const data = stateSchema.parse(req.body);
    for (const records of [data.players, data.courts, data.games])
      if (new Set(records.map((x) => x.id)).size !== records.length)
        bad('Identificadores duplicados.');
    if (new Set(data.players.map((p) => p.phone)).size !== data.players.length)
      bad('WhatsApp duplicado.');
    for (const g of data.games) {
      const ids = [...g.a, ...g.b];
      if (new Set(ids).size !== 4)
        bad('Um jogo exige quatro jogadores diferentes.');
      if (
        !data.courts.some((c) => c.id === g.court && (c.active || !!g.winner))
      )
        bad('Campo indisponível.');
      for (const pair of [g.a, g.b]) {
        const people = pair.map((id) => data.players.find((p) => p.id === id));
        if (people.some((p) => !p)) bad('Jogador desconhecido.');
        if (
          !g.winner &&
          people.some(
            (p) =>
              p!.division !== g.division ||
              p!.status !== 'Ativo' ||
              !p!.verified,
          )
        )
          bad('O jogo contém jogadores não elegíveis.');
        if (new Set(people.map((p) => p!.side)).size !== 2)
          bad('A dupla deve ter esquerda e direita.');
        const previous = data.games.filter((x) => x.round === g.round - 1);
        if (
          previous.some((x) =>
            [x.a, x.b].some((old) => old.every((id) => pair.includes(id))),
          )
        )
          bad('Parceiros repetidos na ronda seguinte.');
      }
      if (conflict(g, data.games)) bad('Conflito de campo ou jogador.');
      for (const id of ids) {
        const appearances = data.games.filter(other => other.round === g.round && [...other.a, ...other.b].includes(id));
        if (appearances.length > 4) bad('Cada jogador pode fazer no máximo quatro jogos por ronda.');
        const pair = (g.a.includes(id) ? g.a : g.b).slice().sort().join('|');
        if (appearances.some(other => (other.a.includes(id) ? other.a : other.b).slice().sort().join('|') !== pair))
          bad('A dupla deve manter-se fixa nos quatro jogos da ronda.');
        if (appearances.length > 1 && appearances.some(other => other.duration !== 20 || other.date !== g.date))
          bad('Os quatro jogos devem durar 20 minutos e acontecer no mesmo dia.');
        if (g.published && appearances.length !== 1 && appearances.length !== 4)
          bad('Publica os quatro jogos da ronda em conjunto.');
      }
    }
    let invite: string | null = null;
    const targetGroup = await db.setting.findUnique({where:{key:"whatsapp_group"}});
    const prior = await db.player.findMany();
    const approvals = data.players.filter(
      (p) =>
        p.status === 'Ativo' &&
        prior.find((o) => o.id === p.id)?.status === 'Pendente',
    );
    if (approvals.length) invite = await wa.groupInvite();
    await db.$transaction(async (tx) => {
      const lock = await tx.revision.updateMany({
        where: { id: 1, value: data.revision },
        data: { value: { increment: 1 } },
      });
      if (!lock.count)
        throw Object.assign(
          new Error(
            'Os dados foram alterados noutra sessão. Atualiza e tenta novamente.',
          ),
          { status: 409 },
        );
      const existing = await tx.player.findMany();
      for (const old of existing) {
        if (!data.players.some((p) => p.id === old.id))
          bad('Desativa jogadores em vez de apagar registos.');
      }
      for (const p of data.players) {
        const old = existing.find((o) => o.id === p.id);
        if (p.verified !== !!old?.verified)
          bad('A validação do WhatsApp só pode ser feita por código.');
        if (p.status === 'Ativo' && !old?.verified)
          bad('Valida o número antes de aprovar.');
        if (old && old.phone !== p.phone)
          bad(
            'A alteração do número exige nova validação e está indisponível nesta etapa.',
          );
        if (
          old &&
          old.division !== p.division &&
          (await tx.game.count({
            where: {
              OR: [{ a: { has: p.id } }, { b: { has: p.id } }],
              winner: { not: null },
            },
          }))
        )
          bad(
            'As mudanças de divisão com pontos são feitas automaticamente a cada duas semanas.',
          );
        if (p.status === 'Rejeitado' && !p.note.trim())
          bad('Indica o motivo da rejeição.');
        const { id, ...fields } = p;
        await tx.player.upsert({
          where: { id },
          create: { id, ...fields, birth: new Date(p.birth) },
          update: { ...fields, birth: new Date(p.birth) },
        });
        if (old?.status === 'Pendente' && p.status === 'Ativo' && invite)
          await tx.outbox.create({
            data: {
              recipient: `${p.phone.slice(1)}@s.whatsapp.net`,
              kind: 'group_join',
              encryptedBody: encrypt(
                JSON.stringify({playerId:p.id,group:targetGroup!.value,text:`Olá ${p.name}, a tua inscrição no Ultimate Challenge foi aprovada! Divisão: ${p.division}. Entra no grupo: ${invite}`}),
                config.MESSAGE_KEY,
              ),
              expiresAt: new Date(Date.now() + 86400000),
            },
          });
      }
      for (const c of data.courts) {
        const { id, ...fields } = c;
        await tx.court.upsert({ where: { id }, create: c, update: fields });
      }
      const oldGames = await tx.game.findMany();
      for(const v of (await vacancies(tx)).filter(v=>v.status==='pending')) {
        for(const id of v.gameIds) {
          const old=oldGames.find(g=>g.id===id), next=data.games.find(g=>g.id===id);
          if(!old||!next||JSON.stringify(old.a)!==JSON.stringify(next.a)||JSON.stringify(old.b)!==JSON.stringify(next.b)||next.winner||old.date!==next.date||old.round!==next.round||!next.published)bad('O jogo aguarda suplente. Resolve a substituição antes de alterar participantes ou resultados.');
        }
      }
      for (const g of data.games) {
        if (oldGames.some(old => old.round === g.round && old.duration !== 20)) continue;
        for (const id of [...g.a, ...g.b]) {
          const own = data.games.filter(x => x.round === g.round && [...x.a, ...x.b].includes(id)).sort((a,b)=>a.time.localeCompare(b.time));
          if (own.some(x=>x.published !== g.published)) bad('Publica os quatro jogos da ronda em conjunto.');
          if (own.length !== 4 || own.some(x=>x.duration !== 20)) bad('A ronda deve ter quatro jogos de 20 minutos por jogador.');
          if (own.some((x,i)=>i>0 && x.court===own[i-1].court)) bad('A dupla deve mudar de campo entre jogos.');
        }
      }
      const closedMonths = await tx.setting.findMany({where:{key:{startsWith:'competition:month:'}}});
      const closed = new Set(closedMonths.map(m=>m.key.slice('competition:month:'.length)));
      for(const g of data.games) {
        const old=oldGames.find(o=>o.id===g.id);
        if(closed.has(g.date.slice(0,7)) || (old && closed.has(old.date.slice(0,7)))) {
          if(!old || JSON.stringify({...old,court:old.courtId,courtId:undefined})!==JSON.stringify({...g})) {
            if(!old || ['date','time','round','division','duration','winner','published'].some(k=>old[k as keyof typeof old]!==g[k as keyof typeof g]) || old.courtId!==g.court || JSON.stringify(old.a)!==JSON.stringify(g.a) || JSON.stringify(old.b)!==JSON.stringify(g.b)) bad('Os jogos de um mês encerrado não podem ser alterados.');
          }
        }
      }
      if (
        oldGames.some(
          (g) => g.published && !data.games.some((x) => x.id === g.id),
        )
      )
        bad('Não é permitido apagar jogos publicados.');
      await tx.game.deleteMany({
        where: { id: { notIn: data.games.map((g) => g.id) }, published: false },
      });
      for (const g of data.games) {
        const { id, court, ...fields } = g;
        await tx.game.upsert({
          where: { id },
          create: { id, ...fields, courtId: court },
          update: { ...fields, courtId: court },
        });
      }
      const published = data.games.filter(
        (g) => g.published && !oldGames.find((x) => x.id === g.id)?.published,
      );
      if (published.length) {
        const deliverySetting=await tx.setting.findUnique({where:{key:'message_delivery'}});
        const delivery:Delivery=deliverySetting?JSON.parse(deliverySetting.value):{mode:'immediate',hoursBefore:24};
        const window=deliveryWindow(delivery,published);
        const group = await tx.setting.findUnique({
          where: { key: 'whatsapp_group' },
        });
        if (!group) bad('Associa primeiro o grupo Escada.');
        const name = (id: string) =>
          data.players.find((p) => p.id === id)!.name;
        const text = `🎾 Escada · Jogos\n\n${['M1+', 'M1', 'M2+', 'M2']
          .map((d) => {
            const gs = published.filter((g) => g.division === d);
            return gs.length
              ? `${d}\n${gs.map((g) => `${g.date} · ${g.time} · ${data.courts.find((c) => c.id === g.court)!.name}\n${g.a.map(name).join(' / ')} × ${g.b.map(name).join(' / ')}`).join('\n\n')}`
              : '';
          })
          .filter(Boolean)
          .join('\n\n')}\n\nJogos: ${config.APP_ORIGIN}/jogos`;
        await tx.outbox.create({
          data: {
            recipient: group!.value,
            kind: 'round',
            encryptedBody: encrypt(text, config.MESSAGE_KEY),
            ...window,
          },
        });
      }
      await tx.audit.create({
        data: {
          actor: res.locals.session.adminId,
          action: 'Dados do torneio atualizados pela organização.',
        },
      });
    });
    res.json(await snapshot());
  });
}
