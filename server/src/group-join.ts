import type { WASocket } from '@whiskeysockets/baileys';
import { jidNormalizedUser } from '@whiskeysockets/baileys';
export async function joinApprovedPlayer(socket: Pick<WASocket,'groupMetadata'|'groupParticipantsUpdate'>, group:string, phoneJid:string) {
  const metadata=await socket.groupMetadata(group);
  const normalize=(jid:string)=>jidNormalizedUser(jid);
  const present=()=>metadata.participants.some(p=>[p.id,p.phoneNumber].some(jid=>jid && normalize(jid)===normalize(phoneJid)));
  if(present())return 'already_member' as const;
  const results=await socket.groupParticipantsUpdate(group,[phoneJid],'add');
  const result=results[0];
  if(result?.status==='200')return 'added' as const;
  // Explicit rejection permits an invitation; transport failures remain uncertain.
  if(result && ['403','409'].includes(result.status)) {
    const fresh=await socket.groupMetadata(group);
    if(fresh.participants.some(p=>[p.id,p.phoneNumber].some(jid=>jid && normalize(jid)===normalize(phoneJid))))return 'already_member' as const;
    return 'invite' as const;
  }
  throw new Error('Não foi possível confirmar a entrada no grupo.');
}
