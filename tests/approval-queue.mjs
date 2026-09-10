import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const docker=(args,input)=>{try{return execFileSync('docker',args,{encoding:'utf8',input,stdio:['pipe','pipe','pipe']});}catch(e){if(args.includes('--input-type=module'))console.error(String(e.stderr).replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[database omitted]'));throw Error('Isolated approval test failed.');}};
const source=JSON.parse(docker(['compose','--env-file','deploy/.env','-f','deploy/compose.yaml','config','--format','json'])).services.app.environment;
const suffix=randomBytes(5).toString('hex'),database='escada_results_test_'+suffix,container='escada-approval-test-'+suffix;
let dbCreated=false,containerCreated=false;
try{
 docker(['exec','escada-database-1','createdb','-U','escada',database]);dbCreated=true;
 const url=new URL(source.DATABASE_URL);url.pathname='/'+database;
 const env={...source,DATABASE_URL:url.toString(),WA_AUTO_CONNECT:'false'};
 docker(['run','-d','--name',container,'--network','escada_default',...Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]),'--entrypoint','sleep','ultimate-webjs-test','300']);containerCreated=true;
 for(const name of ['admin-state.ts','group-recovery.ts','whatsapp-zapi.ts','zapi-client.ts','zapi-settings.ts','whatsapp.ts','whatsapp-web.ts','whatsapp-browser-lock.ts','whatsapp-web-error.ts','whatsapp-pause.ts','delivery-queue.ts'])docker(['cp','server/src/'+name,container+':/app/server/src/'+name]);
 docker(['exec',container,'npm','run','db:migrate']);
 console.log(docker(['exec','-i',container,'node','--import','tsx','--input-type=module'],String.raw`
 import assert from 'node:assert/strict';import express from 'express';
 import {db} from './src/db.ts';import {installAdminState} from './src/admin-state.ts';
 import {decrypt} from './src/security.ts';import {config} from './src/config.ts';
 const app=express();app.use(express.json());let calls=0;
 const auth=(_req,res,next)=>{res.locals.session={adminId:'test'};next();};
 const snapshot=async()=>({revision:(await db.revision.findUnique({where:{id:1}})).value});
 installAdminState(app,auth,auth,{groupInvite:async()=>{calls++;throw Error('WhatsApp Web unavailable');}},snapshot);
 app.use((err,_req,res,_next)=>res.status(err.status??500).json({error:err.message}));
 const server=app.listen(0);await new Promise(r=>server.once('listening',r));
 try{
 await db.revision.upsert({where:{id:1},create:{id:1,value:0},update:{value:0}});
 const p={id:'approval',name:'Test Player',phone:'+244900000001',birth:'1990-01-01',side:'Direita',division:'M1',status:'Pendente',verified:true,note:''};
 await db.player.create({data:{...p,birth:new Date(p.birth)}});
 await db.setting.create({data:{key:'whatsapp_group',value:'123@g.us'}});
 const body={revision:0,players:[{...p,status:'Ativo'}],courts:[],games:[]};
 const put=()=>fetch('http://127.0.0.1:'+server.address().port+'/api/admin/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await put();assert.equal(result.status,200,await result.text());
 assert.equal(calls,0,'Approval must never call WhatsApp');
 assert.equal((await db.player.findUnique({where:{id:p.id}})).status,'Ativo');
 const queued=await db.outbox.findMany({where:{kind:'group_join'}});assert.equal(queued.length,1);assert.equal(queued[0].status,'pending');
 assert.deepEqual(JSON.parse(decrypt(queued[0].encryptedBody,config.MESSAGE_KEY)),{playerId:p.id,group:'123@g.us'});
 assert.equal((await put()).status,409);assert.equal(await db.outbox.count(),1);
 body.revision=1;assert.equal((await put()).status,200);assert.equal(await db.outbox.count(),1,'Saving again must not enqueue duplicate entry');
 console.log('PASS: approval commits without WhatsApp, entry queued atomically, stale/repeated requests do not duplicate. No messages sent.');
 }finally{await new Promise(r=>server.close(r));await db.$disconnect();}
 `).trim());
}finally{if(containerCreated)docker(['rm','-f',container]);if(dbCreated)docker(['exec','escada-database-1','dropdb','-U','escada',database]);}
