// Errors override server acceptance, but never downgrade a confirmed delivery.
export function nextReceipt(previous: number | null, incoming: number) {
  if (previous === null) return incoming;
  if (previous >= 3) return Math.max(previous, incoming);
  if (incoming === 0 || previous === 0 && incoming < 3) return 0;
  return Math.max(previous, incoming);
}
