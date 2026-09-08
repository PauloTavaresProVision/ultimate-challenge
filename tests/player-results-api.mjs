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
  docker(['exec','-i',container,'node','--import','tsx','--input-type=module'], `
    import { db } from './src/db.ts';
    import { digest } from './src/security.ts';
    for(let i=1;i<=6;i++) {
      await db.player.create({data:{id:'p'+i,name:'Test '+i,phone:'+24490000000'+i,birth:new Date('1980-01-01'),side:i%2?'Esquerda':'Direita',division:'M1',status:i===6?'Pendente':'Ativo',verified:true}});
      await db.session.create({data:{tokenHash:digest('test-session-'+i),playerId:'p'+i,expiresAt:new Date(Date.now()+600000)}});
    }
    await db.court.create({data:{id:'court',name:'Test court',location:'Isolated test'}});
    for(const id of ['race','hidden','future']) await db.game.create({data:{id,round:1,division:'M1',a:['p1','p2'],b:['p3','p4'],courtId:'court',date:id==='future'?'2099-01-01':'2026-01-01',time:'18:00',duration:90,published:id!=='hidden'}});
    await db.$disconnect();
  `);
  const request = (id, player, outcome='win', csrf=true) => fetch(origin+`/api/games/${id}/result`,{method:'POST',headers:{...(csrf?{Origin:origin}:{}),'Content-Type':'application/json',...(player?{Cookie:`escada_session=test-session-${player}`}:{})},body:JSON.stringify({outcome})});
  assert.equal((await request('race',null)).status,401);
  assert.equal((await request('race',1,'win',false)).status,403);
  assert.equal((await request('race',6)).status,403);
  assert.equal((await request('race',5)).status,403);
  assert.equal((await request('hidden',1)).status,404);
  assert.equal((await request('future',1)).status,409);
  assert.equal((await request('race',1,'invalid')).status,400);
  const replies=await Promise.all([request('race',1),request('race',3)]);
  assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
  assert.equal((await request('race',2)).status,409);
  const games=await(await fetch(origin+'/api/games',{headers:{Cookie:'escada_session=test-session-1'}})).json();
  assert.ok(games.games.find(g=>g.id==='race').winner);
  assert.equal(games.games.some(g=>g.id==='hidden'),false);
  const check = JSON.parse(docker(['exec','-i',container,'node','--import','tsx','--input-type=module'], `import {db} from './src/db.ts'; console.log(JSON.stringify({revision:(await db.revision.findUnique({where:{id:1}})).value,audits:await db.audit.count()})); await db.$disconnect();`));
  assert.equal(check.revision,1); assert.equal(check.audits,1);
  console.log('Isolated results API passed: eligibility, participant access, hidden/future games, validation, concurrent submissions, persistence and audit. No production data or messages used.');
} finally {
  if(createdContainer) docker(['rm','-f',container]);
  if(createdDatabase && /^escada_results_test_[a-f0-9]{10}$/.test(database)) docker(['exec','escada-database-1','dropdb','-U','escada',database]);
}
