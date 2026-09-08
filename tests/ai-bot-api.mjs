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
 docker(['cp','server/src/ai-bot.ts',container+':/app/server/src/ai-bot.ts']);
 for(const p of ['bot-intent.ts','substitutions.ts','bot-message.ts','bot-roster.ts','tournament-assistant.ts','tournament-queries.ts','public-calendar.ts'])docker(['cp','server/src/'+p,container+':/app/server/src/'+p]);
 for(const p of ['public-rules.ts','tournament.ts'])docker(['cp','lib/'+p,container+':/app/lib/'+p]);
 docker(['exec',container,'npm','run','db:migrate']);
 const output=docker(['exec','-i',container,'node','--import','tsx','--input-type=module'],`
 import assert from 'node:assert/strict';import {queryTournament} from './src/tournament-queries.ts';import {db} from './src/db.ts';import {encrypt} from './src/security.ts';import {config} from './src/config.ts';import {todayLuanda} from './src/substitutions.ts';
 try{
 await db.setting.create({data:{key:'openai_key',value:encrypt('fake-key-test',config.MESSAGE_KEY)}});
 for(let i=0;i<4;i++)await db.player.create({data:{id:'p'+i,name:'Player '+i,phone:'+24490000000'+i,birth:new Date('1990-01-01'),side:i%2?'Direita':'Esquerda',division:'M1',status:'Ativo',verified:true,note:''}});
 const q={topic:'players',division:'mine',name:'',from:'',to:'',mine:false,offset:0};
 const roster=await queryTournament('p0',q);assert.equal(roster.total,4);assert(!JSON.stringify(roster).includes('+244'));assert(!JSON.stringify(roster).includes('birth'));
 await db.player.create({data:{id:'pending',name:'Pending private',phone:'+244900000009',birth:new Date('1990-01-01'),side:'Direita',division:'M1',status:'Pendente',verified:true,note:'PRIVATE'}});
 assert.equal((await queryTournament('p0',q)).total,4);
 assert.equal((await queryTournament('p0',{...q,topic:'games',mine:true})).total,0);
 await db.court.create({data:{id:'c',name:'Campo real',location:'Clube real',active:true}});
 await db.game.create({data:{id:'g',round:1,date:todayLuanda(),time:'18:00',duration:20,a:['p0','p1'],b:['p2','p3'],courtId:'c',division:'M1',published:true}});
 const games=await queryTournament('p0',{...q,topic:'games',mine:true});assert.equal(games.items[0].court,'Campo real');assert.equal(games.items[0].a[1],'Player 1');
 await db.game.create({data:{id:'draft',round:2,date:todayLuanda(),time:'19:00',duration:20,a:['p0','p1'],b:['p2','p3'],courtId:'c',division:'M1',published:false}});
 assert.equal((await queryTournament('p0',{...q,topic:'games'})).total,1);
 assert.equal((await queryTournament('p0',{...q,topic:'standings'})).items[0].points,0);
 await assert.rejects(queryTournament('pending',q),/não autorizado/);
 assert.equal((await db.game.findUnique({where:{id:'g'}})).winner,null);
 console.log('PASS: database-backed roster, own games, draft exclusion, private-field exclusion, standings and authorization. No API requests or WhatsApp sends.');
 }finally{await db.$disconnect();}
 `);console.log(output.trim());
}finally{if(containerCreated)docker(['rm','-f',container]);if(dbCreated)docker(['exec','escada-database-1','dropdb','-U','escada',database]);}
