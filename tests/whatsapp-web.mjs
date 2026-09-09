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
 const env={...source,DATABASE_URL:url.toString(),WA_AUTO_CONNECT:'false'};
 docker(['run','-d','--name',container,'--network','escada_default',...Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]),'--entrypoint','sleep','ultimate-webjs-test','300']);containerCreated=true;


 for(const name of ['whatsapp.ts','whatsapp-web.ts','whatsapp-browser-lock.ts','whatsapp-web-error.ts','whatsapp-pause.ts','delivery-queue.ts'])docker(['cp','server/src/'+name,container+':/app/server/src/'+name]);
 docker(['exec',container,'npm','run','db:migrate']);
 const output=docker(['exec','-i',container,'node','--import','tsx','--input-type=module'],String.raw`
 import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
 import {openWebWhatsApp,toWebId,fromWebId,webReceipt} from './src/whatsapp-web.ts';
 import {loadPostgresAuth} from './src/whatsapp-postgres-auth.ts';import {config} from './src/config.ts';import {WhatsApp} from './src/whatsapp.ts';import {db} from './src/db.ts';
 const received=[],receipts=[],joins=[],sent=[];let destroyed=0,closed=0,ready=0;
 const group={isGroup:true,id:{_serialized:'123@g.us'},name:'Torneio',participants:[{id:{_serialized:'111@lid'}}],getInviteCode:async()=>'invite',addParticipants:async(ids,opts)=>{assert.equal(opts.autoSendInviteV4,false);return {[ids[0]]:{code:200}};}};
 const fake=new EventEmitter();Object.assign(fake,{info:{wid:{_serialized:'244900000001@c.us'},pushname:'Bot'},initialize:async()=>fake.emit('ready'),pupBrowser:{isConnected:()=>destroyed===0},destroy:async()=>{destroyed++;},getChats:async()=>[group],getChatById:async()=>group,getContactLidAndPhone:async()=>[{lid:'111@lid',pn:'244900000002@c.us'}],sendMessage:async(id,text,opts)=>{sent.push({id,text,opts});return {id:{_serialized:'unique-message'}};}});
 const options={databaseUrl:config.DATABASE_URL,folder:'/tmp/web-profile',qr:()=>{},ready:()=>ready++,closed:()=>closed++,message:m=>received.push(m),receipt:(id,status)=>receipts.push({id,status}),joined:(id,members)=>joins.push({id,members})};
 let socket;
 try {
 socket=await openWebWhatsApp(options,opts=>{assert.equal(opts.takeoverOnConflict,false);assert.equal(opts.webVersionCache.path,'/tmp/web-profile/web-cache');return fake;});
 await new Promise(r=>setImmediate(r));assert.equal(ready,1);
 await assert.rejects(loadPostgresAuth({connectionString:config.DATABASE_URL,encryptionKey:config.MESSAGE_KEY,folder:'/tmp/unused',onFailure:()=>{}}),/outro processo/);
 assert.equal(socket.user.id,'244900000001@s.whatsapp.net');
 await socket.sendMessage('244900000002@s.whatsapp.net',{text:'test',mentions:['244900000003@s.whatsapp.net']});assert.equal(sent[0].id,'244900000002@c.us');assert.equal(sent[0].opts.sendSeen,false);assert.deepEqual(sent[0].opts.mentions,['244900000003@c.us']);
 assert.equal((await socket.groupMetadata('123@g.us')).participants[0].phoneNumber,'244900000002@s.whatsapp.net');
 assert.equal((await socket.groupParticipantsUpdate('123@g.us',['244900000003@s.whatsapp.net'],'add'))[0].status,'200');
 fake.emit('message',{from:'123@g.us',author:'111@lid',body:'Posso jogar?',id:{_serialized:'inbound'},hasQuotedMsg:true,getQuotedMessage:async()=>({id:{_serialized:'original'}})});
 fake.emit('message_ack',{id:{_serialized:'unique-message'}},2);
 fake.emit('group_join',{chatId:'123@g.us',recipientIds:['244900000003@c.us']});
 await new Promise(r=>setImmediate(r));assert.equal(received[0].key.participantAlt,'244900000002@s.whatsapp.net');assert.equal(received[0].message.extendedTextMessage.contextInfo.stanzaId,'original');assert.equal(receipts[0].status,3);assert.equal(joins.length,1);
 await socket.end();assert.equal(destroyed,1);fake.emit('ready');assert.equal(ready,1);await assert.rejects(socket.sendMessage('123@g.us',{text:'stale'}));
 const auth=await loadPostgresAuth({connectionString:config.DATABASE_URL,encryptionKey:config.MESSAGE_KEY,folder:'/tmp/unused',onFailure:()=>{}});await auth.close();
 const wa=new WhatsApp(async()=>socket);await wa.initialize();await wa.selectEngine('webjs');await wa.connect();assert.equal(wa.engine,'webjs');await wa.selectEngine('baileys');assert.equal(wa.status,'disconnected');assert.equal(wa.engine,'baileys');
 const restored=new WhatsApp();await restored.initialize();assert.equal(restored.engine,'baileys');
 let starts=0;
 const broken=new WhatsApp(opts=>openWebWhatsApp(opts,()=>{
   const client=new EventEmitter();Object.assign(client,{initialize:async()=>{starts++;throw new Error('ProcessSingleton profile in use');}});return client;
 }));
 await broken.selectEngine('webjs');await broken.connect();await new Promise(r=>setTimeout(r,100));
 assert.equal(broken.status,'error');assert.match(broken.lastError,/perfil.*bloqueado/);
 await new Promise(r=>setTimeout(r,4500));assert.equal(starts,1,'Startup failures must not restart Chromium indefinitely');await broken.disconnect();
 console.log('PASS: exclusive ownership across engines, saved selection, switching closes previous socket, phone/LID mapping, mentions, quoted messages, group addition, receipts and stale-event guards. No WhatsApp messages sent.');
 }finally{await socket?.end();await db.$disconnect();}
 `);console.log(output.trim());
}finally{if(containerCreated)docker(['rm','-f',container]);if(dbCreated)docker(['exec','escada-database-1','dropdb','-U','escada',database]);}
