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
  const excluded=paused?['invitation','invitation_reminder']:[];
  const manual=await tx.setting.findUnique({where:{key:'group-manual-next-send'}});
  if(Number(manual?.value??0)>now.getTime()||await tx.outbox.count({where:{kind:'group_manual',status:'sending'}}))excluded.push('group_manual');
  const query=()=>tx.outbox.findFirst({where:{status:'pending',expiresAt:{gt:now},nextAttemptAt:{lte:now},...(excluded.length?{kind:{notIn:excluded}}:{})},orderBy:[{createdAt:'asc'},{id:'asc'}]});
  let row=await query();
  if(row?.kind==='journey_roster'&&await tx.groupInbox.count({where:{group:row.recipient,status:'pending'}})){
    excluded.push('journey_roster');
    row=await query();
  }
  if(!row)return null;
  const claim=await tx.outbox.updateMany({where:{id:row.id,status:'pending'},data:{status:'sending',attempts:{increment:1}}});
  if(!claim.count)return null;
  if(['invitation','invitation_reminder'].includes(row.kind))await tx.setting.upsert({where:{key},create:{key,value:String(now.getTime()+invitationIntervalMs)},update:{value:String(now.getTime()+invitationIntervalMs)}});
  if(row.kind==='group_manual')await tx.setting.upsert({where:{key:'group-manual-next-send'},create:{key:'group-manual-next-send',value:String(now.getTime()+5000)},update:{value:String(now.getTime()+5000)}});
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
