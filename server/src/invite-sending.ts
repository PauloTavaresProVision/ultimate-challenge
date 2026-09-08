import type { Express, RequestHandler } from 'express';
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
      const phones=[...new Set(input.phones)];
      const result=[];
      for(const phone of phones){
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
      return {...r,status};
    }));
    res.json(result);
  });
}
