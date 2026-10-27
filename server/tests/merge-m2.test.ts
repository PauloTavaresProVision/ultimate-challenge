import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeM2Journeys} from '../../lib/merge-m2.ts';
import type {Journey} from '../../lib/journey.ts';
const journey=(id:string,division:Journey['division'],extra:Partial<Journey>={}):Journey=>({id,division,date:'2026-10-28',time:'20:00',capacity:8,courtIds:['a','b'],group:'group',status:'open',confirmed:[],waiting:[],announcementId:id+'announcement',...extra});
test('Merges confirmations without duplicates, expands capacity and preserves waiting entries',()=>{
 const source=journey('source','M2',{confirmed:['p1','p2','p3','p4','p5','p6','p7','p8'],waiting:['p9','p10']});
 const target=journey('target','M2+',{confirmed:['p1','p9','p11','p12'],waiting:['p8','p13']});
 const before=JSON.stringify([source,target]);
 const result=mergeM2Journeys([source,target],'2026-10-27');
 assert.equal(result.journeys.length,1);
 assert.equal(result.changed[0].confirmed.length,11);
 assert.equal(result.changed[0].capacity,12);
 assert.deepEqual(result.changed[0].waiting,['p13','p10']);
 assert.deepEqual(result.aliases,{source:'target'});
 assert.deepEqual(result.changed[0].mergedFrom,['source']);
 assert.equal(JSON.stringify([source,target]),before);
 assert.equal(mergeM2Journeys(result.journeys,'2026-10-27').changed.length,0);
});
test('Preserves historical M2 journeys and renames standalone upcoming journeys',()=>{
 const past=journey('past','M2',{date:'2026-10-20',status:'drawn'});
 const next=journey('next','M2',{confirmed:['a'],waiting:['b']});
 const result=mergeM2Journeys([past,next],'2026-10-27');
 assert.deepEqual(result.journeys[0],past);
 assert.deepEqual(result.journeys[1],{...next,division:'M2+'});
});
test('Does not combine different groups, times or prepared draws',()=>{
 assert.equal(mergeM2Journeys([journey('a','M2'),journey('b','M2+',{group:'other'})],'2026-10-27').journeys.length,2);
 assert.throws(()=>mergeM2Journeys([journey('a','M2'),journey('b','M2+',{time:'21:00'})],'2026-10-27'),/horas diferentes/);
 assert.throws(()=>mergeM2Journeys([journey('a','M2',{status:'drawn'})],'2026-10-27'),/sorteio/);
});
