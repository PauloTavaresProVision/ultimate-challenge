import {test} from 'node:test';import assert from 'node:assert/strict';
import {interpretJourneyAction as interpretParticipation} from '../src/journey-ai.ts';
const reply=(v:any)=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({speechAct:v.action==='none'?'information_question':'independent_request',explicitPlatformRequest:false,basisMessageId:null,addressedTo:'assistant',personalRequest:true,scope:v.action==='none'?'tournament_question':v.action==='silent'?'conversation':'personal_participation',...v})}]}]}));
test('Colloquial messages are passed to OpenAI without a phrase whitelist',async()=>{
 for(const text of ['estou in','alinho','mete o meu nome','podes contar comigo','a de terça']){
 const decision=await interpretParticipation('fake',text,{history:'quero participar',quotedJourney:'one'},['one'],async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(String(opts?.body));assert.equal(JSON.parse(body.input).message,text);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);return reply({action:'join',journeyId:'one'});});assert.equal(decision.action,'join');}
});
test('Unknown targets, malformed output and provider failures cannot trigger registration',async()=>{
 for(const response of [reply({action:'join',journeyId:'invented'}),reply({action:'delete',journeyId:'one'}),new Response('secret-key',{status:500})])await assert.rejects(interpretParticipation('secret-key','oi',{},['one'],async()=>response),e=>e instanceof Error&&!e.message.includes('secret-key'));
});
test('Unclear requests and unrelated conversation remain non-mutating decisions',async()=>{
 for(const action of ['clarify','none','silent'] as const)assert.deepEqual(await interpretParticipation('fake','talvez',{},['one'],async()=>reply({action,journeyId:null})),{action,journeyId:null});
});

test('A weekday alone cannot choose between two dates even when the model picks one',async()=>{
 const context={division:'M1',journeys:[{id:'a',division:'M1',date:'2026-09-23'},{id:'b',division:'M1',date:'2026-09-30'}]};
 const mock=async()=>reply({action:'join',journeyId:'a'});
 assert.equal((await interpretParticipation('fake','quarta podem contar comigo',context,['a','b'],mock)).journeyId,null);
 assert.equal((await interpretParticipation('fake','23/09 confirmado',context,['a','b'],mock)).journeyId,'a');
});

test('Conversation and third-party changes override contradictory registration actions and never fall through to general answers',async()=>{
 for(const [text,scope] of [
  ['Pedro canhão queres sair ?','conversation'],
  ['Sai do jogo e entra o Carlos Pereira para o lugar dele','third_party_change'],
  ['João, amanhã vens jogar?','conversation'],
  ['A Ana sai e entra a Maria','third_party_change'],
 ])for(const action of ['join','leave','clarify','none']){
  const result=await interpretParticipation('fake',text,{authorName:'Nelinho',history:{text:'quero entrar',action:'join'},journeys:[]},['one'],async(_url,options)=>{
   const request=JSON.parse(String(options?.body));
   assert.equal(JSON.parse(request.input).context.authorName,'Nelinho');
   assert.ok(request.text.format.schema.required.includes('scope'));
   return reply({scope,action,journeyId:'one'});
  });
  assert.deepEqual(result,{action:'silent',journeyId:null});
 }
});
test('A tournament question about someone else remains a read-only question',async()=>{
 const result=await interpretParticipation('fake','Com quem joga o Pedro?',{},['one'],async()=>reply({scope:'tournament_question',action:'join',journeyId:'one'}));
 assert.deepEqual(result,{action:'none',journeyId:null});
});
test('Own informal participation remains supported, without a fixed phrase whitelist',async()=>{
 for(const [text,action] of [['23/09 confirmado','join'],['estou in','join'],['afinal não consigo ir','leave']]){
  const result=await interpretParticipation('fake',text,{authorName:'Pedro'},['one'],async()=>reply({scope:'personal_participation',action,journeyId:'one'}));
  assert.equal(result.action,action);
 }
});

test('A human addressee overrides a mistaken personal leave classification',async()=>{
 const result=await interpretParticipation('fake','Boa noite Nelinho, não vou conseguir jogar entre pfvr 1 suplente',{},['one'],async()=>reply({scope:'personal_participation',personalRequest:true,addressedTo:'person',action:'leave',journeyId:'one'}));
 assert.deepEqual(result,{action:'silent',journeyId:null});
});
test('No personal request means no registration or clarification, even with stale participation memory',async()=>{
 for(const action of ['join','leave','clarify']){
  const result=await interpretParticipation('fake','Amanhã faço alteração',{history:{action:'join',text:'quero entrar'}},['one'],async()=>reply({scope:'personal_participation',personalRequest:false,addressedTo:'group',action,journeyId:'one'}));
  assert.deepEqual(result,{action:'silent',journeyId:null});
 }
});
