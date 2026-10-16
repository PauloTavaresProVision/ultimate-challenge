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
