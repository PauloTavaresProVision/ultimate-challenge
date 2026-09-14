import {test} from 'node:test';import assert from 'node:assert/strict';
import {interpretParticipation} from '../src/journey-ai.ts';
const reply=(v:unknown)=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(v)}]}]}));
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
