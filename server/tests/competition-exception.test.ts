import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{DATABASE_URL:'postgresql://localhost/unused',APP_ORIGIN:'https://test.invalid',SESSION_SECRET:'s'.repeat(32),MESSAGE_KEY:'a'.repeat(64),ADMIN_EMAIL:'test@example.com',ADMIN_PASSWORD:'test-password'});
const {db}=await import('../src/db.ts');
const {runCompetition}=await import('../src/competition.ts');

test('Cycle exception remains pending while results are missing, waits for manual confirmation and never repeats the M2 boundary',async()=>{
 const original=db.$transaction;
 const settings=new Map<string,string>([['competition:anchor',JSON.stringify('2026-09-22')],['competition:month:2026-09','{}'],['competition:move:2026-10-06','{}']]);
 let players=['M1+','M1','M2+','M2'].flatMap((division,d)=>Array.from({length:division==='M2+'?26:4},(_,i)=>({id:`p${d}-${i}`,name:`P ${d} ${i}`,birth:new Date(Date.UTC(1960+i,0,1)),side:i%2?'Direita':'Esquerda',division,verified:true,status:'Ativo'})));
 let winner:string|null=null,updates=0;
 const tx:any={$queryRaw:async()=>{},game:{findMany:async()=>[{id:'game',round:3,date:'2026-10-13',time:'20:00',division:'M1+',published:true,courtId:'c',a:['p0-0','p0-1'],b:['p0-2','p0-3'],winner}]},
  player:{findMany:async()=>players,update:async({where,data}:any)=>{updates++;players=players.map(p=>p.id===where.id?{...p,...data}:p);}},
  setting:{findMany:async()=>[...settings].map(([key,value])=>({key,value})),upsert:async({where,update}:any)=>{settings.set(where.key,update.value);}},audit:{create:async()=>{}},revision:{update:async()=>{}}};
 db.$transaction=(async(fn:any)=>fn(tx)) as any;
 try{
  await runCompetition('2026-10-20');
  const key='competition:exception:m2-20-2026-10-14';
  assert.equal(JSON.parse(settings.get(key)!).status,'pending');assert.equal(updates,0);
  winner='a';await runCompetition('2026-10-20');
  assert.equal(JSON.parse(settings.get(key)!).status,'pending');assert.equal(updates,0);
  assert.match(JSON.parse(settings.get('competition:status')!).blocked,/manual/);
  settings.set(key,JSON.stringify({...JSON.parse(settings.get(key)!),status:'applied-manual'}));
  await runCompetition('2026-10-20');
  const record=JSON.parse(settings.get('competition:move:2026-10-20')!);
  assert.equal(record.changes.filter((p:any)=>p.from==='M2+'&&p.to==='M2').length,0);
  const count=updates;await runCompetition('2026-10-20');assert.equal(updates,count);
  settings.delete(key);await runCompetition('2026-10-21');
  assert.equal(JSON.parse(settings.get(key)!).status,'missed');assert.equal(JSON.parse(settings.get(key)!).date,'2026-10-20');assert.equal(updates,count);
 }finally{db.$transaction=original;await db.$disconnect();}
});
