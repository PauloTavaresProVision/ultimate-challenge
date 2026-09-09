import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const docker=(args,input)=>{try{return execFileSync('docker',args,{encoding:'utf8',input,stdio:['pipe','pipe','pipe']});}catch(e){if(args.includes('--input-type=module'))console.error(String(e.stderr).replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[database omitted]'));throw Error('Isolated WhatsApp auth test failed; credentials omitted.');}};
const source=JSON.parse(docker(['compose','--env-file','deploy/.env','-f','deploy/compose.yaml','config','--format','json'])).services.app.environment;
const suffix=randomBytes(5).toString('hex'),database='escada_results_test_'+suffix,container='escada-invites-test-'+suffix;
let dbCreated=false,containerCreated=false;
try{
 docker(['exec','escada-database-1','createdb','-U','escada',database]);dbCreated=true;
 const url=new URL(source.DATABASE_URL);url.pathname='/'+database;
 const env={...source,DATABASE_URL:url.toString(),WA_AUTO_CONNECT:'false',APP_ORIGIN:'https://example.test'};
 docker(['run','-d','--name',container,'--network','escada_default',...Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]),'--entrypoint','sleep','ultimate-webjs-test','300']);containerCreated=true;



 for(const name of ['whatsapp-zapi.ts','zapi-client.ts','zapi-settings.ts','whatsapp.ts','whatsapp-web.ts','whatsapp-browser-lock.ts','whatsapp-web-error.ts','whatsapp-pause.ts','delivery-queue.ts'])docker(['cp','server/src/'+name,container+':/app/server/src/'+name]);
 docker(['exec',container,'npm','run','db:migrate']);
 docker(['cp','server/src/delivery-status.ts',container+':/app/server/src/delivery-status.ts']);
 const output=docker(['exec','-i',container,'node','--import','tsx','--input-type=module'],String.raw`
 import assert from 'node:assert/strict';import express from 'express';
 import {db} from './src/db.ts';import {config} from './src/config.ts';import {encrypt} from './src/security.ts';
 import {openZApi} from './src/whatsapp-zapi.ts';import {installZWebhook} from './src/zapi-settings.ts';import {deliveryStatus} from './src/delivery-status.ts';
 const credentials={instanceId:'test-instance',token:'fake-token',clientToken:'fake-client',webhookSecret:'fake-hook-secret'};
 await db.setting.create({data:{key:'zapi-credentials',value:encrypt(JSON.stringify(credentials),config.MESSAGE_KEY)}});
 await db.setting.createMany({data:[{key:'whatsapp_engine',value:'zapi'},{key:'whatsapp_group',value:'123@g.us'}]});
 const app=express();app.use(express.json());installZWebhook(app);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;const realFetch=globalThis.fetch;
 const hook=async(body,secret='fake-hook-secret')=>realFetch(base+'/api/webhooks/zapi/'+secret,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const calls=[];let members=false;
 globalThis.fetch=async(url,options)=>{
   const u=new URL(url);assert.equal(u.origin,'https://api.z-api.io');assert.equal(options.headers['Client-Token'],'fake-client');
   const path=u.pathname.split('/token/fake-token/')[1];calls.push(path);let data;
   if(path==='update-every-webhooks'){assert(JSON.parse(options.body).value.startsWith('https://'));data={value:true};}
   else if(path==='update-queue-settings'){assert.equal(JSON.parse(options.body).disableEnqueueWhenDisconnected,true);data={success:true};}
   else if(path==='status')data={connected:true};
   else if(path==='device')data={phone:'244900000001',name:'Test'};
   else if(path==='send-text'){const body=JSON.parse(options.body);assert.equal(body.phone,'123-group');assert.deepEqual(body.mentioned,['244900000002']);data={messageId:'message-1',zaapId:'queue-1'};}
   else if(path==='groups')data=[{phone:'123-group',name:'Escada'}];
   else if(path==='group-metadata/123-group')data={subject:'Escada',participants:members?[{phone:'244900000002'}]:[]};
   else if(path==='add-participant'){assert.equal(JSON.parse(options.body).autoInvite,false);members=true;data={value:true};}
   else if(path==='group-invitation-link/123-group')data={invitationLink:'https://chat.whatsapp.com/example'};
   else throw Error('Unexpected endpoint '+path);
   return new Response(JSON.stringify(data),{status:200});
 };
 let ready=0;const messages=[];const joins=[];
 const socket=await openZApi({databaseUrl:config.DATABASE_URL,folder:'/tmp/unused',qr:()=>{},ready:()=>ready++,closed:()=>{},message:m=>messages.push(m),receipt:()=>{},joined:(...a)=>joins.push(a)});
 try{
   await new Promise(r=>setTimeout(r,100));assert.equal(ready,1);
   await assert.rejects(openZApi({databaseUrl:config.DATABASE_URL,folder:'/tmp/unused',qr:()=>{},ready:()=>{},closed:()=>{},message:()=>{},receipt:()=>{},joined:()=>{}}),/Outra ligação/);
   assert.equal((await socket.groupFetchAllParticipating())['123@g.us'].subject,'Escada');
   assert.equal((await socket.groupParticipantsUpdate('123@g.us',['244900000002@s.whatsapp.net'],'add'))[0].status,'200');
   assert.equal(await socket.groupInviteCode('123@g.us'),'example');
   const result=await socket.sendMessage('123@g.us',{text:'Hello',mentions:['244900000002@s.whatsapp.net']});
   assert.equal(result.key.id,'zapi:test-instance:message-1');
   const row=await db.outbox.create({data:{recipient:'123@g.us',kind:'test',encryptedBody:'',status:'sent',expiresAt:new Date(Date.now()+60000)}});
   await db.setting.create({data:{key:'outbox-message:'+row.id,value:result.key.id}});
   assert.equal(await deliveryStatus(row.id,'sent'),'provider_queued');
   assert.equal((await hook({instanceId:'test-instance',type:'MessageStatusCallback',ids:['message-1'],status:'READ'},'wrong')).status,403);
   assert.equal((await hook({instanceId:'wrong',type:'MessageStatusCallback',ids:['message-1'],status:'READ'})).status,403);
   for(const status of ['READ','SENT','RECEIVED','READ_BY_ME'])assert.equal((await hook({instanceId:'test-instance',type:'MessageStatusCallback',ids:['message-1'],status})).status,200);
   assert.equal(await deliveryStatus(row.id,'sent'),'read');
   await hook({instanceId:'test-instance',type:'DeliveryCallback',messageId:'queue-1',zaapId:'queue-1',error:'Rejected'});
   assert.equal(await deliveryStatus(row.id,'sent'),'read','late rejection cannot overwrite delivered evidence');
   await hook({instanceId:'test-instance',type:'ReceivedCallback',messageId:'in-1',phone:'123-group',isGroup:true,fromMe:false,participantPhone:'244900000002',participantLid:'42@lid',text:{message:'Quando jogo?'},referenceMessageId:'quoted'});
   await new Promise(r=>setTimeout(r,10100));assert.equal(messages.length,1);assert.equal(messages[0].key.participantAlt,'244900000002@s.whatsapp.net');assert.equal(messages[0].message.extendedTextMessage.contextInfo.stanzaId,'quoted');
   console.log('PASS: Z-API HTTP contract, dedicated hooks, unauthorized callbacks rejected, queue vs delivery, reordered receipts, group membership verification, mentions and inbound player mapping. No real messages sent.');
 }finally{await socket.end();server.close();globalThis.fetch=realFetch;await db.$disconnect();}
 `);console.log(output.trim());
}finally{if(containerCreated)docker(['rm','-f',container]);if(dbCreated)docker(['exec','escada-database-1','dropdb','-U','escada',database]);}
