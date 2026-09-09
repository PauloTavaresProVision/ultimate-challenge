import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
let redactions=[];
const docker = (args, input) => { try { return execFileSync('docker', args, { encoding: 'utf8', input, stdio: ['pipe','pipe','pipe'] }); } catch(e) { let detail=args.includes('--input-type=module')?String(e.stderr??''):''; for(const value of redactions) detail=detail.split(value).join('[redacted]'); detail=detail.replace(/postgresql:\/\/\S+/g,'[database]'); throw new Error('Isolated Docker test failed. '+detail); } };
const source = JSON.parse(docker(['compose','--env-file','deploy/.env','-f','deploy/compose.yaml','config','--format','json'])).services.app.environment;
redactions=Object.values(source).filter(v=>typeof v==='string'&&v.length>3);
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
  docker(['cp','server/src/competition.ts',container+':/app/server/src/competition.ts']);
  docker(['cp','server/src/competition-rules.ts',container+':/app/server/src/competition-rules.ts']);
  docker(['cp','lib/tournament.ts',container+':/app/lib/tournament.ts']);
  docker(['exec','-i',container,'node','--import','tsx','--input-type=module'], `
    import assert from 'node:assert/strict';
    import {db} from './src/db.ts';
    import {runCompetition} from './src/competition.ts';
    for(const [d,division] of ['M1+','M1','M2+','M2'].entries()) for(let i=0;i<4;i++) await db.player.create({data:{id:'p'+d+i,name:'Player '+d+i,phone:'+244900000'+d+i,birth:new Date((1980+i)+'-01-01'),side:i%2?'Direita':'Esquerda',division,status:'Ativo',verified:true}});
    await db.court.create({data:{id:'c',name:'Test',location:'Isolated'}});
    for(const [d,division] of ['M1+','M1','M2+','M2'].entries()) await db.game.create({data:{id:'g'+d,round:1,division,a:['p'+d+0,'p'+d+1],b:['p'+d+2,'p'+d+3],courtId:'c',date:'2090-09-01',time:'18:00',duration:90,winner:'a',published:true}});
    await runCompetition('2090-09-14');
    assert.equal(await db.setting.count({where:{key:{startsWith:'competition:move:'}}}),0);
    await Promise.all([runCompetition('2090-09-15'),runCompetition('2090-09-15')]);
    assert.equal(await db.setting.count({where:{key:{startsWith:'competition:move:'}}}),1);
    assert.equal((await db.revision.findUnique({where:{id:1}})).value,1);
    assert.equal((await db.player.findUnique({where:{id:'p10'}})).division,'M1+');
    for(const [d,division] of ['M1+','M1','M2+','M2'].entries()) {
      const p=await db.player.findMany({where:{division},orderBy:{id:'asc'}});
      const left=p.filter(x=>x.side==='Esquerda'),right=p.filter(x=>x.side==='Direita');
      await db.game.create({data:{id:'second'+d,round:2,division,a:[left[0].id,right[0].id],b:[left[1].id,right[1].id],courtId:'c',date:'2090-09-20',time:'18:00',duration:90,winner:'a',published:true}});
    }
    await runCompetition('2090-09-29');
    await runCompetition('2090-10-01');
    await runCompetition('2090-10-01');
    const record=JSON.parse((await db.setting.findUnique({where:{key:'competition:month:2090-09'}})).value);
    assert.equal(record.champions.length,4);assert.ok(record.champions.every(c=>c.player));assert.equal(record.table.length,16);
    assert.ok(record.table.every(p=>p.wins+p.losses===2));assert.equal((await db.revision.findUnique({where:{id:1}})).value,3);
    assert.equal(await db.game.count(),8);
    await runCompetition('2090-10-13');
    assert.equal(JSON.parse((await db.setting.findUnique({where:{key:'competition:status'}})).value).blocked,null);
    assert.equal((await db.revision.findUnique({where:{id:1}})).value,4);
    await db.$disconnect();
  `);
  console.log('Isolated competition integration passed: 14-day boundaries, concurrent idempotence, division exchange, monthly snapshot, preserved games and zero-point cycles.');
} finally {
  if(createdContainer) docker(['rm','-f',container]);
  if(createdDatabase && /^escada_results_test_[a-f0-9]{10}$/.test(database)) docker(['exec','escada-database-1','dropdb','-U','escada',database]);
}
