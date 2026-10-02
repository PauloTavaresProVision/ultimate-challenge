import {test} from 'node:test';
import assert from 'node:assert/strict';
// Synthetic test settings; no provider or PostgreSQL connection is used.
Object.assign(process.env,{DATABASE_URL:'postgresql://localhost/unused',APP_ORIGIN:'https://test.invalid',
 SESSION_SECRET:'s'.repeat(32),MESSAGE_KEY:'a'.repeat(64),ADMIN_EMAIL:'test@example.com',ADMIN_PASSWORD:'test-password'});
const {db}=await import('../src/db.ts');
const {encrypt,decrypt}=await import('../src/security.ts');
const {installZWebhook}=await import('../src/zapi-settings.ts');
const {groupMessageId}=await import('../src/group-memory.ts');
const key='a'.repeat(64), group='123456@g.us';

test('Webhook acknowledges only durable storage; duplicate callbacks preserve the first payload and timestamp',async()=>{
 const settings=new Map<string,string>([
   ['zapi-credentials',encrypt(JSON.stringify({instanceId:'test-instance',webhookSecret:'test-secret'}),key)],
   ['whatsapp_engine','zapi'],['whatsapp_group',group],['bot-enabled','true']
 ]);
 const rows=new Map<string,any>();let fail=false;let writes=0;
 const oldFind=db.setting.findUnique,oldUpsert=db.groupInbox.upsert;
 db.setting.findUnique=(async({where}:any)=>settings.has(where.key)?{key:where.key,value:settings.get(where.key)}:null) as any;
 db.groupInbox.upsert=(async({where,create}:any)=>{writes++;if(fail)throw Error('Database unavailable');if(!rows.has(where.id))rows.set(where.id,create);return rows.get(where.id);}) as any;
 let handler:any;
 installZWebhook({post:(_path:string,fn:unknown)=>{handler=fn;}} as any);
 const body={type:'ReceivedCallback',instanceId:'test-instance',isGroup:true,phone:'123456-group',participantPhone:'244935285667',
   messageId:'event-1',momment:Date.now()-5000,text:{message:'Estou dentro'},referenceMessageId:'announcement'};
 const invoke=async(payload:any)=>{
   let status:number|undefined;
   await handler({params:{secret:'test-secret'},body:payload},{sendStatus:(value:number)=>{status=value;}});
   return status;
 };
 try {
   fail=true;await assert.rejects(invoke(body),/Database unavailable/);assert.equal(rows.size,0);
   fail=false;assert.equal(await invoke(body),200);
   const stored=rows.get(groupMessageId(group,'event-1'));
   assert.equal(stored.messageAt.getTime(),Math.floor(body.momment/1000)*1000);
   assert.equal(stored.status,'pending');assert.ok(!stored.encryptedPayload.includes('Estou dentro'));
   const payload=JSON.parse(decrypt(stored.encryptedPayload,key));
   assert.equal(payload.message.extendedTextMessage.contextInfo.stanzaId,'announcement');
   assert.equal(payload.key.participantAlt,'244935285667@s.whatsapp.net');
   assert.equal(await invoke({...body,momment:Date.now(),text:{message:'Duplicate changed payload'}}),200);
   assert.equal(rows.size,1);assert.equal(rows.get(stored.id).encryptedPayload,stored.encryptedPayload);
   assert.equal(writes,3);
   settings.set('bot-enabled','false');await invoke({...body,messageId:'paused'});
   assert.equal(rows.get(groupMessageId(group,'paused')).status,'paused');
 } finally {db.setting.findUnique=oldFind;db.groupInbox.upsert=oldUpsert;await db.$disconnect();}
});
