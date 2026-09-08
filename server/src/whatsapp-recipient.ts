// Only use WhatsApp's own persisted PN/LID mapping; never derive a LID from a phone.
export async function resolveRecipient(jid: string, getLIDForPN: (pn:string)=>Promise<string | null | undefined>) {
  if (!jid.endsWith('@s.whatsapp.net')) return jid;
  const mapped = await getLIDForPN(jid);
  return mapped && /^\d+@lid$/.test(mapped) ? mapped : jid;
}
