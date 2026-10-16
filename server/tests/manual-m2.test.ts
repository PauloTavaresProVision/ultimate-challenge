import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{DATABASE_URL:'postgresql://localhost/unused',APP_ORIGIN:'https://test.invalid',SESSION_SECRET:'s'.repeat(32),MESSAGE_KEY:'a'.repeat(64),ADMIN_EMAIL:'test@example.com',ADMIN_PASSWORD:'test-password'});
const {db}=await import('../src/db.ts');const {installManualM2}=await import('../src/manual-m2.ts');
test('Manual level management ignores old cycles, supports any count and repeated deliberate changes, preserves points and games',async()=>{
 const routes=new Map<string,any[]>(),auth=()=>{},admin=()=>{};
 installManualM2({get:(p:string,...h:any[])=>routes.set('GET '+p,h),post:(p:string,...h:any[])=>routes.set('POST '+p,h)} as any,auth,admin);
 for(const hs of routes.values()){assert.equal(hs[0],auth);assert.equal(hs[1],admin);}
 const players=Array.from({length:25},(_,i)=>({id:'p'+i,name:'P '+i,birth:new Date('1980-01-01'),division:'M2+',side:'Esquerda',status:'Ativo',verified:true}));
 const games=[{id:'g',date:'2099-01-01',published:true,winner:null,division:'M2+',a:['p0'],b:['p1'],courtId:'c',time:'20:00',round:1}];const before=JSON.stringify(games);
 let revision=1,updates=0;const records:any[]=[];
 const tx:any={$queryRaw:async()=>{},game:{findMany:async()=>games},player:{findMany:async()=>players,update:async({where,data}:any)=>{updates++;Object.assign(players.find(p=>p.id===where.id)!,data);}},revision:{findUnique:async()=>({value:revision}),update:async()=>revision++},audit:{create:async()=>{}},setting:{findUnique:async()=>{throw Error('Must not read old exception or history');},create:async({data}:any)=>records.push(data)}};
 const original=db.$transaction;db.$transaction=(async(fn:any)=>fn(tx)) as any;
 const get=routes.get('GET /api/admin/competition/manual-divisions')!.at(-1),post=routes.get('POST /api/admin/competition/manual-divisions')!.at(-1);
 let plan:any;const res={locals:{session:{adminId:'admin'}},json:(v:any)=>plan=v};
 try{
  await get({query:{from:'M2+'}},res);assert.equal(plan.candidates.length,25);assert.equal(updates,0);
  const one={from:'M2+',to:'M2',revision:plan.revision,ids:['p0']};
  await assert.rejects(()=>post({body:{...one,to:'M2+'}},res),/destino diferente/);
  await assert.rejects(()=>post({body:{...one,ids:['p0','p0']}},res),/repetidos/);
  await assert.rejects(()=>post({body:{...one,ids:['unknown']}},res),/já não está ativo/);
  await post({body:one},res);assert.equal(players[0].division,'M2');assert.equal(updates,1);
  await assert.rejects(()=>post({body:one},res),/dados mudaram/);assert.equal(updates,1);
  await get({query:{from:'M2'}},res);assert.equal(plan.candidates.length,1);
  await post({body:{from:'M2',to:'M1+',revision:plan.revision,ids:['p0']}},res);assert.equal(players[0].division,'M1+');
  await get({query:{from:'M2+'}},res);
  await post({body:{from:'M2+',to:'M1',revision:plan.revision,ids:plan.candidates.map((p:any)=>p.id)}},res);assert.equal(plan.count,24);
  await get({query:{from:'M1'}},res);
  await post({body:{from:'M1',to:'M2+',revision:plan.revision,ids:plan.candidates.map((p:any)=>p.id)}},res);assert.equal(plan.count,24);
  assert.equal(new Set(records.map(r=>r.key)).size,4);assert.equal(JSON.stringify(games),before);
 }finally{db.$transaction=original;await db.$disconnect();}
});
