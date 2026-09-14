import {resolveJourneyReference} from './journey-reference.ts';
import { db } from './db.ts';
import { config } from './config.ts';
import { decrypt, encrypt, digest } from './security.ts';
import { interpretParticipation } from './journey-ai.ts';
import { listJourneys, handleJourney } from './journeys.ts';
import { mentionedReply } from './bot-message.ts';
const serial = new Map<string, Promise<unknown>>();
export async function handleJourneyConversation(
  group: string,
  phone: string,
  text: string,
  eventId: string,
  quotedId?: string,
) {
  const serialKey = digest(group + phone);
  const work = (serial.get(serialKey) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const player = await db.player.findUnique({ where: { phone } });
      if (!player?.verified || player.status !== 'Ativo') return false;
      const journeys = (await listJourneys()).filter(
        (j) =>
          j.group === group &&
          new Date(j.date + 'T' + j.time + ':00+01:00') > new Date(),
      );
      if (!journeys.length) return false;
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
        if (decision.action === 'silent') return true;
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
        if (processed) return true;
        await db.outbox.create({
          data: {
            recipient: group,
            kind: 'journey_reply',
            encryptedBody: encrypt(
              JSON.stringify({
                format: 'mentioned-reply-v1',
                ...mentionedReply(
                  'Não consegui interpretar a mensagem agora. Não alterei a tua inscrição. Tenta novamente dentro de instantes.',
                  phone,
                ),
              }),
              config.MESSAGE_KEY,
            ),
            expiresAt: new Date(Date.now() + 300000),
          },
        });
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
