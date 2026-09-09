import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCalendar,nextRoundCalendar,scheduleDivisions} from '../../lib/weekly-calendar.ts';
import {divisions,conflict,type Game} from '../../lib/tournament.ts';
test('Division calendar upgrades shared time and keeps Tuesday/Wednesday in one week',()=>{
 const c=normalizeCalendar({time:'19:30'});
 assert.deepEqual(divisions.map(d=>c.divisions[d].weekday),[2,2,3,3]);
 const first=nextRoundCalendar(c,[],'2026-09-07');
 assert.equal(first.M1.date,'2026-09-08');assert.equal(first['M2+'].date,'2026-09-09');assert.equal(first.M2.time,'19:30');
 const prior=divisions.map(d=>({round:1,division:d,date:first[d].date})) as Game[];
 const next=nextRoundCalendar(c,prior,'2026-09-09');
 assert.equal(next.M1.date,'2026-09-15');assert.equal(next.M2.date,'2026-09-16');
 assert.equal(nextRoundCalendar(c,[],'2026-09-09').M1.date,'2026-09-15');
});
test('Two-day rounds retain four games per pair and share courts without overlap',()=>{
 const pairs=divisions.map((division,i)=>({division,a:['a'+i,'b'+i],b:['c'+i,'d'+i]}));
 const courts=[{id:'c1',name:'1',location:'Club',active:true},{id:'c2',name:'2',location:'Club',active:true}];
 const calendar=nextRoundCalendar(normalizeCalendar(),[],'2026-09-07');
 const games=scheduleDivisions(pairs,courts,1,calendar);
 assert.equal(games.length,16);
 for(const d of divisions){assert.equal(games.filter(g=>g.division===d).length,4);assert(games.filter(g=>g.division===d).every(g=>g.date===calendar[d].date));}
 assert(!games.some(g=>conflict(g,games)));
 assert.equal(games.find(g=>g.division==='M1')?.time,'19:20');
 assert.equal(games.find(g=>g.division==='M2+')?.time,'18:00');
});
