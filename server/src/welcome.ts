import {db} from './db.ts';
import {config} from './config.ts';
import {encrypt,digest,phoneFromJid} from './security.ts';
import {welcomeText,activeWelcomeJourneys} from './welcome-message.ts';
export {welcomeText} from './welcome-message.ts';
import type {Prisma} from './generated/prisma/client.ts';
async function journeyContext(tx:Prisma.TransactionClient,group:string,division:string){
 const rows=await tx.setting.findMany({where:{key:{startsWith:'journey:'}}});
 return activeWelcomeJourneys(rows.map(r=>JSON.parse(r.value)),group,division);
}
async function linkJourney(tx:Prisma.TransactionClient,id:string,journeys:Array<{id:string}>){
 await tx.setting.deleteMany({where:{key:'journey-message:'+id}});
 if(journeys.length===1)await tx.setting.create({data:{key:'journey-message:'+id,value:journeys[0].id}});
}
export async function retryWelcome(id:string){
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`welcome-retry:${id}`}))`;
  const row=await tx.outbox.findUnique({where:{id}});
  if(!row||row.kind!=='welcome'||row.status!=='uncertain')throw new Error('Estas boas-vindas já não estão disponíveis para reenvio.');
  const group=await tx.setting.findUnique({where:{key:'whatsapp_group'}});
  if(group?.value!==row.recipient)throw new Error('O grupo associado mudou. O reenvio foi impedido.');
  const reference=await tx.setting.findFirst({where:{key:{startsWith:'welcome:'},value:id}});
  const players=await tx.player.findMany({where:{status:'Ativo',verified:true}});
  const player=players.find(p=>reference?.key==='welcome:'+digest(row.recipient+':'+p.id));
  if(!player)throw new Error('O jogador já não tem uma inscrição ativa.');
  const journeys=await journeyContext(tx,row.recipient,player.division);
  const updated=await tx.outbox.updateMany({where:{id,status:'uncertain'},data:{status:'pending',encryptedBody:encrypt(welcomeText(player,config.APP_ORIGIN,journeys),config.MESSAGE_KEY),sentAt:null,nextAttemptAt:new Date(),expiresAt:new Date(Date.now()+86400000)}});
  if(!updated.count)throw new Error('O estado da mensagem mudou. Atualiza a lista.');
  await linkJourney(tx,id,journeys);
  return {ok:true,playerName:player.name};
 });
}
export async function queueWelcome(group:string,jids:string[]){
 const phones=[...new Set(jids.map(phoneFromJid).filter((p):p is string=>!!p))];
 if(!phones.length)return;
 await db.$transaction(async tx=>{
  const selected=await tx.setting.findUnique({where:{key:'whatsapp_group'}});
  if(selected?.value!==group)return;
  const players=await tx.player.findMany({where:{phone:{in:phones},status:'Ativo',verified:true}});
  for(const player of players){
   const key='welcome:'+digest(group+':'+player.id);
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
   if(await tx.setting.findUnique({where:{key}}))continue;
   const journeys=await journeyContext(tx,group,player.division);
   const row=await tx.outbox.create({data:{recipient:group,kind:'welcome',encryptedBody:encrypt(welcomeText(player,config.APP_ORIGIN,journeys),config.MESSAGE_KEY),expiresAt:new Date(Date.now()+86400000)}});
   await linkJourney(tx,row.id,journeys);
   await tx.setting.create({data:{key,value:row.id}});
  }
 });
}
