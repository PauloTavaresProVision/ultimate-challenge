import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeRoundCourts} from '../../lib/round-courts.ts';
import type {Game,Court} from '../../lib/tournament.ts';
const courts: Court[]=['a','b','c'].map(id=>({id,name:id,location:'Club',active:true}));
const game=(id:string,court:string,time='20:00'):Game=>({id,court,time,date:'2026-10-20',round:4,division:'M2+',a:['p1','p2'],b:['p3','p4'],duration:20,winner:null,published:true});
test('Changing published round courts preserves partners, times and all other fields, including atomic swaps',()=>{
 const games=[game('1','a'),game('2','b')];
 const result=changeRoundCourts(games,[],courts,[{id:'1',from:'a',to:'b'},{id:'2',from:'b',to:'a'}],'2026-10-20');
 assert.deepEqual(result,[{...games[0],court:'b'},{...games[1],court:'a'}]);
 assert.equal(games[0].court,'a');
});
test('Rejects overlapping bookings, duplicate selections, stale fields, inactive courts and completed games',()=>{
 const g=game('1','a'), changes=[{id:'1',from:'a',to:'c'}];
 assert.throws(()=>changeRoundCourts([g],[game('other','c','20:10')],courts,changes,'2026-10-20'),/ocupado/);
 assert.doesNotThrow(()=>changeRoundCourts([g],[game('other','c','20:20')],courts,changes,'2026-10-20'));
 assert.throws(()=>changeRoundCourts([g,game('2','b')],[],courts,[...changes,{id:'2',from:'b',to:'c'}],'2026-10-20'),/ocupado/);
 assert.throws(()=>changeRoundCourts([g],[],courts,[{...changes[0],from:'b'}],'2026-10-20'),/administrador/);
 assert.throws(()=>changeRoundCourts([g],[],courts.map(c=>({...c,active:false})),changes,'2026-10-20'),/ativo/);
 assert.throws(()=>changeRoundCourts([{...g,winner:'a'}],[],courts,changes,'2026-10-20'),/resultados/);
 assert.throws(()=>changeRoundCourts([g],[],courts,changes,'2026-10-21'),/passaram/);
 assert.throws(()=>changeRoundCourts([g],[],courts,[],'2026-10-20'),/jornada mudou/);
});
