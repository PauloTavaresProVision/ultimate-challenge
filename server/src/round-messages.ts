import type {Express,RequestHandler} from 'express';
import type {Prisma} from './generated/prisma/client.ts';
import {z} from 'zod';
import {db} from './db.ts';
import {config} from './config.ts';
import {encrypt,decrypt} from './security.ts';
import {roundAnnouncement} from './round-announcement.ts';
import {deliveryStatus} from './delivery-status.ts';
import {vacancies,todayLuanda} from './substitutions.ts';

const scopeSchema=z.object({round:z.coerce.number().int().positive(),division:z.enum(['M1+','M1','M2+','M2']),date:z.iso.date()});
type Scope=z.infer<typeof scopeSchema>;
const fail=(message:string):never=>{throw Object.assign(Error(message),{status:409});};
const same=(a:Scope,b:Scope)=>a.round===b.round&&a.date===b.date&&a.division===b.division;
export async function associateRoundMessage(tx:Prisma.TransactionClient,id:string,scope:Scope){
 await tx.setting.upsert({where:{key:'round-message:'+id},create:{key:'round-message:'+id,value:JSON.stringify(scope)},update:{value:JSON.stringify(scope)}});
}
export function legacyRoundMatches(body:string,scope:Scope){
 try{const parsed=JSON.parse(decrypt(body,config.MESSAGE_KEY));
  return typeof parsed.text==='string'&&parsed.text.includes(`*Ultimate Challenge · ${scope.division}*`)&&parsed.text.includes(`*${scope.date.split('-').reverse().join('/')}*`);
 }catch{return false;}
}
async function related(tx:Prisma.TransactionClient,scope:Scope,group:string){
 const mappings=await tx.setting.findMany({where:{key:{startsWith:'round-message:'}}});
 const ids=mappings.filter(r=>{try{return same(JSON.parse(r.value),scope);}catch{return false;}}).map(r=>r.key.slice('round-message:'.length));
 const rows=await tx.outbox.findMany({where:{kind:'round',recipient:group,OR:[{id:{in:ids}},{encryptedBody:{not:''}}]},orderBy:{createdAt:'desc'}});
 return rows.filter(r=>ids.includes(r.id)||legacyRoundMatches(r.encryptedBody,scope));
}
async function preview(tx:Prisma.TransactionClient,scope:Scope){
 const games=await tx.game.findMany({where:scope,orderBy:{time:'asc'}});
 if(!games.length||games.some(g=>!g.published))fail('Publica primeiro este sorteio.');
 const players=await tx.player.findMany({where:{id:{in:[...new Set(games.flatMap(g=>[...g.a,...g.b]))]}}});
 const courts=await tx.court.findMany({where:{id:{in:[...new Set(games.map(g=>g.courtId))]}}});
 const body=roundAnnouncement(games.map(g=>({...g,court:g.courtId})),players,courts,config.APP_ORIGIN);
 const readable=body.text.replace(/@(\d+)/g,(tag,digits)=>'@'+(players.find(p=>p.phone==='+'+digits)?.name??digits));
 return {body,readable,games};
}
export function installRoundMessages(app:Express,auth:RequestHandler,admin:RequestHandler){
 app.get('/api/admin/round-message',auth,admin,async(req,res)=>{
  const scope=scopeSchema.parse(req.query),group=(await db.setting.findUnique({where:{key:'whatsapp_group'}}))?.value;
  const {readable}=await preview(db,scope);
  const row=group?(await related(db,scope,group))[0]:null;
  const status=row?row.status==='pending'&&row.expiresAt<=new Date()?'expired':await deliveryStatus(row.id,row.status):'unknown';
  res.json({text:readable,group:group??null,paused:(await db.setting.findUnique({where:{key:'whatsapp-automatic-paused'}}))?.value==='true',message:row?{id:row.id,status,attempts:row.attempts,nextAttemptAt:row.nextAttemptAt,sentAt:row.sentAt}:null});
 });
 app.post('/api/admin/round-message/send',auth,admin,async(req,res)=>{
  const input=scopeSchema.extend({requestId:z.string().uuid(),group:z.string().min(1),resend:z.boolean().default(false)}).parse(req.body);
  const scope:Scope={round:input.round,date:input.date,division:input.division};
  const result=await db.$transaction(async tx=>{
   await tx.revision.update({where:{id:1},data:{value:{increment:1}}});
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('invitation-delivery'))`;
   const group=(await tx.setting.findUnique({where:{key:'whatsapp_group'}}))?.value??fail('Associa primeiro o grupo do torneio.');
   if(group!==input.group)fail('O grupo associado mudou. Atualiza antes de enviar.');
   const requestKey='round-send-request:'+input.requestId;
   const prior=await tx.setting.findUnique({where:{key:requestKey}});
   if(prior){const saved=JSON.parse(prior.value);if(!same(saved,scope)||saved.group!==group)fail('Este pedido já foi usado noutra jornada.');return {id:saved.id};}
   if((await tx.setting.findUnique({where:{key:'whatsapp-automatic-paused'}}))?.value==='true')fail('Os envios estão pausados. Retoma-os no WhatsApp antes de enviar.');
   const {body,games}=await preview(tx,scope);
   if(scope.date<todayLuanda()||games.every(g=>g.winner))fail('Esta jornada já terminou.');
   if((await vacancies(tx)).some(v=>v.status==='pending'&&v.round===scope.round&&v.division===scope.division&&v.date===scope.date))fail('Escolhe os suplentes em falta antes de enviar a convocatória.');
   const rows=await related(tx,scope,group);
   if(rows.some(r=>['sending','uncertain'].includes(r.status)))fail('Há um envio em curso ou sem confirmação. Consulta o estado antes de repetir.');
   const pending=rows.filter(r=>r.status==='pending');
   if(pending.some(r=>r.attempts>0))fail('A mensagem já teve uma tentativa. Aguarda a atualização do estado para evitar duplicados.');
   if(!pending.length&&rows.some(r=>r.status==='sent')&&!input.resend)fail('Esta convocatória já foi enviada. Usa Reenviar para publicar um reforço.');
   // Legacy announcements may contain several divisions; never silently send or cancel the others.
   if(pending.some(r=>{try{return (JSON.parse(decrypt(r.encryptedBody,config.MESSAGE_KEY)).text.match(/\*Ultimate Challenge · /g)??[]).length>1;}catch{return false;}}))fail('A mensagem agendada junta vários níveis. Cancela-a no WhatsApp antes de enviar cada nível separadamente.');
   const now=new Date();
   const data={encryptedBody:encrypt(JSON.stringify(body),config.MESSAGE_KEY),nextAttemptAt:now,expiresAt:new Date(now.getTime()+86400000)};
   let id:string;
   if(pending.length){
    id=pending[0].id;
    await tx.outbox.update({where:{id},data});
    if(pending.length>1)await tx.outbox.updateMany({where:{id:{in:pending.slice(1).map(r=>r.id)},status:'pending',attempts:0},data:{status:'cancelled',encryptedBody:''}});
   }else{id=input.requestId;await tx.outbox.create({data:{id,recipient:group,kind:'round',...data}});}
   await associateRoundMessage(tx,id,scope);
   await tx.setting.create({data:{key:requestKey,value:JSON.stringify({...scope,group,id})}});
   await tx.audit.create({data:{actor:res.locals.session.adminId,action:`Envio imediato da convocatória ${scope.division} de ${scope.date}, ronda ${scope.round}.`}});
   return {id};
  });
  res.json({...result,queued:true});
 });
}
