import {db} from './db.ts';
import {mergeM2Journeys} from '../../lib/merge-m2.ts';
import {luandaToday} from '../../lib/competition-cycle.ts';
import {normalizeCalendar} from '../../lib/weekly-calendar.ts';
import {decrypt,encrypt} from './security.ts';
import {config} from './config.ts';
import {journeyRoster} from '../../lib/journey-roster.ts';
import type {Journey} from '../../lib/journey.ts';

export async function mergeM2(apply=false){
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Revision" WHERE id = 1 FOR UPDATE`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('journeys'))`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('invitation-delivery'))`;
  const key='migration:m2-to-m2plus-v1';
  const prior=await tx.setting.findUnique({where:{key}});
  if(prior)return {alreadyApplied:true,report:JSON.parse(prior.value).report};
  const today=luandaToday();
  const rows=await tx.setting.findMany({where:{OR:[{key:{startsWith:'journey:'}},{key:{startsWith:'journey-message:'}},{key:'weekly-calendar'}]}});
  const journeys=rows.filter(r=>r.key.startsWith('journey:')).map(r=>JSON.parse(r.value) as Journey);
  const plan=mergeM2Journeys(journeys,today);
  const players=await tx.player.findMany({select:{id:true,name:true,division:true}});
  const moving=players.filter(p=>p.division==='M2');
  const relevantDates=plan.original.map(j=>j.date);
  if(await tx.game.count({where:{date:{gte:today},OR:[{division:'M2'},{division:'M2+',date:{in:relevantDates}}]}}))
   throw Error('Já existem jogos M2/M2+ preparados para uma das datas a unir. É necessário rever esse sorteio antes de migrar; nada foi alterado.');
  const affected=new Set([...plan.original.map(j=>j.id),...plan.changed.map(j=>j.id)]);
  const mapping=new Map(rows.filter(r=>r.key.startsWith('journey-message:')).map(r=>[r.key.slice('journey-message:'.length),r.value]));
  for(const j of journeys)if(j.announcementId)mapping.set(j.announcementId,j.id);
  const messages=await tx.outbox.findMany({where:{id:{in:[...mapping].filter(([,id])=>affected.has(id)).map(([id])=>id)},status:{in:['pending','sending','uncertain']}}});
  if(messages.some(m=>m.status!=='pending'||m.attempts>0))throw Error('Há mensagens destas jornadas em envio ou por confirmar. Aguarda a conclusão antes de unir. Nada alterado.');
  const report={players:moving.map(p=>p.name),journeys:plan.changed.map(j=>({id:j.id,date:j.date,time:j.time,confirmed:j.confirmed.length,waiting:j.waiting.length,capacity:j.capacity,courts:j.courtIds.length,additionalCourtsRequired:Math.max(0,Math.ceil(j.confirmed.length/4)-j.courtIds.length)})),merged:plan.aliases};
  if(!apply)return {preview:true,report};
  // Save recoverable before-images in the same transaction as the changes.
  await tx.setting.create({data:{key,value:JSON.stringify({at:new Date().toISOString(),players:moving,settings:rows.filter(r=>r.key==='weekly-calendar'||r.key.startsWith('journey:')&&affected.has(r.key.slice(8))||r.key.startsWith('journey-message:')&&affected.has(r.value)),messages,report})}});
  await tx.player.updateMany({where:{division:'M2'},data:{division:'M2+'}});
  for(const j of plan.changed)await tx.setting.update({where:{key:'journey:'+j.id},data:{value:JSON.stringify(j)}});
  for(const [from,to] of Object.entries(plan.aliases)){
   await tx.setting.updateMany({where:{key:{startsWith:'journey-message:'},value:from},data:{value:to}});
   const announcement=journeys.find(j=>j.id===from)?.announcementId;
   if(announcement)await tx.setting.upsert({where:{key:'journey-message:'+announcement},create:{key:'journey-message:'+announcement,value:to},update:{value:to}});
   await tx.setting.upsert({where:{key:'journey-alias:'+from},create:{key:'journey-alias:'+from,value:to},update:{value:to}});
   await tx.setting.delete({where:{key:'journey:'+from}});
  }
  for(const m of messages){
   const old=mapping.get(m.id)!;
   const j=plan.journeys.find(j=>j.id===(plan.aliases[old]??old))!;
   const body=decrypt(m.encryptedBody,config.MESSAGE_KEY);
   let updated=body.replace(/M2(?!\+)/g,'M2+');
   if(['journey_roster','journey_announcement'].includes(m.kind))updated=journeyRoster(j,players);
   await tx.outbox.update({where:{id:m.id},data:{encryptedBody:encrypt(updated,config.MESSAGE_KEY)}});
  }
  const calendarRow=rows.find(r=>r.key==='weekly-calendar');
  const calendar=normalizeCalendar(calendarRow?JSON.parse(calendarRow.value):null);
  calendar.divisions.M2.enabled=false;calendar.divisions['M2+'].enabled=true;
  await tx.setting.upsert({where:{key:'weekly-calendar'},create:{key:'weekly-calendar',value:JSON.stringify(calendar)},update:{value:JSON.stringify(calendar)}});
  await tx.audit.create({data:{actor:'admin',action:`M2 unido ao M2+: ${moving.length} jogadores, ${plan.original.length} jornadas transferidas. Todos os confirmados mantidos; histórico preservado.`}});
  await tx.revision.update({where:{id:1},data:{value:{increment:1}}});
  return {applied:true,report};
 },{timeout:30000});
}
