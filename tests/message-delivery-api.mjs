import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const docker = (args, input) => { try { return execFileSync('docker', args, { encoding: 'utf8', input, stdio: ['pipe','pipe','pipe'] }); } catch { throw new Error('An isolated Docker test step failed. Credentials omitted.'); } };
const source = JSON.parse(docker(['compose','--env-file','deploy/.env','-f','deploy/compose.yaml','config','--format','json'])).services.app.environment;
const suffix = randomBytes(5).toString('hex');
const database = `escada_results_test_${suffix}`;
const container = `escada-results-test-${suffix}`;
const origin = 'http://localhost:3101';
let createdDatabase = false, createdContainer = false;
try {
  docker(['exec','escada-database-1','createdb','-U','escada',database]); createdDatabase = true;
  const url = new URL(source.DATABASE_URL); url.pathname = '/' + database;
  const env = { ...source, DATABASE_URL: url.toString(), APP_ORIGIN: origin, WA_AUTO_CONNECT: 'false', ADMIN_EMAIL: 'test@example.invalid', ADMIN_PASSWORD: randomBytes(24).toString('hex'), SESSION_SECRET: randomBytes(32).toString('hex'), MESSAGE_KEY: randomBytes(32).toString('hex') };
  docker(['run','-d','--name',container,'--network','escada_default','-p','127.0.0.1:3101:3100',...Object.entries(env).flatMap(([k,v])=>['-e',`${k}=${v}`]),'escada-app']); createdContainer = true;
  let healthy = false;
  for(let i=0;i<40;i++){ try { if((await fetch(origin+'/api/health')).ok) { healthy=true; break; } } catch {} await new Promise(r=>setTimeout(r,500)); }
  assert.ok(healthy, 'Isolated test server started');
  const login=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD})});
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const request=(path,method='GET',body,csrf=true)=>fetch(origin+'/api'+path,{method,headers:{Cookie:cookie,...(csrf?{Origin:origin}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  assert.equal((await fetch(origin+'/api/admin/messages')).status,401);
  assert.equal((await request('/admin/message-delivery','PUT',{mode:'scheduled',hoursBefore:24},false)).status,403);
  assert.equal((await request('/admin/message-delivery','PUT',{mode:'scheduled',hoursBefore:0})).status,400);
  assert.equal((await request('/admin/message-delivery','PUT',{mode:'scheduled',hoursBefore:24})).status,200);
  docker(['exec','-i',container,'node','--import','tsx','--input-type=module'], `
    import {db} from './src/db.ts';
    for(let i=1;i<=4;i++) await db.player.create({data:{id:'p'+i,name:'Test '+i,phone:'+24490000000'+i,birth:new Date('1980-01-01'),side:i%2?'Esquerda':'Direita',division:'M1',status:'Ativo',verified:true}});
    await db.court.create({data:{id:'court',name:'Test court',location:'Isolated test'}});
    await db.setting.create({data:{key:'whatsapp_group',value:'100@g.us'}});
    await db.outbox.create({data:{id:'private',kind:'otp',recipient:'test',encryptedBody:'',expiresAt:new Date('2099-01-01')}});
    await db.$disconnect();
  `);
  const snapshot=await(await request('/admin/state')).json();
  snapshot.games=[{id:'game',round:1,division:'M1',a:['p1','p2'],b:['p3','p4'],court:'court',date:'2099-09-10',time:'18:00',duration:90,winner:null,published:true}];
  assert.equal((await request('/admin/state','PUT',snapshot)).status,200);
  const messages=await(await request('/admin/messages')).json();const row=messages.find(m=>m.kind==='round');assert.ok(row);
  assert.equal(row.nextAttemptAt,'2099-09-09T17:00:00.000Z');assert.equal(row.expiresAt,'2099-09-10T17:00:00.000Z');assert.equal(row.status,'pending');assert.equal(Object.hasOwn(row,'encryptedBody'),false);assert.equal(Object.hasOwn(row,'recipient'),false);
  await request('/admin/message-delivery','PUT',{mode:'immediate',hoursBefore:24});
  assert.equal((await(await request('/admin/messages')).json()).find(m=>m.id===row.id).nextAttemptAt,row.nextAttemptAt);
  assert.equal((await request('/admin/messages/private/cancel','POST')).status,409);
  assert.equal((await request('/admin/messages/'+row.id+'/cancel','POST')).status,200);
  assert.equal((await request('/admin/messages/'+row.id+'/cancel','POST')).status,409);
  assert.equal((await(await request('/admin/messages')).json()).find(m=>m.id===row.id).status,'cancelled');
  console.log('Isolated messaging API passed: scheduling on publication, timezone, expiry, settings scope, cancellation, auth, CSRF and private-content exclusion. WhatsApp disabled; no messages sent.');
} catch(e) {
  if(createdContainer) { let logs=docker(['logs','--tail','35',container]); for(const value of Object.values(source)) if(typeof value==='string'&&value.length>3) logs=logs.split(value).join('[redacted]'); console.log(logs.replace(/postgresql:\/\/\S+/g,'[database]')); }
  throw e;
} finally {
  if(createdContainer) docker(['rm','-f',container]);
  if(createdDatabase && /^escada_results_test_[a-f0-9]{10}$/.test(database)) docker(['exec','escada-database-1','dropdb','-U','escada',database]);
}
