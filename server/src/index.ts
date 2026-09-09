import { installAI } from './ai-bot.ts';
import { retryWelcome } from './welcome.ts';
import { installCalendar } from './calendar.ts';
import { installRules } from './public-rules.ts';
import { installSubstitutions, vacancies } from './substitutions.ts';
import { installInviteSending } from './invite-sending.ts';
import { installOpenAI } from './openai-settings.ts';
import express from 'express';
import { syncEnvironmentAdmin } from './admin-bootstrap.ts';
import { installAdminState } from './admin-state.ts';
import helmet from 'helmet';
import { randomInt } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { db } from './db.ts';
import { config } from './config.ts';
import { WhatsApp } from './whatsapp.ts';
import { resultWinner } from './game-results.ts';
import { runCompetition } from './competition.ts';
import {
  randomToken,
  digest,
  hashPassword,
  checkPassword,
  codeDigest,
  encrypt,
} from './security.ts';
const app = express();
const wa = new WhatsApp();
const origin = new URL(config.APP_ORIGIN).origin;
const secure = origin.startsWith('https:');
const cookieName = 'escada_session';
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        upgradeInsecureRequests: secure ? [] : null,
      },
    },
  }),
);
app.use(express.json({ limit: '256kb' }));
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== origin)
    return res.status(403).json({ error: 'Origem não autorizada.' });
  next();
});
function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
async function limited(key: string, max: number, seconds = 900) {
  const now = new Date();
  const count = await db.$transaction(async (tx) => {
    await tx.rateLimit.deleteMany({ where: { key, expiresAt: { lt: now } } });
    return tx.rateLimit.upsert({
      where: { key },
      create: {
        key,
        count: 1,
        expiresAt: new Date(Date.now() + seconds * 1000),
      },
      update: { count: { increment: 1 } },
    });
  });
  if (count.count > max) fail(429, 'Demasiadas tentativas. Tenta mais tarde.');
}
const auth: express.RequestHandler = async (req, res, next) => {
  try {
    const cookie = req.headers.cookie
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (!cookie) fail(401, 'Inicia sessão.');
    const session = await db.session.findUnique({
      where: { tokenHash: digest(cookie) },
      include: { admin: true, player: true },
    });
    if (!session || session.expiresAt < new Date())
      fail(401, 'Sessão expirada.');
    res.locals.session = session;
    next();
  } catch (e) {
    next(e);
  }
};
const admin: express.RequestHandler = (req, res, next) => {
  if (!res.locals.session?.adminId)
    return res.status(403).json({ error: 'Acesso reservado à organização.' });
  next();
};
async function session(
  res: express.Response,
  ids: { adminId?: string; playerId?: string },
) {
  const token = randomToken();
  await db.session.create({
    data: {
      tokenHash: digest(token),
      ...ids,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    maxAge: 7 * 86400000,
    path: '/',
  });
}
async function enqueue(
  recipient: string,
  text: string,
  kind: string,
  expires = 86400000,
) {
  return db.outbox.create({
    data: {
      recipient,
      encryptedBody: encrypt(text, config.MESSAGE_KEY),
      kind,
      expiresAt: new Date(Date.now() + expires),
    },
  });
}
const publicPlayer = (p: {
  id: string;
  name: string;
  phone: string;
  birth: Date;
  side: string;
  division: string;
  status: string;
  verified: boolean;
  note: string;
}) => ({ ...p, birth: p.birth.toISOString().slice(0, 10) });
async function snapshot() {
  const pending=(await vacancies()).filter(v=>v.status==='pending');
  const [players, courts, games, revision, audit] = await Promise.all([
    db.player.findMany({ orderBy: { createdAt: 'asc' } }),
    db.court.findMany(),
    db.game.findMany({ orderBy: [{ round: 'asc' }, { time: 'asc' }] }),
    db.revision.findUnique({ where: { id: 1 } }),
    db.audit.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  return {
    players: players.map(publicPlayer),
    courts,
    games: games.map(({ courtId, ...g }) => ({ ...g, court: courtId, absentIds:pending.filter(v=>v.gameIds.includes(g.id)).map(v=>v.playerId) })),
    revision: revision?.value ?? 0,
    audit: audit.map((a) => a.action),
  };
}
app.get('/api/health', async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ ok: true });
});
app.post('/api/login', async (req, res) => {
  await limited(`admin:${req.ip}`, 10);
  const { email, password } = z
    .object({ email: z.email(), password: z.string().max(256) })
    .parse(req.body);
  const user = await db.admin.findUnique({
    where: { email: email.toLowerCase() },
  });
  const valid = checkPassword(
    password,
    user?.passwordHash ?? dummyPasswordHash,
  );
  if (!user || !valid) fail(401, 'Credenciais incorretas.');
  await session(res, { adminId: user.id });
  res.json({ ok: true });
});
app.post('/api/logout', auth, async (_req, res) => {
  await db.session.delete({
    where: { tokenHash: res.locals.session.tokenHash },
  });
  res.clearCookie(cookieName, { path: '/' });
  res.json({ ok: true });
});
app.get('/api/me', auth, (_req, res) => {
  const s = res.locals.session;
  res.json({
    role: s.adminId ? 'admin' : 'player',
    name: s.admin?.email ?? s.player?.name,
    status: s.player?.status,
  });
});
app.get('/api/admin/state', auth, admin, async (_req, res) =>
  res.json(await snapshot()),
);
installInviteSending(app, auth, admin, () => wa.status === 'connected');
app.post('/api/admin/invites', auth, admin, async (_req, res) => {
  const token = randomToken();
  await db.invite.create({
    data: {
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  res.json({ url: `${origin}/inscricao?convite=${token}`, expiresDays: 7 });
});
const playerSchema = z.object({
  id: z.string().max(64),
  name: z.string().trim().min(2).max(100),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  birth: z.iso
    .date()
    .refine(
      (v) => v >= '1900-01-01' && v < new Date().toISOString().slice(0, 10),
    ),
  side: z.enum(['Esquerda', 'Direita']),
  division: z.enum(['M1+', 'M1', 'M2+', 'M2']),
  status: z.enum(['Ativo', 'Pendente', 'Inativo', 'Rejeitado']),
  verified: z.boolean(),
  note: z.string().max(500),
});
app.post('/api/register', async (req, res) => {
  await limited(`register:${req.ip}`, 10, 3600);
  if (wa.status !== 'connected')
    fail(
      503,
      'As inscrições estão temporariamente indisponíveis: WhatsApp desligado.',
    );
  const input = playerSchema
    .pick({ name: true, phone: true, birth: true, side: true, division: true })
    .extend({ invite: z.string().min(40).max(100) })
    .parse(req.body);
  const token = digest(input.invite);
  const id = await db.$transaction(async (tx) => {
    const invite = await tx.invite.findUnique({ where: { tokenHash: token } });
    if (!invite || invite.usedAt || invite.expiresAt < new Date())
      fail(400, 'Convite inválido ou expirado.');
    const target = await tx.setting.findUnique({where:{key:'invite-target:'+token}});
    if(target && target.value !== input.phone) fail(400, 'Este convite foi enviado para outro número de WhatsApp.');
    const claimed = await tx.invite.updateMany({
      where: { id: invite.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (!claimed.count) fail(409, 'Este convite já foi usado.');
    const p = await tx.player.create({
      data: {
        name: input.name,
        phone: input.phone,
        birth: new Date(input.birth),
        side: input.side,
        division: input.division,
      },
    });
    await tx.revision.update({
      where: { id: 1 },
      data: { value: { increment: 1 } },
    });
    return p.id;
  });
  await sendCode(id);
  res.json({ playerId: id });
});
async function sendCode(playerId: string) {
  const p = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  const code = String(randomInt(100000, 1000000));
  await db.$transaction(async (tx) => {
    await tx.verificationCode.updateMany({
      where: { playerId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await tx.verificationCode.create({
      data: {
        playerId,
        digest: codeDigest(playerId, code, config.SESSION_SECRET),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    await tx.outbox.create({
      data: {
        recipient: `${p.phone.slice(1)}@s.whatsapp.net`,
        encryptedBody: encrypt(
          `Escada: o teu código é ${code}. Expira em 10 minutos. Não o partilhes.`,
          config.MESSAGE_KEY,
        ),
        kind: 'verification',
        expiresAt: new Date(Date.now() + 600000),
      },
    });
  });
}
app.post('/api/code', async (req, res) => {
  await limited(`code:${req.ip}`, 10);
  const { phone } = z
    .object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/) })
    .parse(req.body);
  await limited(`phone:${digest(phone)}`, 3, 600);
  const p = await db.player.findUnique({ where: { phone } });
  if (!p) fail(404, 'Número não registado. Pede um convite à organização para fazer a inscrição.');
  if (wa.status !== 'connected')
    fail(503, 'WhatsApp desligado. Tenta mais tarde.');
  await sendCode(p!.id);
  res.json({ ok: true });
});
app.post('/api/verify', async (req, res) => {
  await limited(`verify:${req.ip}`, 20);
  const { phone, code } = z
    .object({ phone: z.string(), code: z.string().regex(/^\d{6}$/) })
    .parse(req.body);
  const p = await db.player.findUnique({ where: { phone } });
  if (!p) fail(400, 'Código inválido ou expirado.');
  const result = await db.$transaction(async (tx) => {
    const c = await tx.verificationCode.findFirst({
      where: { playerId: p.id, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!c || c.expiresAt < new Date() || c.attempts >= 5) return false;
    const attempt = await tx.verificationCode.updateMany({
      where: { id: c.id, attempts: { lt: 5 }, consumedAt: null },
      data: { attempts: { increment: 1 } },
    });
    if (!attempt.count) return false;
    if (c.digest !== codeDigest(p.id, code, config.SESSION_SECRET))
      return false;
    const used = await tx.verificationCode.updateMany({
      where: { id: c.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (!used.count) return false;
    await tx.player.update({ where: { id: p.id }, data: { verified: true } });
    await tx.revision.update({
      where: { id: 1 },
      data: { value: { increment: 1 } },
    });
    return true;
  });
  if (!result) fail(400, 'Código inválido ou expirado.');
  await session(res, { playerId: p.id });
  res.json({ ok: true, status: p.status });
});
app.get('/api/admin/whatsapp', auth, admin, async (_req, res) => {
  const group = await db.setting.findUnique({
    where: { key: 'whatsapp_group' },
  });
  const groupName = await db.setting.findUnique({ where: { key: 'whatsapp_group_name' } });
  res.json({ status: wa.status, lastError: wa.lastError ?? wa.sendingPausedReason, qr: wa.qr, groupId: group?.value ?? null,
    groupName: groupName?.value ?? null, account: wa.account,
    connectedAt: wa.status === 'connected' ? wa.connectedAt : null });
});
app.post('/api/admin/whatsapp/test', auth, admin, async (req, res) => {
  const { phone, message } = z.object({
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
    message: z.string().trim().min(1).max(1000),
  }).parse(req.body);
  await limited('whatsapp:test', 5, 60);
  if (wa.status !== 'connected') fail(409, 'Liga o WhatsApp antes de enviar o teste.');
  try {
    res.json(await wa.sendTest(phone, message));
  } catch {
    fail(wa.sendingPausedReason ? 409 : 502, wa.sendingPausedReason ?? 'Não foi possível confirmar o envio. Verifica o estado da mensagem antes de repetir.');
  }
});
app.post('/api/admin/whatsapp/connect', auth, admin, async (_req, res) => {
  await wa.connect();
  res.json({ status: wa.status });
});
app.post('/api/admin/whatsapp/disconnect', auth, admin, async (_req, res) => {
  await wa.disconnect();
  res.json({ status: wa.status });
});
app.get('/api/admin/whatsapp/groups', auth, admin, async (_req, res) =>
  res.json(await wa.groups()),
);
app.post('/api/admin/whatsapp/group', auth, admin, async (req, res) => {
  const { id } = z.object({ id: z.string().regex(/@g\.us$/) }).parse(req.body);
  await wa.selectGroup(id);
  res.json({ ok: true });
});
app.get('/api/admin/messages', auth, admin, async (_req, res) => {
  res.json(
    await db.outbox.findMany({
      select: {
        id: true,
        recipient: true,
        kind: true,
        status: true,
        attempts: true,
        createdAt: true,
        sentAt: true,
        nextAttemptAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  );
});
app.get('/api/admin/message-delivery', auth, admin, async (_req,res) => {
  const row=await db.setting.findUnique({where:{key:'message_delivery'}});
  res.json(row?JSON.parse(row.value):{mode:'immediate',hoursBefore:24});
});
app.post('/api/admin/messages/:id/retry-welcome', auth, admin, async (req,res) => {
  const id=z.string().uuid().parse(req.params.id);
  z.object({confirmNotReceived:z.literal(true)}).parse(req.body);
  try { res.json(await retryWelcome(id)); }
  catch(error) { fail(409,(error as Error).message); }
});
app.put('/api/admin/message-delivery', auth, admin, async (req,res) => {
  const setting=z.object({mode:z.enum(['immediate','scheduled']),hoursBefore:z.number().int().min(1).max(168)}).parse(req.body);
  await db.setting.upsert({where:{key:'message_delivery'},create:{key:'message_delivery',value:JSON.stringify(setting)},update:{value:JSON.stringify(setting)}});
  res.json(setting);
});
app.post('/api/admin/messages/:id/cancel', auth, admin, async (req,res) => {
  const id=z.string().min(1).max(100).parse(req.params.id);
  const cancelled=await db.outbox.updateMany({where:{id,kind:'round',status:'pending'},data:{status:'cancelled',encryptedBody:''}});
  if(!cancelled.count) fail(409,'Esta mensagem já não pode ser cancelada. Atualiza o estado.');
  res.json({ok:true});
});
app.get('/api/games', auth, async (_req, res) => {
  const s = res.locals.session;
  if (!s.player?.verified || s.player.status !== 'Ativo')
    fail(403, 'A inscrição ainda não foi aprovada.');
  const games = await db.game.findMany({
    where: { published: true },
    include: { court: { select: { name: true, location: true } } },
    orderBy: [{ date: 'desc' }, { time: 'asc' }],
  });
  const people = await db.player.findMany({
    select: { id: true, name: true, side: true },
  });
  const pending=(await vacancies()).filter(v=>v.status==='pending');
  res.json({ playerId: s.playerId, people, games:games.map(g=>({...g,absentIds:pending.filter(v=>v.gameIds.includes(g.id)).map(v=>v.playerId)})) });
});
app.post('/api/games/:id/result', auth, async (req, res) => {
  const s = res.locals.session;
  if (!s.player?.verified || s.player.status !== 'Ativo') fail(403, 'A inscrição ainda não foi aprovada.');
  const { outcome } = z.object({ outcome: z.enum(['win', 'loss']) }).parse(req.body);
  const id = z.string().min(1).max(100).parse(req.params.id);
  const winner = await db.$transaction(async tx => {
    // Use the same lock as the backoffice: an old admin snapshot must never overwrite a player's result.
    await tx.revision.update({ where: { id: 1 }, data: { value: { increment: 1 } } });
    const player = await tx.player.findUnique({ where: { id: s.playerId } });
    if (!player?.verified || player.status !== 'Ativo') fail(403, 'A inscrição não está ativa.');
    const game = await tx.game.findUnique({ where: { id } });
    if (game && await tx.setting.findUnique({where:{key:'competition:month:'+game.date.slice(0,7)}})) fail(409, 'O mês deste jogo já foi encerrado.');
    if((await vacancies(tx)).some(v=>v.status==='pending'&&v.gameIds.includes(id)))fail(409,'Este jogo aguarda um suplente aprovado pela organização.');
    const winner = resultWinner(game, s.playerId, outcome, new Date().toISOString().slice(0, 10));
    await tx.game.update({ where: { id }, data: { winner } });
    await tx.audit.create({ data: { actor: s.playerId, action: `${player.name} registou ${outcome === 'win' ? 'vitória' : 'derrota'} no jogo ${id} (${game!.date}, ${game!.division}).` } });
    return winner;
  });
  res.json({ ok: true, winner });
});
const dummyPasswordHash = hashPassword(randomToken());
await syncEnvironmentAdmin();
await db.revision.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
await db.outbox.updateMany({
  where: { status: 'sending' },
  data: { status: 'uncertain' },
});
installRules(app, auth, admin);
installSubstitutions(app, auth, admin);
installAdminState(app, auth, admin, wa, snapshot);
installOpenAI(app, auth, admin);
installAI(app, auth, admin);
installCalendar(app, auth, admin);
app.get('/api/admin/competition', auth, admin, async (_req,res) => {
  const rows=await db.setting.findMany({where:{key:{startsWith:'competition:'}},orderBy:{key:'desc'}});
  res.json({months:rows.filter(r=>r.key.startsWith('competition:month:')).map(r=>JSON.parse(r.value)),movements:rows.filter(r=>r.key.startsWith('competition:move:')).map(r=>JSON.parse(r.value)),status:JSON.parse(rows.find(r=>r.key==='competition:status')?.value??'null'),anchor:JSON.parse(rows.find(r=>r.key==='competition:anchor')?.value??'null')});
});
app.use(express.static(resolve('web')));
app.get('/{*path}', (_req, res) => res.sendFile(resolve('web/index.html')));
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof z.ZodError)
      return res
        .status(400)
        .json({ error: 'Dados inválidos. Revê os campos.' });
    const e = error as { status?: number; message?: string; code?: string };
    if (e.code === 'P2002')
      return res.status(409).json({ error: 'Este registo já existe.' });
    res
      .status(e.status ?? 500)
      .json({
        error: e.status
          ? e.message
          : 'Não foi possível concluir. Tenta novamente.',
      });
  },
);
const timer = setInterval(() => {
  void wa.deliver().catch(() => {});
}, 2000);
let competitionRunning=false;
const tickCompetition=async()=>{if(competitionRunning)return;competitionRunning=true;try{await runCompetition();}catch{console.error('Não foi possível processar o calendário da competição.');}finally{competitionRunning=false;}};
const competitionTimer=setInterval(()=>void tickCompetition(),60000);
void tickCompetition();
const cleanup = setInterval(() => {
  void db.outbox
    .updateMany({
      where: {
        expiresAt: { lt: new Date() },
        status: { in: ['pending', 'uncertain'] },
      },
      data: { status: 'expired', encryptedBody: '' },
    })
    .catch(() => {});
}, 60000);
const server = app.listen(config.PORT, config.HOST, () =>
  console.log(`Escada disponível em ${config.APP_ORIGIN}`),
);
if (config.WA_AUTO_CONNECT === 'true') await wa.connect();
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    clearInterval(timer);
    clearInterval(competitionTimer);
    clearInterval(cleanup);
    void wa
      .disconnect()
      .catch(() => console.error('WhatsApp: falha ao concluir a gravação da sessão durante o encerramento.'))
      .finally(() =>
        server.close(
          () => void db.$disconnect().finally(() => process.exit(0)),
        ),
      );
  });
