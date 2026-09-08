import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deliveryWindow} from '../src/message-schedule.ts';
const now=new Date('2026-09-08T10:00:00Z');
test('Scheduled delivery uses Luanda time and the earliest game',()=>{
 const result=deliveryWindow({mode:'scheduled',hoursBefore:24},[{date:'2026-09-10',time:'18:00'},{date:'2026-09-10',time:'16:00'}],now);
 assert.equal(result.nextAttemptAt.toISOString(),'2026-09-09T15:00:00.000Z');assert.equal(result.expiresAt.toISOString(),'2026-09-10T15:00:00.000Z');
});
test('Late publication queues immediately, past games cannot be scheduled, immediate mode is unchanged',()=>{
 assert.equal(deliveryWindow({mode:'scheduled',hoursBefore:24},[{date:'2026-09-08',time:'18:00'}],now).nextAttemptAt.toISOString(),now.toISOString());
 assert.throws(()=>deliveryWindow({mode:'scheduled',hoursBefore:24},[{date:'2026-09-08',time:'10:00'}],now),{status:400});
 assert.equal(deliveryWindow({mode:'immediate',hoursBefore:24},[],now).expiresAt.toISOString(),'2026-09-09T10:00:00.000Z');
});
