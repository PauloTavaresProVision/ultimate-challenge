import { db } from './db.ts';
import { deliveryStatus } from './delivery-status.ts';
export function reminderEligible(
  status: string,
  registered: boolean,
  queued: boolean,
) {
  return !registered && !queued && ['delivered', 'read'].includes(status);
}
export async function reminderCandidates() {
  const invitations = await db.outbox.findMany({
    where: { kind: 'invitation' },
    distinct: ['recipient'],
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, recipient: true, status: true },
  });
  const players = new Set(
    (await db.player.findMany({ select: { phone: true } })).map((p) => p.phone),
  );
  const queued = new Set(
    (
      await db.outbox.findMany({
        where: {
          kind: 'invitation_reminder',
          status: { in: ['pending', 'sending'] },
          expiresAt: { gt: new Date() },
        },
        select: { recipient: true },
      })
    ).map((r) => r.recipient),
  );
  const result = [];
  for (const row of invitations) {
    const phone = '+' + row.recipient.split('@')[0];
    if (
      players.has(phone) ||
      queued.has(row.recipient) ||
      row.status === 'cancelled'
    )
      continue;
    const delivery = await deliveryStatus(row.id, row.status);
    if (reminderEligible(delivery, false, false))
      result.push({ id: row.id, phone, delivery });
  }
  return result;
}
export async function reminderStillEligible(recipient: string) {
  if (
    await db.player.findUnique({
      where: { phone: '+' + recipient.split('@')[0] },
      select: { id: true },
    })
  )
    return false;
  const latest = await db.outbox.findFirst({
    where: { kind: 'invitation', recipient },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, status: true },
  });
  return (
    !!latest &&
    reminderEligible(
      await deliveryStatus(latest.id, latest.status),
      false,
      false,
    )
  );
}
