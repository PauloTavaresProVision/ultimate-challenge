import {reminderCandidates} from './invite-reminders.ts';
import type { Express, RequestHandler } from 'express';
import {deliveryStatus} from './delivery-status.ts';
import { z } from 'zod';
import { db } from './db.ts';
import { config } from './config.ts';
import { digest, encrypt, randomToken } from './security.ts';
export function installInviteSending(app: Express, auth: RequestHandler, admin: RequestHandler, connected:()=>boolean) {
  const schema=z.object({batchId:z.string().uuid(),phones:z.array(z.string().regex(/^\+[1-9]\d{7,14}$/)).min(1).max(50),message:z.string().trim().min(1).max(1500)});
  app.post('/api/admin/invite-deliveries',auth,admin,async(req,res)=>{
    const input=schema.parse(req.body); const key='invite-batch:'+input.batchId;
    const rows=await db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      const existing=await tx.setting.findUnique({where:{key}});
      if(existing)return JSON.parse(existing.value);
      if(!connected())throw Object.assign(new Error('Liga o WhatsApp antes de enviar convites.'),{status:409});
      const phones=[...new Set(input.phones)].sort();
      const result=[];
      for(const phone of phones){
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"invite-phone:"+phone}))`;
        if(await tx.player.findUnique({where:{phone}}))throw Object.assign(new Error(`O número ${phone} já tem uma inscrição. Consulta Inscrições ou Jogadores.`),{status:409});
        if(await tx.outbox.findFirst({where:{recipient:phone.slice(1)+'@s.whatsapp.net',kind:'invitation',status:{in:['pending','sending']},expiresAt:{gt:new Date()}}}))throw Object.assign(new Error(`Já existe um convite em fila para ${phone}. Aguarda o envio.`),{status:409});
        const token=randomToken(), tokenHash=digest(token),expiresAt=new Date(Date.now()+7*86400000);
        await tx.invite.create({data:{tokenHash,expiresAt}});
        await tx.setting.create({data:{key:'invite-target:'+tokenHash,value:phone}});
        const url=config.APP_ORIGIN.replace(/\/$/,'')+'/inscricao?convite='+token;
        const body=input.message+'\n\n'+url+'\n\nConvite individual, válido por 7 dias. A inscrição depende da aprovação da organização.';
        const delivery=await tx.outbox.create({data:{recipient:phone.slice(1)+'@s.whatsapp.net',kind:'invitation',encryptedBody:encrypt(body,config.MESSAGE_KEY),expiresAt}});
        result.push({phone,id:delivery.id});
      }
      await tx.setting.create({data:{key,value:JSON.stringify(result)}});
      return result;
    },{timeout:20000});
    res.json({batchId:input.batchId,recipients:rows});
  });
  app.get('/api/admin/invite-reminders',auth,admin,async(_req,res)=>{
    res.set('Cache-Control','no-store').json({items:await reminderCandidates()});
  });
  app.post('/api/admin/invite-reminders',auth,admin,async(req,res)=>{
    const input=z.object({batchId:z.string().uuid(),invitationIds:z.array(z.string().uuid()).min(1).max(5000),message:z.string().trim().min(1).max(1500)}).parse(req.body);
    const result=await db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('invite-reminders'))`;
      const key='invite-reminder-batch:'+input.batchId;
      const existing=await tx.setting.findUnique({where:{key}});
      if(existing)return JSON.parse(existing.value);
      if(!connected())throw Object.assign(new Error('Liga o WhatsApp antes de enviar os lembretes.'),{status:409});
      const selected=new Set(input.invitationIds);
      const candidates=(await reminderCandidates()).filter(r=>selected.has(r.id));
      for(const row of candidates)await tx.outbox.create({data:{kind:'invitation_reminder',recipient:row.phone.slice(1)+'@s.whatsapp.net',encryptedBody:encrypt(input.message,config.MESSAGE_KEY),expiresAt:new Date(Date.now()+7*86400000)}});
      const result={queued:candidates.length,excluded:selected.size-candidates.length};
      await tx.setting.create({data:{key,value:JSON.stringify(result)}});
      await tx.audit.create({data:{actor:res.locals.session.adminId,action:`Lembrete de inscrição colocado na fila para ${result.queued} contactos.`}});
      return result;
    },{timeout:60000});
    res.json(result);
  });
  app.get('/api/admin/invite-history',auth,admin,async(req,res)=>{
    const offset=z.coerce.number().int().min(0).max(100000).parse(req.query.offset??0);
    const search=z.string().max(100).parse(req.query.search??'').trim();
    const filter=z.enum(['all','pending','registered']).parse(req.query.filter??'all');
    const registered=filter==='all'?[]:(await db.player.findMany({select:{phone:true}})).map(p=>p.phone.slice(1)+'@s.whatsapp.net');
    const where={kind:'invitation',recipient:{...(search?{contains:search.replace(/[^0-9]/g,'')}:{}),...(filter==='registered'?{in:registered}:filter==='pending'?{notIn:registered}:{})}};
    const contacts=await db.outbox.findMany({where,distinct:['recipient'],orderBy:[{createdAt:'desc'},{id:'desc'}],select:{id:true}});
    const total=contacts.length;
    const messages=await db.outbox.findMany({where:{id:{in:contacts.slice(offset,offset+50).map(m=>m.id)}},orderBy:[{createdAt:'desc'},{id:'desc'}]});
    const items=await Promise.all(messages.map(async m=>{
      const phone='+'+m.recipient.split('@')[0];
      const player=await db.player.findUnique({where:{phone},select:{name:true,status:true,verified:true}});
      const message=await db.setting.findUnique({where:{key:'outbox-message:'+m.id}});
      const receipt=message?await db.setting.findUnique({where:{key:'wa-receipt:'+message.value}}):null;
      const code=receipt?Number(receipt.value):null;
      const status=await deliveryStatus(m.id,m.status);
      return {id:m.id,phone,name:player?.name??null,delivery:status,registration:player?(player.status==='Ativo'?'approved':player.status==='Rejeitado'?'rejected':!player.verified?'verification':player.status==='Inativo'?'inactive':'registered'):(m.expiresAt<new Date()?'expired':'pending'),createdAt:m.createdAt,expiresAt:m.expiresAt,canResend:!player&&(!['pending','sending'].includes(m.status)||m.expiresAt<new Date())};
    }));
    res.set('Cache-Control','no-store').json({items,total,offset});
  });
  app.post('/api/admin/invite-deliveries/:id/cancel',auth,admin,async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id);
    const result=await db.outbox.updateMany({where:{id,kind:'invitation',status:'pending'},data:{status:'cancelled',encryptedBody:''}});
    if(!result.count)return res.status(409).json({error:'Este convite já não está em fila. Atualiza o estado.'});
    res.json({status:'cancelled'});
  });
  app.get('/api/admin/invite-deliveries/:id',auth,admin,async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id);
    const batch=await db.setting.findUnique({where:{key:'invite-batch:'+id}});
    if(!batch)return res.status(404).json({error:'Envio não encontrado.'});
    const rows=JSON.parse(batch.value) as {phone:string;id:string}[];
    const messages=await db.outbox.findMany({where:{id:{in:rows.map(r=>r.id)}},select:{id:true,status:true}});
    const result = await Promise.all(rows.map(async r=>{
      let status = messages.find(m=>m.id===r.id)?.status??'expired';
      const message = await db.setting.findUnique({where:{key:'outbox-message:'+r.id}});
      if(message && status === 'sent') {
        const receipt = await db.setting.findUnique({where:{key:'wa-receipt:'+message.value}});
        if(receipt) {
          const code = Number(receipt.value);
          status = code >= 4 ? 'read' : code === 3 ? 'delivered' : code === 2 ? 'accepted' : code === 0 ? 'failed' : status;
        }
      }
      status=await deliveryStatus(r.id,status);
      const failure = message && status === 'failed' ? await db.setting.findUnique({where:{key:'wa-receipt-error:'+message.value}}) : null;
      return {...r,status,errorCode:failure?.value??null};
    }));
    res.json(result);
  });
}
