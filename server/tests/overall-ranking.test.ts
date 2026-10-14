import {test} from 'node:test';
import assert from 'node:assert/strict';
import {overallRanking} from '../../lib/overall-ranking.ts';
import {rankings,type Game,type Player} from '../../lib/tournament.ts';
test('Overall ranking accumulates months, keeps inactive history and ignores drafts',()=>{
 const players:Player[]=['a','b'].map((id,i)=>({id,name:id,birth:`198${i}-01-01`,side:'Esquerda',phone:'+244900000000',status:i?'Inativo':'Ativo',verified:true,division:'M2+',note:''}));
 const base:Game={id:'1',date:'2026-09-22',round:1,time:'20:00',duration:20,division:'M2+',court:'c',a:['a'],b:['b'],winner:'a',published:true};
 const games=[base,{...base,id:'2',time:'20:20'},{...base,id:'3',date:'2026-10-13',round:3},{...base,id:'4',published:false}];
 const rows=overallRanking(players,games);
 assert.equal(rows[0].points,10);assert.equal(rows[0].bonus,1);assert.equal(rows[0].wins,3);
 assert.equal(rows[1].points,3);assert.equal(rows[1].losses,3);
 assert.equal(rankings(players,games.filter(g=>g.published),'2026-10')[0].points,3);
 assert.equal(overallRanking(players.map(p=>({...p,division:'M1'})),games)[0].points,10);
});
