import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ZApiClient,zReceipt,zPhone,zJid,zMessageId} from '../src/zapi-client.ts';
test('Z-API status separates provider enqueue, delivery, read and own reads',()=>{
 assert.equal(zReceipt({}),null);assert.equal(zReceipt({type:'DeliveryCallback'}),2);
 assert.equal(zReceipt({type:'DeliveryCallback',error:'rejected'}),0);
 assert.equal(zReceipt({type:'MessageStatusCallback',status:'RECEIVED'}),3);
 assert.equal(zReceipt({type:'MessageStatusCallback',status:'READ'}),4);
 assert.equal(zReceipt({type:'MessageStatusCallback',status:'READ_BY_ME'}),null);
 assert.equal(zPhone('123@g.us'),'123-group');assert.equal(zJid('123-group'),'123@g.us');assert.equal(zPhone('123@lid'),'123@lid');
 assert.notEqual(zMessageId('one','id'),zMessageId('two','id'));
});
test('Z-API uses fixed HTTPS, Client-Token, no redirects or automatic retries',async()=>{
 let calls=0;
 const client=new ZApiClient({instanceId:'instance',token:'secret',clientToken:'client-secret'},async(url,opts)=>{
  calls++;assert.equal(String(url),'https://api.z-api.io/instances/instance/token/secret/status');assert.equal(opts?.redirect,'error');assert.equal((opts?.headers as Record<string,string>)['Client-Token'],'client-secret');
  return new Response(JSON.stringify({connected:true}),{status:200});
 });assert.deepEqual(await client.call('status'),{connected:true});assert.equal(calls,1);
 const broken=new ZApiClient({instanceId:'instance',token:'secret',clientToken:'client-secret'},async()=>{throw new Error('https://api.z-api.io/token/secret');});
 await assert.rejects(broken.call('status'),e=>e instanceof Error&&!e.message.includes('secret'));
});
