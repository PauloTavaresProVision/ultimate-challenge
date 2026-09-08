export function mentionedReply(text:string, phone:string) {
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Número inválido para menção.');
  return {text:`@${phone.slice(1)} ${text}`,mentions:[`${phone.slice(1)}@s.whatsapp.net`]};
}
export function decodeBotMessage(body:string) {
  try {
    const data=JSON.parse(body);
    if(data.format==='mentioned-reply-v1' && typeof data.text==='string' && Array.isArray(data.mentions) && data.mentions.every((jid:unknown)=>typeof jid==='string'&&/^\d+@s\.whatsapp\.net$/.test(jid)))return {text:data.text,mentions:data.mentions as string[]};
  } catch {}
  return {text:body};
}
