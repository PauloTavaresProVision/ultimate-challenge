import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wallSlot,wallName} from '../../lib/wallboard.ts';
test('TV advances all divisions together using Luanda time and keeps first/last slots outside playing hours',()=>{
 const times=['20:00','20:20','20:40','21:00'];
 assert.equal(wallSlot(times,'2026-09-23',new Date('2026-09-23T18:00:00Z')),'20:00');
 assert.equal(wallSlot(times,'2026-09-23',new Date('2026-09-23T19:20:00Z')),'20:20');
 assert.equal(wallSlot(times,'2026-09-23',new Date('2026-09-23T21:20:00Z')),'21:00');
 assert.equal(wallSlot([],'2026-09-23',new Date()),'');
});
test('Long player names preserve first and last names and abbreviate middle names only',()=>{
 assert.equal(wallName('Manuel Santos'),'Manuel Santos');
 assert.equal(wallName('Carlos Miguel Lourenço Sousa'),'Carlos M. L. Sousa');
 assert.equal(wallName('André Alexandre Macedo da Silva'),'André A. M. da Silva');
});
