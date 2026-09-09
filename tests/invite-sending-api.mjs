import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const docker=(args,input)=>{try{return execFileSync('docker',args,{encoding:'utf8',input,stdio:['pipe','pipe','pipe']});}catch{throw Error('Isolated invitation test failed; credentials omitted.');}};
const source=JSON.parse(docker(['compose','--env-file','deploy/.env','-f','deploy/compose.yaml','config','--format','json'])).services.app.environment;
const suffix=randomBytes(5).toString('hex'),database='escada_results_test_'+suffix,container='escada-invites-test-'+suffix;
let dbCreated=false,containerCreated=false;
try{
 docker(['exec','escada-database-1','createdb','-U','escada',database]);dbCreated=true;
 const url=new URL(source.DATABASE_URL);url.pathname='/'+database;
 const env={...source,DATABASE_URL:url.toString(),WA_AUTO_CONNECT:'false'};
 docker(['run','-d','--name',container,'--network','escada_default',...Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]),'--entrypoint','sleep','escada-app','300']);containerCreated=true;
 docker(['cp','server/src/invite-sending.ts',container+':/app/server/src/invite-sending.ts']);
 docker(['exec',container,'npm','run','db:migrate']);
 const output=docker(['exec','-i',container,'node','--import','tsx','--input-type=module'],`
 import express from 'express';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
 import {installInviteSending} from './src/invite-sending.ts';import {db} from './src/db.ts';import {decrypt} from './src/security.ts';import {config} from './src/config.ts';
 const app=express();app.use(express.json());let connected=true;
 installInviteSending(app,(q,r,n)=>q.headers.authorization==='test'?n():r.sendStatus(401),(q,r,n)=>n(),()=>connected);
 app.use((e,q,r,n)=>r.status(e.status??400).json({error:'invalid'}));
 const server=app.listen(3200,'127.0.0.1');
 const request=(body,auth=true)=>fetch('http://127.0.0.1:3200/api/admin/invite-deliveries',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'test'}:{})},body:JSON.stringify(body)});
 try{
 const input={batchId:randomUUID(),phones:['+244900000001','+351900000002','+244900000001'],message:'Convite de teste'};
 assert.equal((await request(input,false)).status,401);
 assert.equal((await request({...input,phones:['invalid']})).status,400);
 connected=false;assert.equal((await request(input)).status,409);connected=true;
 const responses=await Promise.all([request(input),request(input)]);assert(responses.every(r=>r.status===200));
 const results=await Promise.all(responses.map(r=>r.json()));assert.deepEqual(results[0],results[1]);assert.equal(results[0].recipients.length,2);
 assert.equal(await db.invite.count(),2);assert.equal(await db.outbox.count(),2);
 const messages=await db.outbox.findMany();const bodies=messages.map(m=>decrypt(m.encryptedBody,config.MESSAGE_KEY));assert(bodies.every(b=>b.includes('/inscricao?convite=')));assert.notEqual(bodies[0],bodies[1]);
 const bindings=await db.setting.findMany({where:{key:{startsWith:'invite-target:'}}});assert.equal(bindings.length,2);
 const status=await fetch('http://127.0.0.1:3200/api/admin/invite-deliveries/'+input.batchId,{headers:{Authorization:'test'}});assert.equal(status.status,200);assert((await status.json()).every(r=>r.status==='pending'));
 const history=()=>fetch('http://127.0.0.1:3200/api/admin/invite-history',{headers:{Authorization:'test'}}).then(r=>r.json());
 const before=await history();assert.equal(before.total,2);assert(before.items.every(i=>i.registration==='pending'));assert(!JSON.stringify(before).includes('encryptedBody'));
 assert.equal((await request({...input,batchId:randomUUID()})).status,409);
 await db.outbox.updateMany({data:{status:'sent'}});
 const resend={batchId:randomUUID(),phones:['+244900000001'],message:'Reenvio'};
 assert.equal((await request(resend)).status,200);assert.equal((await history()).total,3);
 await db.player.create({data:{name:'Jogador inscrito',phone:'+351900000002',birth:new Date('1990-01-01'),side:'Direita',division:'M1',verified:true,status:'Pendente'}});
 const registered=(await history()).items.find(i=>i.phone==='+351900000002');assert.equal(registered.registration,'registered');assert.equal(registered.canResend,false);
 assert.equal((await request({batchId:randomUUID(),phones:['+351900000002'],message:'Não reenviar'})).status,409);
 console.log('PASS: validation, connection guard, duplicate recipients, concurrent idempotency, individual encrypted links, phone binding and status. No messages sent.');
 }finally{server.close();await db.$disconnect();}
 `);console.log(output.trim());
}finally{if(containerCreated)docker(['rm','-f',container]);if(dbCreated)docker(['exec','escada-database-1','dropdb','-U','escada',database]);}
