import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replaceDraftPlayer} from '../../lib/draft-substitution.ts';
import type {Game,Player} from '../../lib/tournament.ts';
const players:Player[]=Array.from({length:5},(_,i)=>({id:String(i),name:`Player ${i}`,phone:'',birth:'1990-01-01',side:'Direita',division:'M1',status:'Ativo',verified:true,note:''}));
const games:Game[]=Array.from({length:4},(_,i)=>({id:`g${i}`,round:2,division:'M1',date:'2026-09-23',time:`20:${i*20}`,court:`c${i}`,duration:20,a:['0','1'],b:['2','3'],published:false,winner:null}));
test('Draft replacement preserves partner, position, schedules and original input across all four games',()=>{
  const result=replaceDraftPlayer(games,players,2,'M1','0','4');
  result.forEach((g,i)=>assert.deepEqual(g,{...games[i],a:['4','1']}));
  assert.equal(games[0].a[0],'0');
});
test('Replacement refuses published games, results, ineligible or occupied substitutes and repeated partners',()=>{
  for(const modified of [games.map(g=>({...g,published:true})),games.map(g=>({...g,winner:'a' as const})),games.slice(1)])assert.throws(()=>replaceDraftPlayer(modified,players,2,'M1','0','4'));
  assert.throws(()=>replaceDraftPlayer(games,players,2,'M1','0','1'));
  assert.throws(()=>replaceDraftPlayer(games,players.map(p=>p.id==='4'?{...p,verified:false}:p),2,'M1','0','4'));
  const previous={...games[0],id:'old',round:1,date:'2026-09-16',a:['4','1']};
  assert.throws(()=>replaceDraftPlayer([...games,previous],players,2,'M1','0','4'));
});
