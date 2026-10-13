import {test} from 'node:test';
import assert from 'node:assert/strict';
import {managementRounds} from '../../lib/round-management.ts';
import type {Game} from '../../lib/tournament.ts';
Object.assign(process.env,{DATABASE_URL:'postgresql://localhost/unused',APP_ORIGIN:'https://test.invalid',SESSION_SECRET:'s'.repeat(32),MESSAGE_KEY:'a'.repeat(64),ADMIN_EMAIL:'test@example.com',ADMIN_PASSWORD:'test-password'});
const {installSubstitutions,todayLuanda}=await import('../src/substitutions.ts');
const {db}=await import('../src/db.ts');
const {installJourneys}=await import('../src/journeys.ts');

test('Management separates dates and divisions, archives completed games and retains today drafts',()=>{
 const game={round:3,date:'2026-10-13',division:'M2+',a:['a','b'],b:['c','d'],published:false,winner:null,time:'20:00',court:'c',duration:20} as Game;
 const rows=managementRounds([{...game,id:'today'},{...game,id:'old',date:'2026-10-06',round:2,published:true},{...game,id:'tomorrow',date:'2026-10-14',division:'M1'},{...game,id:'done',division:'M1+',published:true,winner:'a'}],'2026-10-13');
 assert.equal(rows.length,4);
 assert.equal(rows.filter(r=>!r.past).length,2);
 assert.equal(rows.find(r=>r.division==='M2+'&&r.round===3)?.draft,true);
 assert.equal(rows.find(r=>r.division==='M1+')?.past,true);
 assert.equal(managementRounds(rows.flatMap(r=>r.games),'2026-10-13','M1').length,1);
});

test('Manual registrations are idempotent, promote only when space exists and reject drawn journeys',async()=>{
 const routes=new Map<string,any[]>(),auth=()=>{},admin=()=>{};
 installJourneys({get:(p:string,...h:any[])=>routes.set(p,h),post:(p:string,...h:any[])=>routes.set(p,h)} as any,auth,admin);
 const handlers=routes.get('/api/admin/journeys/:id/players')!;
 assert.equal(handlers[0],auth);assert.equal(handlers[1],admin);
 const handler=handlers.at(-1),original=db.$transaction;
 let j:any={id:'j',division:'M2+',date:'2099-01-01',time:'20:00',group:'group',status:'open',capacity:1,confirmed:[],waiting:[]};let sends=0;
 const tx:any={$executeRaw:async()=>{},audit:{create:async()=>{}},
  player:{findUnique:async({where}:any)=>({id:where.id,name:where.id,phone:'+244900000001',status:'Ativo',verified:true,division:'M2+'}),findMany:async()=>j.confirmed.map((id:string)=>({id,name:id}))},
  setting:{findMany:async()=>[{value:JSON.stringify(j)}],findUnique:async()=>null,upsert:async({where,update}:any)=>{if(where.key==='journey:j')j=JSON.parse(update.value);},create:async()=>{}},
  outbox:{create:async()=>({id:String(++sends)})}};
 db.$transaction=(async(fn:any)=>fn(tx)) as any;
 const run=(playerId:string,action:string)=>handler({params:{id:'j'},body:{playerId,action}},{locals:{session:{adminId:'admin'}},json:()=>{}});
 try{
  await run('first','join');assert.deepEqual(j.confirmed,['first']);const once=sends;
  await run('first','join');assert.equal(sends,once);
  await run('second','join');assert.deepEqual(j.waiting,['second']);
  await assert.rejects(run('second','promote'),/não há vagas/);
  await run('first','leave');assert.deepEqual(j.confirmed,[]);assert.deepEqual(j.waiting,['second']);
  await run('second','promote');assert.deepEqual(j.confirmed,['second']);assert.deepEqual(j.waiting,[]);
  j.status='drawn';await assert.rejects(run('third','join'),/já não permite/);
 }finally{db.$transaction=original;}
});

