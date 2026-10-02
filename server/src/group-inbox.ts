import {Client} from 'pg';
import type {WAMessage} from '@whiskeysockets/baileys';
import {db} from './db.ts';
import {config} from './config.ts';
import {encrypt,decrypt} from './security.ts';
import {groupMessageId} from './group-memory.ts';
import {drainIncoming} from './incoming-queue.ts';

export async function saveIncoming(message:WAMessage) {
  const group=message.key.remoteJid, id=message.key.id;
  const text=message.message?.conversation??message.message?.extendedTextMessage?.text;
  if(!group?.endsWith('@g.us')||!id||!text?.trim())return;
  if((await db.setting.findUnique({where:{key:'whatsapp_group'}}))?.value!==group)return;
  const at=Number(message.messageTimestamp)*1000;
  const messageAt=new Date(Number.isFinite(at)&&at>0?Math.min(at,Date.now()):Date.now());
  const enabled=(await db.setting.findUnique({where:{key:'bot-enabled'}}))?.value!=='false';
  // Store only the fields we use. Protobuf Long/Buffer objects are not replayable JSON.
  const payload={key:message.key,pushName:message.pushName,messageTimestamp:messageAt.getTime()/1000,
    message:{extendedTextMessage:{text,contextInfo:message.message?.extendedTextMessage?.contextInfo}}};
  await db.groupInbox.upsert({where:{id:groupMessageId(group,id)},update:{},create:{
    id:groupMessageId(group,id),group,messageAt,encryptedPayload:encrypt(JSON.stringify(payload),config.MESSAGE_KEY),
    status:enabled?'pending':'paused',completedAt:enabled?null:new Date()
  }});
}

let running=false;
export async function processIncoming(process:(message:WAMessage)=>Promise<void>,active:()=>boolean) {
  if(running||!active())return;
  running=true;
  const lease=new Client({connectionString:config.DATABASE_URL,connectionTimeoutMillis:10000});
  let alive=true;
  lease.on('error',()=>{alive=false;});lease.on('end',()=>{alive=false;});
  try {
    await lease.connect();
    const lock=await lease.query('SELECT pg_try_advisory_lock(186937789,2) AS owned');
    if(!lock.rows[0].owned)return;
    const group=(await db.setting.findUnique({where:{key:'whatsapp_group'}}))?.value;
    if(!group||(await db.setting.findUnique({where:{key:'bot-enabled'}}))?.value==='false')return;
    // Drain the previous version's persisted webhook buffer before newer events.
    const engine=(await db.setting.findUnique({where:{key:'whatsapp_engine'}}))?.value;
    if(engine==='zapi'){
      const credentials=await db.setting.findUnique({where:{key:'zapi-credentials'}});
      if(credentials){
        const instance=JSON.parse(decrypt(credentials.value,config.MESSAGE_KEY)).instanceId;
        if(await db.setting.findFirst({where:{key:{startsWith:'zapi-inbox:'+instance+':'}}}))return;
      }
    }
    await drainIncoming({
      first:()=>db.groupInbox.findFirst({where:{group,status:'pending'},orderBy:[{messageAt:'asc'},{sequence:'asc'}]}),
      attempt:async job=>{await db.groupInbox.update({where:{id:job.id},data:{attempts:{increment:1}}});},
      complete:async job=>{await db.groupInbox.update({where:{id:job.id},data:{status:'done',completedAt:new Date(),lastError:null}});},
      retry:async(job,at)=>{
        await db.groupInbox.update({where:{id:job.id},data:{nextAttemptAt:at,lastError:'Processamento interrompido; nova tentativa automática.'}});
        console.error('WhatsApp fila:',JSON.stringify({event:job.id,attempt:job.attempts+1,retryAt:at}));
        if(job.attempts===2)await db.audit.create({data:{actor:'system',action:`Pedido WhatsApp ${job.id} aguarda recuperação após 3 tentativas. A fila mantém a ordem de chegada.`}});
      }
    },async job=>{
      if(!alive||!active())throw Error('Ligação interrompida.');
      await process(JSON.parse(decrypt(job.encryptedPayload,config.MESSAGE_KEY)) as WAMessage);
    },{active:()=>alive&&active()});
  } finally {await lease.end().catch(()=>{});running=false;}
}
