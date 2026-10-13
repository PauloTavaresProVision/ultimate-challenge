import type {Express,RequestHandler} from 'express';
import {z} from 'zod';
import {db} from './db.ts';
import {config} from './config.ts';
import {encrypt,decrypt} from './security.ts';
import {listJourneys} from './journeys.ts';
import {deliveryStatus} from './delivery-status.ts';

export const composeInput=z.object({id:z.string().uuid(),group:z.string().min(1),text:z.string().trim().min(1).max(4000),playerIds:z.array(z.string().uuid()).max(100)});
const fail=(message:string):never=>{throw Object.assign(Error(message),{status:409});};
export function composeBody(text:string,players:{name:string;phone:string}[]){
 if(players.some(p=>!/^\+[1-9]\d{7,14}$/.test(p.phone)))fail('Um dos jogadores não tem um contacto válido.');
 return {format:'mentioned-reply-v1',text:(players.length?players.map(p=>'@'+p.phone.slice(1)).join(' ')+'\n\n':'')+text,mentions:players.map(p=>p.phone.slice(1)+'@s.whatsapp.net')};
}
export function installGroupCompose(app:Express,auth:RequestHandler,admin:RequestHandler){
 app.get('/api/admin/group-compose',auth,admin,async(_req,res)=>{
  const group=(await db.setting.findUnique({where:{key:'whatsapp_group'}}))?.value??null;
  const players=await db.player.findMany({where:{status:'Ativo',verified:true},select:{id:true,name:true,division:true},orderBy:{name:'asc'}});
  const journeys=(await listJourneys()).filter(j=>j.group===group&&new Date(j.date+'T'+j.time+':00+01:00')>new Date()).map(j=>({id:j.id,division:j.division,date:j.date,time:j.time,confirmed:j.confirmed,waiting:j.waiting}));
  const rows=await db.outbox.findMany({where:{kind:'group_manual',recipient:group??''},orderBy:{createdAt:'desc'},take:30});
  const history=await Promise.all(rows.map(async row=>{
   const saved=await db.setting.findUnique({where:{key:'group-manual:'+row.id}});
   const data=saved?JSON.parse(decrypt(saved.value,config.MESSAGE_KEY)):{};
   const status=row.status==='pending'&&row.expiresAt<new Date()?'expired':await deliveryStatus(row.id,row.status);
   const reason=(await db.setting.findUnique({where:{key:'group-manual-error:'+row.id}}))?.value;
   return {id:row.id,text:data.text??'',names:data.names??[],createdAt:row.createdAt,status,reason};
  }));
  res.json({group,players,journeys,history});
 });
 app.post('/api/admin/group-compose',auth,admin,async(req,res)=>{
  const input=composeInput.parse(req.body);
  const ids=[...new Set(input.playerIds)].sort();
  const result=await db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('group-manual-compose'))`;
   const existing=await tx.outbox.findUnique({where:{id:input.id}});
   if(existing){
    const saved=await tx.setting.findUnique({where:{key:'group-manual:'+input.id}});
    const previous=saved?JSON.parse(decrypt(saved.value,config.MESSAGE_KEY)):null;
    if(existing.kind!=='group_manual'||existing.recipient!==input.group||previous?.text!==input.text||JSON.stringify(previous?.playerIds)!==JSON.stringify(ids))fail('Este envio já foi registado com outro conteúdo. Atualiza o histórico.');
    return {id:existing.id,status:existing.status};
   }
   if((await tx.setting.findUnique({where:{key:'whatsapp_group'}}))?.value!==input.group)fail('O grupo associado mudou. Atualiza antes de enviar.');
   const players=await tx.player.findMany({where:{id:{in:ids},status:'Ativo',verified:true},select:{id:true,name:true,phone:true},orderBy:{name:'asc'}});
   if(players.length!==ids.length)fail('Um dos jogadores selecionados deixou de estar disponível. Atualiza a seleção.');
   const body=composeBody(input.text,players);
   if(body.text.length>8000)fail('A mensagem com as menções é demasiado longa.');
   const row=await tx.outbox.create({data:{id:input.id,recipient:input.group,kind:'group_manual',encryptedBody:encrypt(JSON.stringify(body),config.MESSAGE_KEY),nextAttemptAt:new Date(Date.now()+5000),expiresAt:new Date(Date.now()+86400000)}});
   await tx.setting.create({data:{key:'group-manual:'+row.id,value:encrypt(JSON.stringify({text:input.text,playerIds:ids,names:players.map(p=>p.name)}),config.MESSAGE_KEY)}});
   await tx.audit.create({data:{actor:res.locals.session.adminId,action:'Mensagem manual colocada na fila: '+row.id}});
   return {id:row.id,status:row.status};
  });
  res.json(result);
 });
 app.post('/api/admin/group-compose/:id/cancel',auth,admin,async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);
  const result=await db.outbox.updateMany({where:{id,kind:'group_manual',status:'pending',attempts:0},data:{status:'cancelled',encryptedBody:''}});
  if(!result.count)fail('O envio já começou ou foi concluído. Atualiza o histórico.');
  res.json({cancelled:true});
 });
}
