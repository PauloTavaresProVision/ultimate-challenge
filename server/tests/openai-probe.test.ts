import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeOpenAI} from '../src/openai-probe.ts';
test('OpenAI connectivity uses fixed HTTPS endpoint and bearer authentication',async()=>{
 const result=await probeOpenAI('fake-key',async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/models');assert.equal((options?.headers as Record<string,string>).Authorization,'Bearer fake-key');assert.equal(options?.redirect,'error');return Response.json({data:[]});});assert.equal(result.ok,true);
});
test('Provider errors and network exceptions cannot echo credentials',async()=>{
 for(const status of [401,403,429,500]) { const result=await probeOpenAI('fake-key',async()=>Response.json({error:{message:'fake-key'}},{status}));assert.equal(result.ok,false);assert.equal(JSON.stringify(result).includes('fake-key'),false); }
 const result=await probeOpenAI('fake-key',async()=>{throw new Error('fake-key');});assert.equal(result.ok,false);assert.equal(JSON.stringify(result).includes('fake-key'),false);
});
