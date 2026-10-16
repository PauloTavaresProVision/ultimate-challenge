import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{DATABASE_URL:'postgresql://localhost/unused',APP_ORIGIN:'https://test.invalid',SESSION_SECRET:'s'.repeat(32),MESSAGE_KEY:'a'.repeat(64),ADMIN_EMAIL:'test@example.com',ADMIN_PASSWORD:'test-password'});
const {db}=await import('../src/db.ts');
const {installManualM2}=await import('../src/manual-m2.ts');
test('Manual relegation requires admin, preview revision, applies exactly once and preserves games',async()=>{
 const routes=new Map<string,any[]>(),auth=()=>{},admin=()=>{};
 installManualM2({get:(p:string,...h:any[])=>routes.set('GET '+p,h),post:(p:string,...h:any[])=>routes.set('POST '+p,h)} as any,auth,admin);
 for(const handlers of routes.values()){assert.equal(handlers[0],auth);assert.equal(handlers[1],admin);}
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Luanda'}).format(new Date());
 const key='competition:exception:m2-20-2026-10-14';
 const settings=new Map([[key,JSON.stringify({date:today,count:20,status:'pending'})]]);
 const players=Array.from({length:24},(_,i)=>({id:'p'+i,name:'Player '+i,birth:new Date(Date.UTC(1960+i,0,1)),division:'M2+',side:'Esquerda',status:'Ativo',verified:true}));
 let revision=1,updates=0,audits=0;
 const games=[{id:'g',date:today,published:true,winner:'a',division:'M2+',a:['p0','p1'],b:['p2','p3'],courtId:'c',time:'20:00',round:1}];
 const before=JSON.stringify(games);
 const tx:any={$queryRaw:async()=>{},game:{findMany:async()=>games},player:{findMany:async()=>players,update:async({where,data}:any)=>{updates++;Object.assign(players.find(p=>p.id===where.id)!,data);}},revision:{findUnique:async()=>({value:revision}),update:async()=>revision++},audit:{create:async()=>audits++},setting:{findUnique:async({where}:any)=>settings.has(where.key)?{value:settings.get(where.key)}:null,upsert:async({where,update}:any)=>settings.set(where.key,update.value),create:async({data}:any)=>settings.set(data.key,data.value)}};
 const original=db.$transaction;db.$transaction=(async(fn:any)=>fn(tx)) as any;
 const get=routes.get('GET /api/admin/competition/manual-m2')!.at(-1),post=routes.get('POST /api/admin/competition/manual-m2')!.at(-1);
 let plan:any;const res={locals:{session:{adminId:'admin'}},json:(value:any)=>{plan=value;}};
 try{
  await get({},res);assert.equal(plan.changes.length,20);assert.equal(updates,0);
  const input={revision:plan.revision,ids:plan.changes.map((p:any)=>p.id)};
  await assert.rejects(()=>post({body:{...input,revision:0}},res),/mudaram/);assert.equal(updates,0);
  await post({body:input},res);assert.equal(updates,20);assert.equal(audits,1);assert.equal(JSON.stringify(games),before);
  assert.equal(JSON.parse(settings.get(key)!).status,'applied-manual');
  await assert.rejects(()=>post({body:input},res),/repetida/);assert.equal(updates,20);
 }finally{db.$transaction=original;await db.$disconnect();}
});
