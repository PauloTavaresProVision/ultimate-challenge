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
 docker(['cp','server/src/public-rules.ts',container+':/app/server/src/public-rules.ts']);
 docker(['cp','server/src/public-calendar.ts',container+':/app/server/src/public-calendar.ts']);
 for(const p of ['weekly-calendar.ts','tournament.ts'])docker(['cp','lib/'+p,container+':/app/lib/'+p]);
 docker(['cp','server/src/calendar.ts',container+':/app/server/src/calendar.ts']);
 docker(['cp','lib/public-rules.ts',container+':/app/lib/public-rules.ts']);
 docker(['exec',container,'npm','run','db:migrate']);
 const output=docker(['exec','-i',container,'node','--import','tsx','--input-type=module'],`
 import express from 'express';import assert from 'node:assert/strict';import {installRules} from './src/public-rules.ts';import {db} from './src/db.ts';import {installCalendar} from './src/calendar.ts';
 const app=express();app.use(express.json());installCalendar(app,(q,r,n)=>q.headers.authorization==='test'?n():r.sendStatus(401),(q,r,n)=>n());installRules(app,(q,r,n)=>q.headers.authorization==='test'?n():r.sendStatus(401),(q,r,n)=>n());app.use((e,q,r,n)=>r.status(e.status??400).json({error:'invalid'}));const server=app.listen(3200,'127.0.0.1');
 const get=()=>fetch('http://127.0.0.1:3200/api/rules');const put=(body,auth=true)=>fetch('http://127.0.0.1:3200/api/admin/rules',{method:'PUT',headers:{'Content-Type':'application/json',...(auth?{Authorization:'test'}:{})},body:JSON.stringify(body)});
 try{
 const calendarUrl='http://127.0.0.1:3200/api/admin/calendar';
 const readCalendar=()=>fetch(calendarUrl,{headers:{Authorization:'test'}}).then(r=>r.json());
 const writeCalendar=body=>fetch(calendarUrl,{method:'PUT',headers:{Authorization:'test','Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await fetch(calendarUrl)).status,401);
 const calendar=await readCalendar();assert.equal(calendar.divisions.M1.weekday,2);assert.equal(calendar.divisions['M2+'].weekday,3);
 calendar.divisions.M1={weekday:4,time:'20:15'};
 assert.equal((await writeCalendar(calendar)).status,200);
 assert.deepEqual(await readCalendar(),calendar);
 const publicView=await(await get()).json();assert.equal(publicView.calendar.divisions.find(d=>d.division==='M1').day,'Quinta-feira');assert.equal(publicView.calendar.divisions.find(d=>d.division==='M1').time,'20:15');
 assert.equal((await writeCalendar({weekday:2,time:'18:00'})).status,400);
 const first=await(await get()).json();assert.equal(first.version,0);assert.equal(first.rules.sections.length,8);assert.equal((await put(first,false)).status,401);assert.equal((await put({...first,rules:{...first.rules,sections:[]}})).status,400);
 const updated={...first,rules:{...first.rules,title:'Regulamento editado'}};assert.equal((await put(updated)).status,200);assert.equal((await(await get()).json()).rules.title,'Regulamento editado');assert.equal((await put(updated)).status,409);assert.equal(await db.audit.count(),1);console.log('PASS: public defaults, authenticated editing, validation, persistence and stale-update protection.');}finally{server.close();await db.$disconnect();}
 `);console.log(output.trim());
}finally{if(containerCreated)docker(['rm','-f',container]);if(dbCreated)docker(['exec','escada-database-1','dropdb','-U','escada',database]);}
