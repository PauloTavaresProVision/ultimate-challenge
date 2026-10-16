import {test} from 'node:test';import assert from 'node:assert/strict';
Object.assign(process.env,{DATABASE_URL:'postgresql://localhost/unused',APP_ORIGIN:'https://test.invalid',SESSION_SECRET:'s'.repeat(32),MESSAGE_KEY:'a'.repeat(64),ADMIN_EMAIL:'test@example.com',ADMIN_PASSWORD:'test-password'});
const {db}=await import('../src/db.ts');const {runCompetition}=await import('../src/competition.ts');
test('New automatic policy starts next cycle, exchanges four each way once and leaves M2 levels manual',async()=>{
 const settings=new Map<string,string>([['competition:anchor',JSON.stringify('2026-09-22')],['competition:month:2026-09','{}']]);
 let players=['M1+','M1','M2+','M2'].flatMap((division,d)=>Array.from({length:8},(_,i)=>({id:`p${d}-${i}`,name:`P${d}-${i}`,division,status:'Ativo',verified:true,side:'Esquerda',birth:new Date(Date.UTC(1960+i,0,1))})));
 const games:any[]=[{id:'g',date:'2026-10-13',time:'20:00',published:true,division:'M1',winner:'a',a:['p1-0'],b:['p1-1'],courtId:'c',round:2}];
 let updates=0;const tx:any={$queryRaw:async()=>{},game:{findMany:async()=>games},player:{findMany:async()=>players,update:async({where,data}:any)=>{updates++;players=players.map(p=>p.id===where.id?{...p,...data}:p);}},setting:{findMany:async()=>[...settings].map(([key,value])=>({key,value})),upsert:async({where,update}:any)=>settings.set(where.key,update.value)},audit:{create:async()=>{}},revision:{update:async()=>{}}};
 const original=db.$transaction;db.$transaction=(async(fn:any)=>fn(tx)) as any;
 try{
  await runCompetition('2026-10-16');assert.equal(updates,0);assert.equal(JSON.parse(settings.get('competition:four-player-policy')!).firstCutoff,'2026-10-20');
  games[0].winner=null;await runCompetition('2026-10-20');assert.equal(updates,0);assert.match(JSON.parse(settings.get('competition:status')!).blocked,/resultados/);
  games[0].winner='a';games.push({...games[0],id:'future',date:'2026-10-21',winner:null});await runCompetition('2026-10-20');assert.equal(updates,0);games.pop();
  games.push({...games[0],id:'m2-pending',division:'M2',winner:null,a:['p3-0'],b:['p3-1']});
  await runCompetition('2026-10-20');assert.equal(updates,8);
  const record=JSON.parse(settings.get('competition:move:2026-10-20')!);assert.equal(record.changes.filter((c:any)=>c.from==='M1').length,4);assert.equal(record.changes.filter((c:any)=>c.from==='M1+').length,4);
  assert.ok(players.filter(p=>p.id.startsWith('p2')).every(p=>p.division==='M2+'));assert.ok(players.filter(p=>p.id.startsWith('p3')).every(p=>p.division==='M2'));
  await runCompetition('2026-10-20');assert.equal(updates,8);
  assert.ok(!settings.has('competition:move:2026-10-06'));
 }finally{db.$transaction=original;await db.$disconnect();}
});
