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
  assert.equal((await fetch(origin+'/api/admin/openai')).status,401);
  const login=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const request=(path='',method='GET',body,csrf=true)=>fetch(origin+'/api/admin/openai'+path,{method,headers:{Cookie:cookie,...(csrf?{Origin:origin}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  assert.deepEqual(await(await request()).json(),{configured:false,test:null});
  assert.equal((await request('/test','POST')).status,400);
  const fake='sk-not-a-real-key-test-fixture-only';
  assert.equal((await request('','PUT',{key:fake},false)).status,403);
  assert.equal((await request('','PUT',{key:'invalid'})).status,400);
  const saved=await(await request('','PUT',{key:fake})).json();assert.deepEqual(saved,{configured:true,test:null});assert.equal(JSON.stringify(saved).includes(fake),false);
  assert.deepEqual(await(await request()).json(),{configured:true,test:null});
  docker(['exec','-i',container,'node','--import','tsx','--input-type=module'], `
    import assert from 'node:assert/strict';import {db} from './src/db.ts';import {decrypt} from './src/security.ts';import {config} from './src/config.ts';
    const row=await db.setting.findUnique({where:{key:'openai_key'}});assert.ok(row&&!row.value.includes('sk-'));assert.equal(decrypt(row.value,config.MESSAGE_KEY),'sk-not-a-real-key-test-fixture-only');await db.$disconnect();
  `);
  assert.equal((await request('','DELETE')).status,200);assert.deepEqual(await(await request()).json(),{configured:false,test:null});
  console.log('Isolated OpenAI settings passed: access control, CSRF, input validation, encrypted storage, secret-free responses and deletion. No OpenAI requests made.');
} finally {
  if(createdContainer) docker(['rm','-f',container]);
  if(createdDatabase && /^escada_results_test_[a-f0-9]{10}$/.test(database)) docker(['exec','escada-database-1','dropdb','-U','escada',database]);
}
