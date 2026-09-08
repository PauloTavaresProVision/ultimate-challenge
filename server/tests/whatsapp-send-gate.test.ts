import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SendGate} from '../src/whatsapp-send-gate.ts';
test('Blocked sends stay paused until a fresh query explicitly clears the restriction',async()=>{
  let now=1000; const gate=new SendGate(()=>now); let calls=0;
  const fetch=async()=>{calls++;return {isActive:calls===1};};
  assert.equal(await gate.allowed(fetch),false);
  assert.equal(await gate.allowed(fetch),false); assert.equal(calls,1);
  now+=60001; assert.equal(await gate.allowed(fetch),true);
  gate.reject(); assert.equal(await gate.allowed(fetch),false);
});
test('Unknown state and query errors never authorize sends',async()=>{
  assert.equal(await new SendGate().allowed(async()=>({})),false);
  assert.equal(await new SendGate().allowed(async()=>{throw new Error('offline');}),false);
});
