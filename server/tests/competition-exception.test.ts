import {test} from 'node:test';import assert from 'node:assert/strict';
Object.assign(process.env,{DATABASE_URL:'postgresql://localhost/unused',APP_ORIGIN:'https://test.invalid',SESSION_SECRET:'s'.repeat(32),MESSAGE_KEY:'a'.repeat(64),ADMIN_EMAIL:'test@example.com',ADMIN_PASSWORD:'test-password'});
const {db}=await import('../src/db.ts');const {runCompetition}=await import('../src/competition.ts');
test('Scheduled competition never moves players or replays overdue exchanges, but still closes months',async()=>{
 const settings=new Map<string,string>([['competition:anchor',JSON.stringify('2026-09-01')],['competition:exception:m2-20-2026-10-14',JSON.stringify({date:'2026-10-14',status:'pending'})]]);
 let updates=0;const tx:any={$queryRaw:async()=>{},game:{findMany:async()=>[{date:'2026-09-10',time:'20:00',published:true,winner:'a',a:['p'],b:[],courtId:'c',round:1}]},player:{findMany:async()=>[{id:'p',name:'P',birth:new Date('1980-01-01'),division:'M2+',status:'Ativo'}],update:async()=>updates++},setting:{findMany:async()=>[...settings].map(([key,value])=>({key,value})),upsert:async({where,update}:any)=>settings.set(where.key,update.value)},audit:{create:async()=>{}},revision:{update:async()=>{}}};
 const original=db.$transaction;db.$transaction=(async(fn:any)=>fn(tx)) as any;
 try{await runCompetition('2026-10-31');await runCompetition('2026-11-30');assert.equal(updates,0);assert.ok(settings.has('competition:month:2026-09'));assert.ok(settings.has('competition:month:2026-10'));assert.equal([...settings.keys()].some(k=>k.startsWith('competition:move:')),false);assert.equal(JSON.parse(settings.get('competition:status')!).manualMovements,true);}finally{db.$transaction=original;await db.$disconnect();}
});
