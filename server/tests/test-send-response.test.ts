import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testSendResponse} from '../src/test-send-response.ts';
test('slow sends release HTTP without cancelling or repeating delivery',async()=>{
 let finish!:(v:{sentAt:string})=>void;
 const send=new Promise<{sentAt:string}>(resolve=>{finish=resolve;});
 assert.deepEqual(await testSendResponse(send,5),{pending:true});
 finish({sentAt:'done'});assert.deepEqual(await send,{sentAt:'done'});
 assert.deepEqual(await testSendResponse(Promise.resolve({sentAt:'done'}),100),{sentAt:'done'});
});
test('early errors propagate and late errors remain handled after HTTP response',async()=>{
 await assert.rejects(testSendResponse(Promise.reject(new Error('failed')),100),/failed/);
 let reject!:(e:Error)=>void;
 const send=new Promise<never>((_,r)=>{reject=r;});
 assert.deepEqual(await testSendResponse(send,5),{pending:true});
 reject(new Error('late failure'));
 await new Promise(r=>setImmediate(r));
});
