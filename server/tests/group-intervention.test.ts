import {test} from 'node:test';
import assert from 'node:assert/strict';
import {routeGroupIntervention,permittedIntervention,type GroupRouting} from '../src/group-intervention.ts';
import {interpretParticipation} from '../src/journey-ai.ts';
import {groupContext,type GroupTurn} from '../src/group-context.ts';
const turn=(id:string,authorId:string,text:string,extra:Partial<GroupTurn>={}):GroupTurn=>({id,authorId,authorName:authorId,text,source:'member',at:1,...extra});
const envelope=(value:unknown)=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
const route=(extra:Partial<GroupRouting>={}):GroupRouting=>({reason:'Pedido pessoal à plataforma.',addressee:'platform',purpose:'participation',dependsOnMessageId:null,platformVocative:null,...extra});
test('Observer receives only conversation, never available journeys or enrolment memory',async()=>{
 const r=await routeGroupIntervention('fake','Amanhã faço alteração',{division:'M1+',journeys:[{id:'secret-target'}],history:{action:'join'}},async(_url,options)=>{
  const request=JSON.parse(String(options?.body));
  const input=JSON.parse(request.input);assert.equal(input.currentMessage.text,'Amanhã faço alteração');
  assert.ok(!request.input.includes('secret-target'));assert.ok(!('history' in input));assert.ok(!('division' in input));assert.equal(request.temperature,0);assert.equal(request.store,false);
  return envelope(route({addressee:'human',purpose:'no_request'}));
 });assert.equal(r.addressee,'human');
});
test('Human conversation stops before the planner and cannot select any journey',async()=>{
 let calls=0;
 const result=await interpretParticipation('fake','Amanhã faço alteração',{journeys:[{id:'one'}]},['one'],async(_url,options)=>{
  calls++;assert.equal(JSON.parse(String(options?.body)).text.format.name,'group_intervention');
  return envelope(route({addressee:'human',purpose:'no_request'}));
 });assert.equal(calls,1);assert.deepEqual(result,{action:'silent',journeyId:null});
});
test('Information questions bypass the enrolment planner even with no game data',async()=>{
 let calls=0;
 const result=await interpretParticipation('fake','Com quem jogo?',{},[],async()=>{calls++;return envelope(route({purpose:'information'}));});
 assert.equal(calls,1);assert.equal(result.action,'none');
});
test('A human quoted reply cannot use a hallucinated explicit platform address',()=>{
 const current=turn('b','João','Sim, conta comigo',{replyToId:'a'});
 const context={groupConversation:groupContext([turn('a','Pedro','Vens jogar?')],current)};
 assert.equal(permittedIntervention(route({platformVocative:'Assistente'}),current.text,context),'silent');
 assert.equal(permittedIntervention(route(),current.text,context),'silent');
 assert.equal(permittedIntervention(route({purpose:'information',platformVocative:'Assistente'}),'Assistente, com quem jogo?',context),'none');
});
test('Continuation cannot inherit another participant platform question',()=>{
 const parent=turn('a','platform','Qual o dia?',{source:'platform',audienceIds:['João']});
 for(const author of ['Carlos','João']){
  const current=turn('b',author,'Dia 23');
  assert.equal(permittedIntervention(route({dependsOnMessageId:'a'}),current.text,{groupConversation:groupContext([parent],current)}),author==='João'?'participation':'silent');
 }
});
test('Genuine participation reaches the planner only after conversation approval',async()=>{
 const names:string[]=[];
 const result=await interpretParticipation('fake','Estou in',{},['one'],async(_url,options)=>{
  const name=JSON.parse(String(options?.body)).text.format.name;names.push(name);
  return envelope(name==='group_intervention'?route():{speechAct:'independent_request',explicitPlatformRequest:false,basisMessageId:null,scope:'personal_participation',addressedTo:'assistant',personalRequest:true,action:'join',journeyId:'one'});
 });assert.deepEqual(names,['group_intervention','journey_participation']);assert.deepEqual(result,{action:'join',journeyId:'one'});
});
test('Observer failures do not fall through to a planner or leak provider responses',async()=>{
 let calls=0;
 await assert.rejects(interpretParticipation('secret','in',{},[],async()=>{calls++;return new Response('secret',{status:500});}),e=>e instanceof Error&&!e.message.includes('secret'));
 assert.equal(calls,1);
});
