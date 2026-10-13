import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{DATABASE_URL:'postgresql://localhost/unused',APP_ORIGIN:'https://test.invalid',SESSION_SECRET:'s'.repeat(32),MESSAGE_KEY:'a'.repeat(64),ADMIN_EMAIL:'test@example.com',ADMIN_PASSWORD:'test-password'});
const {installRoundMessages,legacyRoundMatches}=await import('../src/round-messages.ts');
const {roundAnnouncement}=await import('../src/round-announcement.ts');
const {encrypt,decrypt}=await import('../src/security.ts');
const {db}=await import('../src/db.ts');
const scope={round:3,division:'M1' as const,date:'2099-10-14'};
const players=['a','b','c','d'].map((id,i)=>({id,name:'Player '+id,phone:'+24490000000'+i}));
const games=[{...scope,id:'g',time:'20:00',courtId:'c',court:'c',published:true,winner:null,a:['a','b'],b:['c','d']}];
const courts=[{id:'c',location:'Premier'}];
const body=encrypt(JSON.stringify(roundAnnouncement(games,players,courts,'https://test.invalid')),'a'.repeat(64));

test('Legacy recognition keeps M1 and M1+ announcements separate',()=>{
 assert.equal(legacyRoundMatches(body,scope),true);
 assert.equal(legacyRoundMatches(body,{...scope,division:'M1+'}),false);
 assert.equal(legacyRoundMatches(body,{...scope,date:'2099-10-13'}),false);
 assert.equal(legacyRoundMatches('invalid',scope),false);
});

test('Send now accelerates the existing announcement, deduplicates clicks, and protects in-flight sends',async()=>{
 const routes=new Map<string,any[]>(),auth=()=>{},admin=()=>{};
 installRoundMessages({get:(p:string,...h:any[])=>routes.set('GET '+p,h),post:(p:string,...h:any[])=>routes.set('POST '+p,h)} as any,auth,admin);
 for(const h of routes.values()){assert.equal(h[0],auth);assert.equal(h[1],admin);}
 const post=routes.get('POST /api/admin/round-message/send')!.at(-1);
 const original=db.$transaction;
 for(const scenario of ['scheduled','empty','paused','sending','uncertain','attempted','draft','absent','group','sent']){
  const settings=new Map<string,string>([['whatsapp_group','group']]);
  if(scenario==='paused')settings.set('whatsapp-automatic-paused','true');
  if(scenario==='absent')settings.set('absence:v',JSON.stringify({...scope,status:'pending'}));
  const old:any={id:'scheduled',recipient:'group',kind:'round',status:['sending','uncertain','sent'].includes(scenario)?scenario:'pending',attempts:scenario==='attempted'?1:0,encryptedBody:body,nextAttemptAt:new Date('2099-10-13'),expiresAt:new Date('2099-10-14'),createdAt:new Date()};
  const rows=new Map<string,any>(scenario==='empty'?[]:[['scheduled',old]]);let audits=0;
  const tx:any={revision:{update:async()=>{}},$executeRaw:async()=>{},audit:{create:async()=>{audits++;}},game:{findMany:async()=>games.map(g=>({...g,published:scenario!=='draft'}))},player:{findMany:async()=>players},court:{findMany:async()=>courts},
   setting:{findUnique:async({where}:any)=>settings.has(where.key)?{value:settings.get(where.key)}:null,findMany:async({where}:any)=>[...settings].filter(([k])=>k.startsWith(where.key.startsWith)).map(([key,value])=>({key,value})),upsert:async({where,create}:any)=>{settings.set(where.key,create.value);},create:async({data}:any)=>{settings.set(data.key,data.value);}},
   outbox:{findMany:async()=>[...rows.values()],update:async({where,data}:any)=>{rows.set(where.id,{...rows.get(where.id),...data});},create:async({data}:any)=>{rows.set(data.id,{...data,status:'pending',attempts:0});},updateMany:async()=>({count:0})}};
  db.$transaction=(async(fn:any)=>fn(tx)) as any;
  const input={...scope,group:scenario==='group'?'wrong':'group',requestId:'10000000-0000-4000-8000-000000000001'};
  const run=()=>post({body:input},{locals:{session:{adminId:'admin'}},json:()=>{}});
  try{
   if(['scheduled','empty'].includes(scenario)){
    await run();await run();assert.equal(rows.size,1);assert.equal(audits,1);
    const message=[...rows.values()][0];assert.ok(message.nextAttemptAt<=new Date());assert.equal(message.id,scenario==='scheduled'?'scheduled':input.requestId);
    assert.ok(JSON.parse(decrypt(message.encryptedBody,'a'.repeat(64))).mentions.includes('244900000000@s.whatsapp.net'));
    assert.ok(settings.has('round-message:'+message.id));
   }else{await assert.rejects(run);assert.equal(audits,0);assert.equal(rows.size,1);assert.equal(old.nextAttemptAt.toISOString(),'2099-10-13T00:00:00.000Z');}
  }finally{db.$transaction=original;}
 }
 await db.$disconnect();
});
