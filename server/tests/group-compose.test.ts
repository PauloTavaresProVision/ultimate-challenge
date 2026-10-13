import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{DATABASE_URL:'postgresql://localhost/unused',APP_ORIGIN:'https://test.invalid',SESSION_SECRET:'s'.repeat(32),MESSAGE_KEY:'a'.repeat(64),ADMIN_EMAIL:'test@example.com',ADMIN_PASSWORD:'test-password'});
const {installGroupCompose,composeBody,composeInput}=await import('../src/group-compose.ts');
const {db}=await import('../src/db.ts');
const {decrypt}=await import('../src/security.ts');
const id='10000000-0000-4000-8000-000000000001',playerId='20000000-0000-4000-8000-000000000001';
test('Composer validates length and builds real mentions without treating text as HTML',()=>{
 assert.equal(composeInput.safeParse({id,group:'g@g.us',text:' ',playerIds:[]}).success,false);
 assert.equal(composeInput.safeParse({id,group:'g@g.us',text:'x'.repeat(4001),playerIds:[]}).success,false);
 assert.throws(()=>composeBody('Hi',[{name:'Test',phone:'invalid'}]));
 const body=composeBody('*Olá* 🎾 <script>',[{name:'Test',phone:'+244900000001'}]);
 assert.deepEqual(body.mentions,['244900000001@s.whatsapp.net']);assert.equal(body.text,'@244900000001\n\n*Olá* 🎾 <script>');
});
test('Manual message endpoint is admin-only, idempotent, validates group and preserves encrypted history',async()=>{
 const routes=new Map<string,any[]>();const auth=()=>{},admin=()=>{};
 installGroupCompose({get:(p:string,...h:any[])=>routes.set('GET '+p,h),post:(p:string,...h:any[])=>routes.set('POST '+p,h)} as any,auth,admin);
 for(const handlers of routes.values()){assert.equal(handlers[0],auth);assert.equal(handlers[1],admin);}
 const settings=new Map<string,string>([['whatsapp_group','g@g.us']]),rows=new Map<string,any>();let audits=0;
 const tx:any={$executeRaw:async()=>{},setting:{findUnique:async({where}:any)=>settings.has(where.key)?{value:settings.get(where.key)}:null,create:async({data}:any)=>{settings.set(data.key,data.value);}},player:{findMany:async()=>[{id:playerId,name:'Miguel',phone:'+244900000001'}]},outbox:{findUnique:async({where}:any)=>rows.get(where.id)??null,create:async({data}:any)=>{const row={...data,status:'pending'};rows.set(data.id,row);return row;}},audit:{create:async()=>{audits++;}}};
 const original=db.$transaction;db.$transaction=(async(fn:any)=>fn(tx)) as any;
 const handler=routes.get('POST /api/admin/group-compose')!.at(-1);let result:any;
 const res={locals:{session:{adminId:'admin'}},json:(r:any)=>{result=r;}};
 const body={id,group:'g@g.us',text:'Olá 🎾',playerIds:[playerId,playerId]};
 try{
  await handler({body},res);await handler({body},res);
  assert.equal(rows.size,1);assert.equal(audits,1);assert.equal(result.status,'pending');
  assert.ok(rows.get(id).nextAttemptAt.getTime()>Date.now());
  assert.equal(JSON.parse(decrypt(settings.get('group-manual:'+id)!,'a'.repeat(64))).text,'Olá 🎾');
  assert.deepEqual(JSON.parse(decrypt(rows.get(id).encryptedBody,'a'.repeat(64))).mentions,['244900000001@s.whatsapp.net']);
  await assert.rejects(handler({body:{...body,text:'Changed'}},res),/outro conteúdo/);
  await assert.rejects(handler({body:{...body,id:'10000000-0000-4000-8000-000000000002',group:'other@g.us'}},res),/grupo associado mudou/);
  rows.get(id).encryptedBody='';rows.get(id).status='sent';await handler({body},res);assert.equal(result.status,'sent');assert.equal(rows.size,1);
 }finally{db.$transaction=original;await db.$disconnect();}
});
