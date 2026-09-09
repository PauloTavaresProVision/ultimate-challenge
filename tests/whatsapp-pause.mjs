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



 for(const name of ['whatsapp-zapi.ts','zapi-client.ts','zapi-settings.ts','whatsapp.ts','whatsapp-web.ts','whatsapp-browser-lock.ts','whatsapp-web-error.ts','whatsapp-pause.ts','delivery-queue.ts'])docker(['cp','server/src/'+name,container+':/app/server/src/'+name]);
 docker(['exec',container,'npm','run','db:migrate']);
 const output=docker(['exec','-i',container,'node','--import','tsx','--input-type=module'],String.raw`
 import assert from 'node:assert/strict';import {db} from './src/db.ts';
 import {automaticPaused,setAutomaticPaused} from './src/whatsapp-pause.ts';
 import {claimDelivery} from './src/delivery-queue.ts';
 import {WhatsApp} from './src/whatsapp.ts';import {encrypt} from './src/security.ts';import {config} from './src/config.ts';
 let sends=0;
 const socket={end:async()=>{},signalRepository:{lidMapping:{getLIDForPN:async()=>null}},sendMessage:async()=>{sends++;return {key:{id:'fake-'+sends}};}};
 let events;
 const wa=new WhatsApp(async options=>{events=options;return socket;});
 try {
 await wa.selectEngine('webjs');await wa.connect();
 events.qr('test-qr');events.authenticated();await new Promise(r=>setTimeout(r,100));
 assert.equal(wa.qr,null);assert.equal(wa.status,'syncing');events.ready();assert.equal(wa.status,'connected');
 assert.equal(await automaticPaused(),false);
 for(const kind of ['invitation','otp','welcome','ai','group_join'])await db.outbox.create({data:{recipient:'244900000001@s.whatsapp.net',kind,encryptedBody:encrypt('Test',config.MESSAGE_KEY),expiresAt:new Date(Date.now()+600000)}});
 await setAutomaticPaused(true);assert.equal(await automaticPaused(),true);
 assert.equal(await claimDelivery(),null);await wa.deliver();assert.equal(sends,0);assert.equal(await db.outbox.count({where:{status:'pending'}}),5);
 await wa.sendTest('+244900000001','Explicit test');assert.equal(sends,1);assert.equal(await automaticPaused(),true);
 const testId='a1261864-cda8-4be4-84d6-2226e94eb257';
 await Promise.all([wa.startTest(testId,'+244900000001','Tracked test'),wa.startTest(testId,'+244900000001','Tracked test')]);
 await new Promise(r=>setTimeout(r,100));
 assert.equal(sends,2,'Concurrent requests for one test must send only once');
 await wa.startTest(testId,'+244900000001','Tracked test');assert.equal(sends,2);
 assert.equal((await db.outbox.findUnique({where:{id:testId}})).status,'sent');
 let queries=0;socket.fetchReceipt=async()=>{queries++;return 4;};
 await wa.refreshReceipt('fake-2');await wa.refreshReceipt('fake-2');
 await new Promise(r=>setTimeout(r,100));
 assert.equal(queries,1);assert.equal((await db.setting.findUnique({where:{key:'wa-receipt:fake-2'}})).value,'4');
 await wa.disconnect();const reloaded=new WhatsApp();await reloaded.initialize();assert.equal(await automaticPaused(),true);
 await setAutomaticPaused(false);assert(await claimDelivery());assert.equal(await db.outbox.count({where:{status:'pending'}}),4);
 console.log('PASS: pause persists, all automatic kinds remain queued, explicit test is allowed, resume claims pending work. No real WhatsApp messages sent.');
 }finally{await wa.disconnect();await db.$disconnect();}
 `);console.log(output.trim());
}finally{if(containerCreated)docker(['rm','-f',container]);if(dbCreated)docker(['exec','escada-database-1','dropdb','-U','escada',database]);}
