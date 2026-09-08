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
 docker(['cp','server/src/welcome.ts',container+':/app/server/src/welcome.ts']);
 docker(['exec',container,'npm','run','db:migrate']);
 const output=docker(['exec','-i',container,'node','--import','tsx','--input-type=module'],`
 import assert from 'node:assert/strict';import {queueWelcome,welcomeText} from './src/welcome.ts';import {db} from './src/db.ts';import {decrypt} from './src/security.ts';import {config} from './src/config.ts';
 try {
 const group='12345@g.us',jid='244900000001@s.whatsapp.net';
 await db.setting.create({data:{key:'whatsapp_group',value:group}});
 const player=await db.player.create({data:{name:'Jogador teste',phone:'+244900000001',birth:new Date('1990-01-01'),side:'Direita',division:'M1',status:'Pendente',verified:true,note:''}});
 await queueWelcome(group,[jid]);assert.equal(await db.outbox.count(),0);
 await db.player.update({where:{id:player.id},data:{status:'Ativo'}});
 await queueWelcome('other@g.us',[jid]);await queueWelcome(group,['123@lid']);assert.equal(await db.outbox.count(),0);
 await Promise.all([queueWelcome(group,[jid]),queueWelcome(group,[jid])]);
 assert.equal(await db.outbox.count(),1);await queueWelcome(group,[jid]);assert.equal(await db.outbox.count(),1);
 const row=await db.outbox.findFirst();assert.equal(row.recipient,group);assert.equal(row.kind,'welcome');
 const text=decrypt(row.encryptedBody,config.MESSAGE_KEY);assert(text.includes('M1'));assert(text.includes('direita'));assert(text.includes('/regras'));assert(!text.includes('18:00'));assert(!text.includes('primeiro jogo'));
 console.log('PASS: approved players only, selected group only, phone identity, concurrent deduplication, persistent replay protection and welcome text. No messages sent.');
 }finally{await db.$disconnect();}
 `);console.log(output.trim());
}finally{if(containerCreated)docker(['rm','-f',container]);if(dbCreated)docker(['exec','escada-database-1','dropdb','-U','escada',database]);}
