import {test} from 'node:test';
import assert from 'node:assert/strict';
import {movementPlan,monthRecord,addDays,exceptionalM2Cycle,manualM2Plan,fourPlayerMovementPlan} from '../src/competition-rules.ts';
import {rankings,type Player,type Game} from '../../lib/tournament.ts';
const players:Player[]=['M1+','M1','M2+','M2'].flatMap((division,d)=>Array.from({length:4},(_,i)=>({id:`p${d}${i}`,name:`Player ${d}${i}`,phone:`+244900000${d}${i}`,birth:`${1980+i}-01-01`,side:i%2?'Direita':'Esquerda',division:division as Player['division'],status:'Ativo',verified:true,note:''})));
const games:Game[]=['M1+','M1','M2+','M2'].map((division,d)=>({id:`g${d}`,division:division as Game['division'],a:[`p${d}0`,`p${d}1`],b:[`p${d}2`,`p${d}3`],court:'c',round:1,date:'2026-09-01',time:'18:00',duration:90,winner:'a',published:true}));
test('Biweekly exchanges use one best and worst per side, simultaneously, within division limits',()=>{
 const moves=movementPlan(players,games,'2026-09-15');assert.equal(moves.length,12);assert.equal(new Set(moves.map(m=>m.id)).size,12);
 assert.equal(moves.find(m=>m.id==='p10')?.to,'M1+');assert.equal(moves.find(m=>m.id==='p12')?.to,'M2+');assert.equal(moves.find(m=>m.id==='p02')?.to,'M1');assert.equal(moves.find(m=>m.id==='p20')?.to,'M1');
 assert.equal(moves.find(m=>m.id==='p30')?.to,'M2+');assert.equal(moves.find(m=>m.id==='p22')?.to,'M2');
 const changed=players.map(p=>({...p,division:(moves.find(m=>m.id===p.id)?.to??p.division) as Player['division']}));
 assert.deepEqual(rankings(changed,games).map(p=>[p.id,p.points]),rankings(players,games).map(p=>[p.id,p.points]));
});
test('Monthly archives have four champions, older wins ties, and the next month starts at zero',()=>{
 const record=monthRecord(players,games,'2026-09');assert.equal(record.champions.length,4);assert.equal(record.champions[0].player?.id,'p00');
 assert.ok(rankings(players,games,'2026-10').every(p=>p.points===0&&p.streak===0));
 assert.equal(record.champions[0].player?.points,3);assert.equal(addDays('2026-09-01',14),'2026-09-15');
});
test('A middle division with only one player on each side cannot move the same player twice',()=>{
 assert.throws(()=>movementPlan(players.filter(p=>!['p12','p13'].includes(p.id)),games,'2026-09-15'));
});

test('One-off M2 relegation selects exactly the bottom 20 across sides, not 20 plus the normal two',()=>{
 const expanded=[...players.filter(p=>p.division!=='M2+'),...Array.from({length:26},(_,i)=>({...players[8],id:'m'+i,name:'M '+i,birth:`${1960+i}-01-01`,side:i===0?'Direita' as const:'Esquerda' as const}))];
 const moves=movementPlan(expanded,[],'2026-10-20',20);
 const downs=moves.filter(m=>m.from==='M2+'&&m.to==='M2');
 assert.equal(downs.length,20);
 assert.deepEqual(downs.map(m=>m.id),Array.from({length:20},(_,i)=>'m'+(i+6)));
 assert.ok(downs.every(m=>m.side==='Esquerda'));
 assert.equal(new Set(moves.map(m=>m.id)).size,moves.length);
 assert.equal(moves.filter(m=>m.from==='M2'&&m.to==='M2+').length,2);
 assert.equal(movementPlan(players,games,'2026-11-03').filter(m=>m.from==='M2+'&&m.to==='M2').length,2);
 assert.throws(()=>movementPlan(players,games,'2026-10-20',20),/pelo menos 20/);
 assert.equal(movementPlan(expanded.filter(p=>p.division!=='M2'),[],'2026-10-20',20).filter(m=>m.to==='M2').length,20);
});

test('Exception date remains bound to the requested cycle even when installation is late',()=>{
 assert.equal(exceptionalM2Cycle('2026-09-22'),'2026-10-20');
 assert.equal(exceptionalM2Cycle('2026-09-16'),'2026-10-14');
});

test('Manual M2 selects bottom 20 across sides and keeps original ranking positions',()=>{
 const roster=Array.from({length:24},(_,i)=>({...players[8],id:'m'+i,name:'M '+i,birth:`${1960+i}-01-01`,side:'Esquerda' as const}));
 const plan=manualM2Plan(roster,[],'2026-10');
 assert.equal(plan.length,20);
 assert.deepEqual(plan.map(p=>p.id),roster.slice(4).map(p=>p.id));
 assert.equal(plan[0].position,5);assert.equal(plan.at(-1)?.position,24);
 assert.ok(plan.every(p=>p.to==='M2'&&p.from==='M2+'));
 assert.throws(()=>manualM2Plan(roster.slice(0,19),[],'2026-10'),/pelo menos 20/);
 assert.equal(movementPlan(players,games,'2026-09-15','manual-done').filter(p=>p.to==='M2'||p.from==='M2').length,0);
 assert.equal(movementPlan(players,games,'2026-09-15','manual-done').length,8);
});

test('Four each way use the fortnight across sides and exclude both M2 levels',()=>{
 const roster=['M1+','M1','M2+','M2'].flatMap((division,d)=>Array.from({length:8},(_,i)=>({...players[0],id:`q${d}-${i}`,name:`Q${d}-${i}`,division:division as Player['division'],birth:`${1960+i}-01-01`,side:'Esquerda' as const})));
 const current:Game={...games[0],date:'2026-10-13',a:['q0-7','q1-7'],b:['q0-6','q1-6'],winner:'a'};
 const old:Game={...current,id:'old',date:'2026-10-01',a:['q0-0','q1-0']};
 const moves=fourPlayerMovementPlan(roster,[current,old],'2026-10-06','2026-10-20');
 assert.equal(moves.length,8);assert.equal(new Set(moves.map(m=>m.id)).size,8);
 assert.ok(moves.every(m=>!['M2','M2+'].includes(m.from)&&!['M2','M2+'].includes(m.to)));
 assert.ok(moves.some(m=>m.id==='q1-7'&&m.to==='M1+'));
 assert.ok(!moves.some(m=>m.id==='q0-7'));
 assert.throws(()=>fourPlayerMovementPlan(roster.filter(p=>p.division!=='M1'),[],'2026-10-06','2026-10-20'),/4 jogadores/);
});
