import {test} from 'node:test';import assert from 'node:assert/strict';import {classifyQuestion} from '../src/bot-intent.ts';
const output={intent:'games',when:'today',division:'mine',section:-1};
test('Classification uses structured output, no provider storage and fixed HTTPS',async()=>{
 const mock:typeof fetch=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options?.redirect,'error');const body=JSON.parse(String(options?.body));assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.input,'Tenho jogo hoje?');return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]}));};assert.deepEqual(await classifyQuestion('fake-key','Tenho jogo hoje?',['Regras'],mock),output);
});
test('Malformed output and provider failures cannot become WhatsApp answers or expose secrets',async()=>{
 const mock:typeof fetch=async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:'{"intent":"delete_database"}'}]}]}));await assert.rejects(classifyQuestion('secret','oi',[],mock),/interpretação inválida/);
 const failed:typeof fetch=async()=>new Response('secret-private-provider-error',{status:401});await assert.rejects(classifyQuestion('secret','oi',[],failed),e=>e instanceof Error&&!e.message.includes('secret')&&e.message.includes('recusada'));
});
