import type {Express,RequestHandler} from 'express';
import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {z} from 'zod';
import {db} from './db.ts';
import {config} from './config.ts';
import {encrypt,decrypt} from './security.ts';
import {ZApiClient,zReceipt,zMessageId,zJid,type ZCredentials} from './zapi-client.ts';
import {nextReceipt} from './whatsapp-receipts.ts';
const key='zapi-credentials';
export type ZSettings=ZCredentials&{webhookSecret:string};
export async function loadZSettings():Promise<ZSettings|null>{const row=await db.setting.findUnique({where:{key}});return row?JSON.parse(decrypt(row.value,config.MESSAGE_KEY)):null;}
export function installZWebhook(app:Express){
  // Before same-origin browser middleware: Z-API sends server-to-server POSTs.
  app.post('/api/webhooks/zapi/:secret',async(req,res)=>{
    const s=await loadZSettings();const supplied=Buffer.from(String(req.params.secret));const expected=Buffer.from(s?.webhookSecret??'');
    if(!s||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)||req.body?.instanceId!==s.instanceId)return res.sendStatus(403);
    const code=zReceipt(req.body);
    if(code!==null){
      const ids=req.body.type==='DeliveryCallback'?[req.body.messageId,req.body.zaapId]:req.body.ids;
      if(!Array.isArray(ids))return res.sendStatus(400);
      for(const id of ids.filter((v:unknown)=>typeof v==='string'&&v.length<=256)){
        const source=zMessageId(s.instanceId,id);
        const alias=await db.setting.findUnique({where:{key:'zapi-alias:'+source}});
        for(const message of new Set([source,...(alias?[alias.value]:[])]))await db.$transaction(async tx=>{
          const key='wa-receipt:'+message;await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
          const old=await tx.setting.findUnique({where:{key}});const value=String(nextReceipt(old?Number(old.value):null,code));
          await tx.setting.upsert({where:{key},create:{key,value},update:{value}});
        });
      }
      return res.sendStatus(200);
    }
    if(req.body.type!=='ReceivedCallback')return res.sendStatus(200);
    if(req.body.isGroup!==true||typeof req.body.phone!=='string')return res.sendStatus(200);
    const engine=await db.setting.findUnique({where:{key:'whatsapp_engine'}});
    const group=await db.setting.findUnique({where:{key:'whatsapp_group'}});
    if(engine?.value!=='zapi'||group?.value!==zJid(req.body.phone))return res.sendStatus(200);
    const text=JSON.stringify(req.body);const id='zapi-inbox:'+s.instanceId+':'+createHash('sha256').update(text).digest('hex');
    await db.setting.upsert({where:{key:id},create:{key:id,value:encrypt(text,config.MESSAGE_KEY)},update:{}});
    res.sendStatus(200);
  });
}
export function installZSettings(app:Express,auth:RequestHandler,admin:RequestHandler,isActive:()=>boolean){
  app.get('/api/admin/whatsapp/zapi',auth,admin,async(_req,res)=>{const s=await loadZSettings();res.json({configured:!!s,instanceId:s?.instanceId??''});});
  app.post('/api/admin/whatsapp/zapi',auth,admin,async(req,res)=>{
    if(isActive())return res.status(409).json({error:'Desliga a ligação Z-API antes de alterar as credenciais.'});
    const data=z.object({instanceId:z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),token:z.string().min(1).max(512),clientToken:z.string().min(1).max(512)}).parse(req.body);
    const old=await loadZSettings();const value=encrypt(JSON.stringify({...data,webhookSecret:old?.instanceId===data.instanceId?old.webhookSecret:randomBytes(32).toString('hex')}),config.MESSAGE_KEY);
    await db.setting.upsert({where:{key},create:{key,value},update:{value}});res.json({configured:true});
  });
  app.post('/api/admin/whatsapp/zapi/test',auth,admin,async(_req,res)=>{
    const s=await loadZSettings();if(!s)return res.status(409).json({error:'Configura a Z-API primeiro.'});
    try{const status=await new ZApiClient(s).call('status');if(typeof status.connected!=='boolean')throw new Error('Z-API não devolveu um estado válido. Verifica os três campos de acesso.');res.json({ok:true,connected:status.connected===true});}
    // This is the result of a connectivity check, not a gateway failure of our API.
    // Reverse proxies can replace 502 JSON with HTML and hide the diagnostic.
    catch(e){res.json({ok:false,error:(e as Error).message});}
  });
}