test('Admin replacement supports drafts and published games, synchronizes roster, rejects unsafe changes atomically',async()=>{
 const routes=new Map<string,any[]>(),auth=()=>{},admin=()=>{};
 installSubstitutions({get:(p:string,...h:any[])=>routes.set('GET '+p,h),post:(p:string,...h:any[])=>routes.set('POST '+p,h)} as any,auth,admin);
 for(const h of routes.values()){assert.equal(h[0],auth);assert.equal(h[1],admin);}
 const replace=routes.get('POST /api/admin/substitutions/replace')!.at(-1);
 const original=db.$transaction;
 for(const scenario of ['draft','published','result','past','conflict','closed','forbidden']){
  const date=scenario==='past'?'2000-01-01':todayLuanda();
  const players=[{id:'out',name:'Pedro',side:'Esquerda',division:'M1+',verified:true,status:'Ativo'},{id:'in',name:scenario==='forbidden'?'Sérgio Vieira':'HP',side:'Esquerda',division:'M1+',verified:true,status:'Ativo'},{id:'partner',name:scenario==='forbidden'?'Ivo Guilherme Rêgo':'Partner',side:'Direita',division:'M1+',verified:true,status:'Ativo'}];
  let games=Array.from({length:4},(_,i)=>({id:'g'+i,round:3,date,division:'M1+',published:scenario==='published',winner:scenario==='result'&&i===0?'a':null,duration:20,a:['out','partner'],b:['x','y']}));
  let settings=new Map<string,string>([['whatsapp_group','group'],['journey:j',JSON.stringify({id:'j',division:'M1+',date,confirmed:['out','partner','x','y'],waiting:['in'],status:'drawn'})]]);
  if(scenario==='closed')settings.set('competition:month:'+date.slice(0,7),'{}');
  let notices=0;
  const tx:any={
   $executeRaw:async()=>{},revision:{update:async()=>{}},audit:{create:async()=>{}},outbox:{create:async()=>{notices++;}},
   setting:{findMany:async({where}:any)=>[...settings].filter(([key])=>key.startsWith(where.key.startsWith)).map(([key,value])=>({key,value})),findUnique:async({where}:any)=>settings.has(where.key)?{value:settings.get(where.key)}:null,create:async({data}:any)=>{settings.set(data.key,data.value);},update:async({where,data}:any)=>{settings.set(where.key,data.value);}},
   player:{findUnique:async({where}:any)=>players.find(p=>p.id===where.id)},
   game:{findMany:async({where}:any)=>games.filter(g=>where.id?where.id.in.includes(g.id):g.round===where.round),count:async()=>scenario==='conflict'?1:0,update:async({where,data}:any)=>{games=games.map(g=>g.id===where.id?{...g,...data}:g);}},
  };
  db.$transaction=(async(fn:any)=>{const beforeGames=structuredClone(games),beforeSettings=new Map(settings);try{return await fn(tx);}catch(e){games=beforeGames;settings=beforeSettings;throw e;}}) as any;
  try{
   const run=()=>replace({body:{round:3,playerId:'out',substituteId:'in'}},{json:()=>{}});
   if(['draft','published'].includes(scenario)){
    await run();assert.equal(games.filter(g=>g.a[0]==='in').length,4);
    const journey=JSON.parse(settings.get('journey:j')!);assert.ok(journey.confirmed.includes('in'));assert.ok(!journey.confirmed.includes('out'));assert.deepEqual(journey.waiting,[]);
    assert.equal(notices,scenario==='published'?1:0);
    assert.equal(games.every(g=>g.published===(scenario==='published')),true);
   }else{
    await assert.rejects(run);assert.equal(games.filter(g=>g.a[0]==='out').length,4);assert.equal([...settings.keys()].some(k=>k.startsWith('absence:')),false);assert.equal(notices,0);
   }
  }finally{db.$transaction=original;}
 }
 await db.$disconnect();
});
