import {db} from './db.ts';
import {pauseKey} from './whatsapp-pause.ts';
export const invitationIntervalMs=30000;
const key='invitation-next-send';
export async function claimDelivery(now=new Date()){
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('invitation-delivery'))`;
  if((await tx.setting.findUnique({where:{key:pauseKey}}))?.value==='true')return null;
  const state=await tx.setting.findUnique({where:{key}});
  const inFlight=await tx.outbox.count({where:{kind:{in:['invitation','invitation_reminder']},status:'sending'}});
  const paused=!!inFlight||!!state&&Number(state.value)>now.getTime();
  const row=await tx.outbox.findFirst({where:{status:'pending',expiresAt:{gt:now},nextAttemptAt:{lte:now},...(paused?{kind:{notIn:['invitation','invitation_reminder']}}:{})},orderBy:[{createdAt:'asc'},{id:'asc'}]});
  if(!row)return null;
  const claim=await tx.outbox.updateMany({where:{id:row.id,status:'pending'},data:{status:'sending',attempts:{increment:1}}});
  if(!claim.count)return null;
  if(['invitation','invitation_reminder'].includes(row.kind))await tx.setting.upsert({where:{key},create:{key,value:String(now.getTime()+invitationIntervalMs)},update:{value:String(now.getTime()+invitationIntervalMs)}});
  return row;
 });
}
// Count from completion as well: slow sends must never cause a catch-up burst.
export async function finishInvitation(now=new Date()){
 await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('invitation-delivery'))`;
  const state=await tx.setting.findUnique({where:{key}});
  const value=String(Math.max(Number(state?.value??0),now.getTime()+invitationIntervalMs));
  await tx.setting.upsert({where:{key},create:{key,value},update:{value}});
 });
}
