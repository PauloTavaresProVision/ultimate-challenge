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
 for(const p of ['bot-intent.ts','substitutions.ts'])docker(['cp','server/src/'+p,container+':/app/server/src/'+p]);
 for(const p of ['public-rules.ts','tournament.ts'])docker(['cp','lib/'+p,container+':/app/lib/'+p]);
 docker(['exec',container,'npm','run','db:migrate']);
 const output=docker(['exec','-i',container,'node','--import','tsx','--input-type=module'],`
 import assert from 'node:assert/strict';import {answerQuestion} from './src/ai-bot.ts';import {db} from './src/db.ts';import {encrypt} from './src/security.ts';import {config} from './src/config.ts';import {todayLuanda} from './src/substitutions.ts';
 try{
 await db.setting.create({data:{key:'openai_key',value:encrypt('fake-key-test',config.MESSAGE_KEY)}});
 for(let i=0;i<4;i++)await db.player.create({data:{id:'p'+i,name:'Player '+i,phone:'+24490000000'+i,birth:new Date('1990-01-01'),side:i%2?'Direita':'Esquerda',division:'M1',status:'Ativo',verified:true,note:''}});
 const classify=async()=>({intent:'games',when:'today',division:'mine',section:-1});
 assert((await answerQuestion('p0','Tenho jogo hoje?',classify)).includes('não tens jogos publicados para hoje'));
 await db.court.create({data:{id:'c',name:'Campo real',location:'Clube real',active:true}});
 await db.game.create({data:{id:'g',round:1,date:todayLuanda(),time:'18:00',duration:20,a:['p0','p1'],b:['p2','p3'],courtId:'c',division:'M1',published:true}});
 const answer=await answerQuestion('p0','Tenho jogo hoje?',classify);assert(answer.includes('Campo real'));assert(answer.includes('18:00'));assert(answer.includes('Player 1'));assert(!answer.includes('+244'));
 assert.equal(await answerQuestion('p0','Bom dia',async()=>({intent:'silent',when:'next',division:'mine',section:-1})),null);
 const points=await answerQuestion('p0','Quantos pontos?',async()=>({intent:'points',when:'next',division:'mine',section:-1}));assert(points.includes('0 pontos'));
 await assert.rejects(answerQuestion('p0','Limite',classify),/Limite/);
 assert.equal((await db.game.findUnique({where:{id:'g'}})).winner,null);
 console.log('PASS: real game lookup, Luanda date, missing games, quiet messages, points, no phone leakage, rate limits and read-only domain data. Provider mocked; no messages sent.');
 }finally{await db.$disconnect();}
 `);console.log(output.trim());
}finally{if(containerCreated)docker(['rm','-f',container]);if(dbCreated)docker(['exec','escada-database-1','dropdb','-U','escada',database]);}
