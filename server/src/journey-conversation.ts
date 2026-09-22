import type {GroupContext} from './group-context.ts';
import {botEnabled} from './ai-bot.ts';
import {resolveJourneyReference} from './journey-reference.ts';
import { db } from './db.ts';
import { config } from './config.ts';
import { decrypt, encrypt, digest } from './security.ts';
import { interpretParticipation } from './journey-ai.ts';
import { listJourneys, handleJourney } from './journeys.ts';
const serial = new Map<string, Promise<unknown>>();
export async function handleJourneyConversation(
  group: string,
  phone: string,
  text: string,
  eventId: string,
  quotedId?: string,
  groupConversation?: GroupContext,
) {
  const serialKey = digest(group + phone);
  const work = (serial.get(serialKey) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      if (!await botEnabled()) return true;
      const player = await db.player.findUnique({ where: { phone } });
      if (!player?.verified || player.status !== 'Ativo') return false;
      const journeys = (await listJourneys()).filter(
        (j) =>
          j.group === group &&
          new Date(j.date + 'T' + j.time + ':00+01:00') > new Date(),
      );

      if (
        await db.setting.findUnique({
          where: { key: 'journey-event:' + digest(group + ':' + eventId) },
        })
      )
        return true;
      const memoryKey = 'journey-memory:' + serialKey;
      const memory = await db.setting.findUnique({ where: { key: memoryKey } });
      let history: unknown = null;
      if (memory) {
        try {
          const m = JSON.parse(decrypt(memory.value, config.MESSAGE_KEY));
          if (m.expires > Date.now()) history = m;
        } catch {}
      }
      let processed = false;
      try {
        const key = await db.setting.findUnique({
          where: { key: 'openai_key' },
        });
        if (!key) throw Error();
        const rateKey =
          'journey-ai:' +
          serialKey +
          ':' +
          new Date().toISOString().slice(0, 16);
        const rate = await db.rateLimit.upsert({
          where: { key: rateKey },
          create: {
            key: rateKey,
            count: 1,
            expiresAt: new Date(Date.now() + 120000),
          },
          update: { count: { increment: 1 } },
        });
        if (rate.count > 8) throw Error();
        const quoted = quotedId ? await resolveJourneyReference(db,group,quotedId,journeys) : null;
        const decision = await interpretParticipation(
          decrypt(key.value, config.MESSAGE_KEY),
          text,
          {
            authorName: player.name,
            authorId: groupConversation?.currentMessage.authorId,
            groupConversation,
            division: player.division,
            today: new Date().toISOString(),
            quotedJourney: quoted,
            history,
            journeys: journeys.map((j) => ({
              id: j.id,
              division: j.division,
              date: j.date,
              time: j.time,
              status: j.status,
              enrolled:
                j.confirmed.includes(player.id) ||
                j.waiting.includes(player.id),
            })),
          },
          journeys.map((j) => j.id),
        );
        if (!await botEnabled()) return true;
        if (decision.action === 'silent') {
          await db.setting.deleteMany({where:{key:memoryKey}});
          return true;
        }
        if (decision.action === 'none') {
          await db.setting.deleteMany({ where: { key: memoryKey } });
          return false;
        }
        const handled = await handleJourney(
          group,
          phone,
          text,
          eventId,
          quotedId,
          decision,
        );
        processed = handled;
        if (
          decision.action === 'clarify' ||
          (!decision.journeyId && !quoted)
        ) {
          const value = encrypt(
            JSON.stringify({
              text,
              action: decision.action,
              expires: Date.now() + 300000,
            }),
            config.MESSAGE_KEY,
          );
          await db.setting.upsert({
            where: { key: memoryKey },
            create: { key: memoryKey, value },
            update: { value },
          });
        } else await db.setting.deleteMany({ where: { key: memoryKey } });
        return handled;
      } catch {
        if (processed || !await botEnabled()) return true;
        console.error('Não foi possível classificar a mensagem do grupo; nenhuma resposta automática preparada.');
        return true;
      }
    });
  serial.set(serialKey, work);
  try {
    return (await work) as boolean;
  } finally {
    if (serial.get(serialKey) === work) serial.delete(serialKey);
  }
}
