import {normalizeCalendar} from '../../lib/weekly-calendar.ts';
import {journeyRoster} from '../../lib/journey-roster.ts';
import {resolveJourneyReference} from './journey-reference.ts';
import type {JourneyDecision} from './journey-ai.ts';
import {defaultJourneyMessage,journeyAnnouncement} from '../../lib/journey-message.ts';
import type { Player, Game } from '../../lib/tournament.ts';
import type { Express, RequestHandler } from 'express';
import { z } from 'zod';
import { db } from './db.ts';
import { config } from './config.ts';
import { encrypt, digest } from './security.ts';
import { mentionedReply } from './bot-message.ts';
import { journeyIntent, enrol, type Journey } from '../../lib/journey.ts';
import { prepareDivisionDraw } from '../../lib/division-draw.ts';
import type { Prisma } from './generated/prisma/client.ts';
const fail = (m: string): never => {
  throw Object.assign(Error(m), { status: 409 });
};
const lock = async (tx: Prisma.TransactionClient) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('journeys'))`;
};
export async function listJourneys(tx: Prisma.TransactionClient = db) {
  return (
    await tx.setting.findMany({ where: { key: { startsWith: 'journey:' } } })
  ).map((r) => JSON.parse(r.value) as Journey);
}
const save = (tx: Prisma.TransactionClient, j: Journey) =>
  tx.setting.upsert({
    where: { key: 'journey:' + j.id },
    create: { key: 'journey:' + j.id, value: JSON.stringify(j) },
    update: { value: JSON.stringify(j) },
  });
async function notice(
  tx: Prisma.TransactionClient,
  j: Journey,
  text: string,
  phone?: string,
) {
  const message = await tx.outbox.create({
    data: {
      recipient: j.group,
      kind: phone ? 'journey_reply' : 'journey_announcement',
      encryptedBody: encrypt(
        phone
          ? JSON.stringify({
              format: 'mentioned-reply-v1',
              ...mentionedReply(text, phone),
            })
          : text,
        config.MESSAGE_KEY,
      ),
      expiresAt: new Date(j.date + 'T' + j.time + ':00+01:00'),
    },
  });
  await tx.setting.create({data:{key:'journey-message:'+message.id,value:j.id}});
  return message;
}
export async function handleJourney(
  group: string,
  phone: string,
  text: string,
  eventId: string,
  quotedId?: string,
  decision?: JourneyDecision,
) {
  const action = decision?.action ?? journeyIntent(text);
  if (action==='silent') return true;
  if (!action||action==='none') return false;
  return db.$transaction(
    async (tx) => {
      await lock(tx);
      if (
        (await tx.setting.findUnique({ where: { key: 'whatsapp_group' } }))
          ?.value !== group
      )
        return true;
      const event = 'journey-event:' + digest(group + ':' + eventId);
      if (await tx.setting.findUnique({ where: { key: event } })) return true;
      const player = await tx.player.findUnique({ where: { phone } });
      const all = (await listJourneys(tx)).filter(
        (j) =>
          j.group === group &&
          new Date(j.date + 'T' + j.time + ':00+01:00') > new Date(),
      );
      let choices = all.filter((j) => j.status === 'open');
      const code = /jornada\s+([a-f0-9]+)/i.exec(text)?.[1];
      if(decision?.journeyId&&!quotedId)choices=all.filter(j=>j.id===decision.journeyId);
      else if (code&&!decision) choices = all.filter((j) => j.id === code);
      else if (quotedId) {
        const reference = await resolveJourneyReference(tx,group,quotedId,all);
        choices = all.filter(j=>j.id===reference);
      }
      if (!choices.length) {
        await tx.outbox.create({
          data: {
            recipient: group,
            kind: 'journey_reply',
            encryptedBody: encrypt(
              JSON.stringify({
                format: 'mentioned-reply-v1',
                ...mentionedReply(
                  quotedId ? 'Não consegui identificar a jornada dessa mensagem. Responde ao anúncio original ou escreve a divisão e a data dos jogos.' : 'Não há inscrições abertas para essa jornada. Consulta a organização.',
                  phone,
                ),
              }),
              config.MESSAGE_KEY,
            ),
            expiresAt: new Date(Date.now() + 300000),
          },
        });
        await tx.setting.create({ data: { key: event, value: 'done' } });
        return true;
      }
      const j = choices[0];
      let reply = '';
      let newRegistration = false;
      if (!player || !player.verified || player.status !== 'Ativo')
        reply =
          'A participação exige uma inscrição aprovada na plataforma. Contacta a organização.';
      else if(action==='clarify')reply='Queres confirmar a tua participação ou cancelar? Responde ao anúncio dos jogos a que te referes.';
      else if (choices.length !== 1 || (decision && !decision.journeyId && !quotedId))
        reply =
          'Preciso de confirmar a jornada. Responde diretamente ao anúncio em que queres participar com “' +
          (action === 'join' ? 'quero entrar' : 'quero sair') +
          '”.\n' + choices.map(j=>`${j.division} · ${j.date.split('-').reverse().join('/')} às ${j.time}`).join('\n');
      else if (j.status !== 'open')
        reply =
          'As inscrições desta jornada já estão fechadas. Contacta a organização.';
      else if (player.division !== j.division)
        reply = `Esta jornada é de ${j.division}; a tua divisão é ${player.division}.`;
      else {
        newRegistration = action === 'join' && !j.confirmed.includes(player.id) && !j.waiting.includes(player.id);
        reply = enrol(j, player.id, action);
        if (action === 'leave')
          while (j.confirmed.length < j.capacity && j.waiting.length) {
            const next = await tx.player.findUnique({
              where: { id: j.waiting.shift()! },
            });
            if (
              next?.status === 'Ativo' &&
              next.verified &&
              next.division === j.division
            ) {
              j.confirmed.push(next.id);
              await notice(
                tx,
                j,
                `Abriu uma vaga: estás confirmado em ${j.division}, ${j.date} às ${j.time}.`,
                next.phone,
              );
            }
          }
        await save(tx, j);
      }
      await notice(
        tx,
        j,
        choices.length===1?`${j.division} · ${j.date.split('-').reverse().join('/')} ${j.time}\n${reply}`:reply,
        phone,
      );
      if(newRegistration){
        const roster=await tx.player.findMany({where:{id:{in:[...j.confirmed,...j.waiting]}},select:{id:true,name:true}});
        await notice(tx,j,journeyRoster(j,roster));
      }
      await tx.setting.create({ data: { key: event, value: 'done' } });
      return true;
    },
    { timeout: 15000 },
  );
}
export function installJourneys(
  app: Express,
  auth: RequestHandler,
  admin: RequestHandler,
) {
  app.get('/api/admin/journeys', auth, admin, async (_req, res) =>
    res.json((await listJourneys()).sort((a, b) => b.date.localeCompare(a.date))),
  );
  app.post('/api/admin/journeys', auth, admin, async (req, res) => {
    const input = z
      .object({
        id: z.string().regex(/^[a-f0-9]{12}$/),
        division: z.enum(['M1+', 'M1', 'M2+', 'M2']),
        date: z.iso.date(),
        time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
        capacity: z.number().int().min(8).max(200).multipleOf(4),
        courtIds: z.array(z.string()).min(2),
        message: z.string().trim().min(1).max(1500).default(defaultJourneyMessage),
      })
      .parse(req.body);
    res.json(
      await db.$transaction(async (tx) => {
        await lock(tx);
        const existing = (await listJourneys(tx)).find((j) => j.id === input.id);
        if (existing) return existing;
        const calendarRow=await tx.setting.findUnique({where:{key:'weekly-calendar'}});
        if(normalizeCalendar(calendarRow?JSON.parse(calendarRow.value):null).divisions[input.division].enabled===false) fail('Esta divisão está desativada no calendário. Ativa-a nas configurações antes de abrir inscrições.');
        if (new Date(input.date + 'T' + input.time + ':00+01:00') <= new Date())
          fail('Escolhe uma data e hora futuras.');
        const minutes = (t: string) =>
          Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
        const start = minutes(input.time);
        if (start + 80 > 1440)
          fail('Os quatro jogos devem terminar no mesmo dia.');
        const reserved = (await listJourneys(tx)).filter(
          (j) => j.date === input.date && j.status !== 'drawn',
        );
        if (
          reserved.some(
            (j) =>
              j.courtIds.some((c) => input.courtIds.includes(c)) &&
              minutes(j.time) < start + 80 &&
              start < minutes(j.time) + 80,
          )
        )
          fail(
            'Esses campos já estão reservados por outra jornada nesse horário.',
          );
        const scheduled = await tx.game.findMany({
          where: { date: input.date, courtId: { in: input.courtIds } },
        });
        if (
          scheduled.some(
            (g) =>
              minutes(g.time) < start + 80 &&
              start < minutes(g.time) + g.duration,
          )
        )
          fail('Esses campos já têm jogos nesse horário.');
        if (new Set(input.courtIds).size !== input.capacity / 4)
          fail('Seleciona um campo por cada quatro vagas.');
        if (
          (await tx.court.count({
            where: { id: { in: input.courtIds }, active: true },
          })) !== input.courtIds.length
        )
          fail('Seleciona campos ativos.');
        const group = (
          await tx.setting.findUnique({ where: { key: 'whatsapp_group' } })
        )?.value;
        if (!group) fail('Associa primeiro o grupo.');
        const j: Journey = {
          ...input,
          group: group!,
          status: 'open',
          confirmed: [],
          waiting: [],
          announcementId: '',
        };
        const message = await notice(
          tx,
          j,
          journeyAnnouncement(input.message,j),
        );
        j.announcementId = message.id;
        await save(tx, j);
        return j;
      }),
    );
  });
  app.post('/api/admin/journeys/:id/close', auth, admin, async (req, res) =>
    res.json(
      await db.$transaction(async (tx) => {
        await lock(tx);
        const j = (await listJourneys(tx)).find((j) => j.id === req.params.id);
        if (!j || j.status !== 'open') fail('Jornada indisponível.');
        if(j!.confirmed.length<8||j!.confirmed.length%4)fail('São necessários 8, 12, 16… confirmados para fechar e sortear. Mantém as inscrições abertas.');
        j!.status = 'closed';
        await save(tx, j!);
        return j;
      }),
    ),
  );
  app.post('/api/admin/journeys/:id/draw', auth, admin, async (req, res) => {
    const { sides, courtIds } = z
      .object({
        sides: z.record(z.string(), z.enum(['Esquerda', 'Direita'])),
        courtIds: z.array(z.string()),
      })
      .parse(req.body);
    res.json(
      await db.$transaction(
        async (tx) => {
          await lock(tx);
          const j = (await listJourneys(tx)).find((j) => j.id === req.params.id);
          if (!j || j.status !== 'closed')
            fail('Fecha as inscrições antes de sortear.');
          if (
            Object.keys(sides).length !== j!.confirmed.length ||
            j!.confirmed.some((id) => !sides[id])
          )
            fail('O sorteio deve incluir exatamente os confirmados.');
          await tx.revision.update({
            where: { id: 1 },
            data: { value: { increment: 1 } },
          });
          const players = (await tx.player.findMany()).map((p) => ({
            ...p,
            birth: p.birth.toISOString().slice(0, 10),
          }));
          const courts = await tx.court.findMany();
          const games = (await tx.game.findMany()).map((g) => ({
            ...g,
            court: g.courtId,
          }));
          if (courtIds.some((id) => !j!.courtIds.includes(id)))
            fail('Usa os campos desta jornada.');
          const result = prepareDivisionDraw(
            { ...j!, sides, courtIds },
            players as Player[],
            courts,
            games as Game[],
          );
          if (
            games.some(
              (g) => g.division === j!.division && g.round === result.round,
            )
          )
            fail(
              'Já existe um sorteio nesta divisão. Resolve-o antes de gerar outro.',
            );
          for (const g of result.generated) {
            const { court, ...rest } = g;
            await tx.game.create({ data: { ...rest, courtId: court } });
          }
          j!.status = 'drawn';
          await save(tx, j!);
          return { ok: true };
        },
        { timeout: 20000 },
      ),
    );
  });
}
