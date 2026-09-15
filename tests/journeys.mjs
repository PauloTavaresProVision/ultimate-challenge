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
 for(const name of ['journeys.ts','bot-message.ts','journey-reference.ts','verification-queue.ts'])docker(['cp','server/src/'+name,container+':/app/server/src/'+name]);
 for(const name of ['journey.ts','journey-message.ts','journey-roster.ts','division-draw.ts','tournament.ts'])docker(['cp','lib/'+name,container+':/app/lib/'+name]);
 docker(['exec',container,'npm','run','db:migrate']);
 console.log(docker(['exec','-i',container,'node','--import','tsx','--input-type=module'],String.raw`
 import assert from 'node:assert/strict';import express from 'express';
 import {db} from './src/db.ts';import {decrypt} from './src/security.ts';import {config} from './src/config.ts';import {installJourneys,handleJourney} from './src/journeys.ts';
 const app=express();app.use(express.json());const auth=(_q,_s,n)=>n();installJourneys(app,auth,auth);app.use((e,q,s,n)=>s.status(e.status??500).json({error:e.message}));
 const server=app.listen(0);await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port+'/api/admin/journeys';
 const post=async(path,body={})=>{const r=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
 try{
 await db.revision.upsert({where:{id:1},create:{id:1,value:0},update:{value:0}});
 await db.setting.create({data:{key:'whatsapp_group',value:'123@g.us'}});
 for(let i=0;i<2;i++)await db.court.create({data:{id:'c'+i,name:'Court '+i,location:'Club',active:true}});
 for(let i=0;i<10;i++)await db.player.create({data:{id:'p'+i,name:'Player '+i,phone:'+2449000000'+String(i).padStart(2,'0'),birth:new Date('1990-01-01'),division:'M1',side:i%2?'Direita':'Esquerda',status:'Ativo',verified:true}});
 const {queueCode}=await import('./src/verification-queue.ts');
 await assert.rejects(db.$transaction(async tx=>{await queueCode(tx,'p0','+244900000000');throw Error('rollback');}));
 assert.equal(await db.verificationCode.count(),0);
 assert.equal(await db.outbox.count({where:{kind:'verification'}}),0);
 await db.$transaction(tx=>queueCode(tx,'p0','+244900000000'));
 assert.equal(await db.verificationCode.count(),1);
 assert.equal(await db.outbox.count({where:{kind:'verification'}}),1);
 const j=await post('',{id:'abcdef123456',division:'M1',date:'2099-01-06',time:'18:00',capacity:8,courtIds:['c0','c1'],message:'Vamos jogar {divisao}! {vagas} vagas.'});
 assert.ok(decrypt((await db.outbox.findUnique({where:{id:j.announcementId}})).encryptedBody,config.MESSAGE_KEY).startsWith('Vamos jogar M1! 8 vagas.'));
 await db.setting.create({data:{key:'outbox-message:'+j.announcementId,value:'zapi:test-instance:quoted-announcement'}});
 const phone=i=>'+2449000000'+String(i).padStart(2,'0');
 await Promise.all(Array.from({length:9},(_,i)=>handleJourney('123@g.us',phone(i),'estou in','event'+i,'quoted-announcement',{action:'join',journeyId:j.id})));
 const read=async()=>JSON.parse((await db.setting.findUnique({where:{key:'journey:'+j.id}})).value);
 let state=await read();assert.equal(state.confirmed.length,8);assert.equal(state.waiting.length,1);
 const publications=()=>db.outbox.count({where:{kind:'journey_announcement'}});
 assert.equal(await publications(),10); // opening + nine new registrations
 await handleJourney('123@g.us',phone(0),'estou in','duplicate-new-event','quoted-announcement',{action:'join',journeyId:j.id});
 assert.equal(await publications(),10);
 const roster=await db.outbox.findFirst({where:{kind:'journey_announcement',id:{not:j.announcementId}},orderBy:{createdAt:'desc'}});
 const rosterText=decrypt(roster.encryptedBody,config.MESSAGE_KEY);
 assert.match(rosterText,/Lista de espera/);assert.match(rosterText,/8 de 8 vagas/);
 assert.ok(await db.setting.findUnique({where:{key:'journey-message:'+roster.id}}));
 await db.setting.create({data:{key:'outbox-message:'+roster.id,value:'zapi:test-instance:roster'}});
 await handleJourney('123@g.us',phone(0),'estou in','reply-to-roster','roster',{action:'join',journeyId:null});
 assert.equal(await publications(),10);


 await handleJourney('123@g.us',phone(0),'quero entrar','event0','quoted-announcement');assert.equal((await read()).confirmed.length,8);
 const removed=state.confirmed[0],promoted=state.waiting[0];await handleJourney('123@g.us',phone(Number(removed.slice(1))),'quero sair','leave1','quoted-announcement');state=await read();assert.equal(state.confirmed.length,8);assert.ok(state.confirmed.includes(promoted));assert.equal(state.waiting.length,0);
 const confirmation=await db.outbox.findFirst({where:{kind:'journey_reply'},orderBy:{createdAt:'desc'}});
 await db.setting.create({data:{key:'outbox-message:'+confirmation.id,value:'zapi:test-instance:confirmation'}});
 await handleJourney('123@g.us',phone(9),'In','reply-confirmation','confirmation',{action:'join',journeyId:null});
 assert.ok((await read()).waiting.includes('p9'));
 await handleJourney('123@g.us',phone(9),'quero sair','leave-confirmation','confirmation',{action:'leave',journeyId:null});
 assert.equal((await read()).waiting.length,0);
 await db.setting.delete({where:{key:'journey-message:'+confirmation.id}});
 await handleJourney('123@g.us',phone(9),'In','legacy-confirmation','confirmation',{action:'join',journeyId:null});
 assert.ok((await read()).waiting.includes('p9'));
 await handleJourney('123@g.us',phone(9),'quero sair','legacy-leave','confirmation',{action:'leave',journeyId:null});
 await handleJourney('123@g.us',phone(9),'In','unknown-reference','unknown',{action:'join',journeyId:j.id});
 assert.equal((await read()).waiting.length,0);

 await post('/'+j.id+'/close');await handleJourney('123@g.us',phone(9),'quero entrar','closed1','quoted-announcement');assert.equal((await read()).confirmed.length,8);
 const sides=Object.fromEntries(state.confirmed.map((id,i)=>[id,i<4?'Esquerda':'Direita']));await post('/'+j.id+'/draw',{sides,courtIds:['c0','c1']});assert.equal(await db.game.count(),8);assert.equal((await read()).status,'drawn');
 console.log('PASS journeys: concurrent capacity, event deduplication, waitlist promotion, closed registration and confirmed-only draw. No messages sent.');
 }finally{await new Promise(r=>server.close(r));await db.$disconnect();}
 `).trim());
}finally{if(containerCreated)docker(['rm','-f',container]);if(dbCreated)docker(['exec','escada-database-1','dropdb','-U','escada',database]);}
