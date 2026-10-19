import {test} from 'node:test';import assert from 'node:assert/strict';
import {competitionCycle,cycleRankings} from '../../lib/competition-cycle.ts';
import {overallRanking} from '../../lib/overall-ranking.ts';import {playerStandings} from '../../lib/player-standings.ts';import type{Player,Game}from'../../lib/tournament.ts';
const player:Player={id:'p',name:'P',phone:'+244900000000',birth:'1980-01-01',side:'Esquerda',division:'M1',status:'Ativo',verified:true,note:''};
const game:Game={id:'g',date:'2026-10-13',time:'20:00',round:2,division:'M1',court:'c',duration:20,published:true,a:['p'],b:[],winner:'a'};
test('Fortnight reset preserves monthly total and month rollover does not erase past games',()=>{
 const anchor='2026-09-22';assert.deepEqual(competitionCycle([game],'2026-10-19',anchor),{start:'2026-10-06',end:'2026-10-19',next:'2026-10-20'});
 assert.equal(cycleRankings([player],[game],'2026-10-19',anchor)[0].points,3);
 assert.equal(cycleRankings([player],[game],'2026-10-20',anchor)[0].points,0);
 assert.equal(overallRanking([player],[game],'2026-10')[0].points,3);
 assert.equal(overallRanking([player],[game],'2026-11')[0].points,0);
 const [standing]=playerStandings('p',[player],[game],'2026-10',[],{today:'2026-10-20',anchor});assert.equal(standing.rows[0].points,0);assert.equal(standing.cycle?.start,'2026-10-20');
});
import {latestCycleClosure} from '../../lib/competition-cycle.ts';
test('Early close resets everyone immediately and does not reset again at the skipped cutoff',()=>{
 const changes=[...Array.from({length:4},(_,i)=>({id:'d'+i,from:'M1+',to:'M1'})),...Array.from({length:4},(_,i)=>({id:'u'+i,from:'M1',to:'M1+'}))];
 const closed=latestCycleClosure([{key:'competition:move:2026-10-20',value:JSON.stringify({date:'2026-10-16',changes})}]);
 assert.deepEqual(closed,{date:'2026-10-16',cutoff:'2026-10-20'});
 const anchor='2026-09-22';
 assert.equal(cycleRankings([player],[game],'2026-10-19',anchor,closed)[0].points,0);
 const newGame={...game,id:'new',date:'2026-10-17'};
 assert.equal(cycleRankings([player],[game,newGame],'2026-10-20',anchor,closed)[0].points,3);
 assert.equal(overallRanking([player],[game,newGame],'2026-10')[0].points,6);
 assert.equal(competitionCycle([game],'2026-10-19',anchor,closed).next,'2026-11-03');
 assert.equal(cycleRankings([player],[game,newGame],'2026-11-03',anchor,closed)[0].points,0);
 const [standing]=playerStandings('p',[player],[game],'2026-10',[],{today:'2026-10-19',anchor,closed});
 assert.equal(standing.rows[0].points,0);
 assert.equal(latestCycleClosure([{key:'competition:move:manual-x',value:JSON.stringify({date:'2026-10-16',changes})}]),undefined);
});
