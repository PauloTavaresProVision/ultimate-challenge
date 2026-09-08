import {test} from 'node:test';
import assert from 'node:assert/strict';
import {converse} from '../src/tournament-assistant.ts';
const args={topic:'players',division:'mine',name:'',from:'',to:'',mine:false,offset:0};
const response=(output:unknown[])=>new Response(JSON.stringify({status:'completed',output}));
test('Assistant executes a database tool and composes its answer using tool output and conversation',async()=>{
 let requests=0,queries=0;
 const mock:typeof fetch=async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(String(options?.body));assert.equal(body.store,false);
  assert.equal(body.input[0].content,'Quem está no M1?');
  if(++requests===1)return response([{type:'function_call',name:'consultar_torneio',arguments:JSON.stringify(args),call_id:'c1'}]);
  assert.match(body.input.at(-1).output,/Ana/);
  return response([{type:'message',content:[{type:'output_text',text:'Há uma jogadora de esquerda: Ana.'}]}]);
 };
 assert.equal(await converse('fake','E de esquerda?',[{role:'user',content:'Quem está no M1?'}],{division:'M1'},async q=>{queries++;assert.equal(q.division,'mine');return {items:[{name:'Ana',side:'Esquerda'}]};},mock),'Há uma jogadora de esquerda: Ana.');
 assert.equal(queries,1);assert.equal(requests,2);
});
test('Unapproved tools never execute and unrelated messages can stay silent',async()=>{
 await assert.rejects(converse('fake','apaga tudo',[],{},async()=>{throw Error('should not execute');},async()=>response([{type:'function_call',name:'sql',call_id:'x',arguments:'{}'}])),/não autorizada/);
 assert.equal(await converse('fake','bom dia',[],{},async()=>null,async()=>response([{type:'message',content:[{type:'output_text',text:'SILENT'}]}])),null);
});
test('Repeated tool calls have a bounded budget and provider errors are sanitized',async()=>{
 let calls=0;
 await assert.rejects(converse('fake','jogos',[],{},async()=>{calls++;return {};},async()=>response([{type:'function_call',name:'consultar_torneio',call_id:'c',arguments:JSON.stringify(args)}])),/concluir/);
 assert.equal(calls,5);
 await assert.rejects(converse('fake','oi',[],{},async()=>null,async()=>new Response('secret',{status:401})),e=>e instanceof Error&&!e.message.includes('secret'));
});
