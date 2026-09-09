import {test} from 'node:test';
import assert from 'node:assert/strict';
import {movementPlan,monthRecord,addDays} from '../src/competition-rules.ts';
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
