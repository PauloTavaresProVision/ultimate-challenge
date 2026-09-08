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
 docker(['cp','server/src/substitutions.ts',container+':/app/server/src/substitutions.ts']);
 docker(['exec',container,'npm','run','db:migrate']);
 const output=docker(['exec','-i',container,'node','--import','tsx','--input-type=module'],`
 import assert from 'node:assert/strict';import {handleParticipation,approveVacancy,vacancies,todayLuanda,participationIntent} from './src/substitutions.ts';import {db} from './src/db.ts';
 try {
 const group='12345@g.us';await db.setting.create({data:{key:'whatsapp_group',value:group}});await db.revision.create({data:{id:1}});
 for(let i=0;i<6;i++)await db.player.create({data:{id:'p'+i,name:'Player '+i,phone:'+24490000000'+i,birth:new Date('1990-01-01'),side:i%2?'Direita':'Esquerda',division:'M1',status:'Ativo',verified:true,note:''}});
 await db.court.create({data:{id:'court',name:'Court',location:'Club',active:true}});
 for(let i=0;i<4;i++)await db.game.create({data:{id:'g'+i,round:1,date:todayLuanda(),time:'18:'+String(i*10).padStart(2,'0'),duration:20,a:['p0','p1'],b:['p2','p3'],courtId:'court',division:'M1',published:true}});
 assert.equal(participationIntent('Talvez não posso jogar hoje'),null);assert.equal(participationIntent('não posso substituir'),null);assert.equal(participationIntent('sim'),'offer');
 assert.equal(participationIntent('hoje não posso jogar, alguém para me substituir?'),'absence');
 await handleParticipation(group,'+244900000000','afinal não posso jogar','ambiguous');assert.equal((await vacancies()).length,0);
 await Promise.all([handleParticipation(group,'+244900000000','hoje não posso jogar, alguém para me substituir?','absence-msg'),handleParticipation(group,'+244900000000','hoje não posso jogar','absence-msg')]);
 let v=(await vacancies())[0];assert.equal((await vacancies()).length,1);assert.equal(v.status,'pending');
 await handleParticipation(group,'+244900000004','sim','unrelated','other-message');assert.equal((await vacancies())[0].candidates.length,0);
 await handleParticipation(group,'+244900000004','sim','volunteer','absence-msg');v=(await vacancies())[0];assert.deepEqual(v.candidates,['p4']);assert((await db.game.findMany()).every(g=>g.a.includes('p0')));
 await assert.rejects(approveVacancy(v.id,'p5'));
 const results=await Promise.allSettled([approveVacancy(v.id,'p4'),approveVacancy(v.id,'p4')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert((await db.game.findMany()).every(g=>g.a.includes('p4')&&!g.a.includes('p0')));
 await db.game.update({where:{id:'g0'},data:{winner:'a'}});
 await handleParticipation(group,'+244900000002','hoje não posso jogar','late-absence');assert.equal((await vacancies()).length,1);assert.equal((await db.game.findUnique({where:{id:'g0'}})).winner,'a');
 await handleParticipation('other@g.us','+244900000001','hoje não posso jogar','other');assert.equal((await vacancies()).length,1);
 console.log('PASS: ambiguity, duplicate events, absence, volunteer pending approval, eligibility, concurrent approval, four-game replacement and protected results. No messages sent.');
 }finally{await db.$disconnect();}
 `);console.log(output.trim());
}finally{if(containerCreated)docker(['rm','-f',container]);if(dbCreated)docker(['exec','escada-database-1','dropdb','-U','escada',database]);}
