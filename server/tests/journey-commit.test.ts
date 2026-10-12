import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{DATABASE_URL:'postgresql://localhost/unused',APP_ORIGIN:'https://test.invalid',SESSION_SECRET:'s'.repeat(32),MESSAGE_KEY:'a'.repeat(64),ADMIN_EMAIL:'test@example.com',ADMIN_PASSWORD:'test-password'});
const {db}=await import('../src/db.ts');
const {encrypt}=await import('../src/security.ts');
const {handleJourneyConversation}=await import('../src/journey-conversation.ts');

test('Production participation handler cannot register or clear memory before ordered commit permission',async()=>{
 const originals={find:db.setting.findUnique,list:db.setting.findMany,del:db.setting.deleteMany,player:db.player.findUnique,inbox:db.groupInbox.findUnique,rate:db.rateLimit.upsert,transaction:db.$transaction};
 let granted=false,transactions=0,deletes=0;
 db.setting.findUnique=(async({where}:any)=>where.key==='openai_key'?{value:encrypt('synthetic','a'.repeat(64))}:null) as any;
 db.setting.findMany=(async()=>[{value:JSON.stringify({id:'one',group:'test@g.us',date:'2099-01-01',time:'20:00',status:'open',division:'M1',confirmed:[],waiting:[]})}]) as any;
 db.setting.deleteMany=(async()=>{assert.equal(granted,true);deletes++;return {count:1};}) as any;
 db.player.findUnique=(async()=>({id:'person',verified:true,status:'Ativo',division:'M1',name:'Test'})) as any;
 db.groupInbox.findUnique=(async()=>({encryptedDecision:encrypt(JSON.stringify({action:'join',journeyId:'one'}),'a'.repeat(64))})) as any;
 db.rateLimit.upsert=(async()=>({count:1})) as any;
 db.$transaction=(async()=>{assert.equal(granted,true);transactions++;return true;}) as any;
 try{
  await assert.rejects(handleJourneyConversation('test@g.us','+244900000001','In','event',undefined,undefined,async()=>{throw Error('Older event is pending');}),/Older event/);
  assert.equal(transactions,0);assert.equal(deletes,0);
  assert.equal(await handleJourneyConversation('test@g.us','+244900000001','In','event',undefined,undefined,async()=>{granted=true;}),true);
  assert.equal(transactions,1);assert.equal(deletes,1);
 }finally{
  db.setting.findUnique=originals.find;db.setting.findMany=originals.list;db.setting.deleteMany=originals.del;db.player.findUnique=originals.player;db.groupInbox.findUnique=originals.inbox;db.rateLimit.upsert=originals.rate;db.$transaction=originals.transaction;await db.$disconnect();
 }
});
