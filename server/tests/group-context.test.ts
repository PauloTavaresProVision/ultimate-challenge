import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendGroupTurn,groupContext,GroupQueue,GROUP_CONTEXT_AGE,GROUP_CONTEXT_LIMIT,type GroupTurn} from '../src/group-context.ts';
import {interpretParticipation} from '../src/journey-ai.ts';
import {converse} from '../src/tournament-assistant.ts';
const now=Date.now();
const turn=(id:string,author:string,text:string,extra:Partial<GroupTurn>={}):GroupTurn=>({id,authorId:author,authorName:author,source:'member',at:now,text,...extra});
const output=(value:unknown)=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
test('Shared context retains different authors, resolves quoted replies and excludes future messages',()=>{
 const first=turn('a','Alexandre','Boa noite Nelinho, não vou conseguir jogar entre pfvr 1 suplente',{at:now-5000});
 const second=turn('b','Nelinho','Amanhã faço alteração',{replyToId:'a'});
 let memory=appendGroupTurn([],first,now);
 memory=appendGroupTurn(memory,second,now);
 memory=appendGroupTurn(memory,turn('future','Pedro','Estou in',{at:now+1000}),now);
 const context=groupContext(memory,second);
 assert.deepEqual(context.messages,[{...first,displayName:undefined,quoted:undefined}]);
 assert.equal(context.repliedMessage?.text,first.text);
 assert.equal(context.currentMessage.authorId,'Nelinho');
});
test('Rolling context expires, remains bounded and does not downgrade or duplicate platform echoes',()=>{
 let memory=[turn('old','A','antiga',{at:now-GROUP_CONTEXT_AGE-1})];
 for(let i=0;i<50;i++)memory=appendGroupTurn(memory,turn(String(i),'P'+i,'x'.repeat(3000)),now);
 assert.equal(memory.length,GROUP_CONTEXT_LIMIT);assert.ok(memory.every(m=>m.text.length===1500));
 memory=appendGroupTurn(memory,turn('sent','platform','Qual a jornada?',{source:'platform'}),now);
 memory=appendGroupTurn(memory,turn('sent','club','Qual a jornada?',{source:'connected_account'}),now);
 assert.equal(memory.filter(m=>m.id==='sent').length,1);assert.equal(memory.find(m=>m.id==='sent')?.source,'platform');
 assert.equal(appendGroupTurn(memory,turn('new','A','hoje',{at:now+GROUP_CONTEXT_AGE+1}),now+GROUP_CONTEXT_AGE+1).length,1);
});
test('Different groups run independently but messages of one group cannot overtake each other; errors do not block next turn',async()=>{
 const queue=new GroupQueue();let release!:()=>void;const gate=new Promise<void>(r=>release=r);const seen:string[]=[];
 const a=queue.run('one',async()=>{await gate;seen.push('a');throw Error('failed');});
 const checked=assert.rejects(a,/failed/);
 const b=queue.run('one',async()=>{seen.push('b');});
 await queue.run('two',async()=>{seen.push('other');});assert.deepEqual(seen,['other']);
 release();await checked;await b;assert.deepEqual(seen,['other','a','b']);
});
test('Both AI routes receive multi-author messages and quote context as data',async()=>{
 const first=turn('a','Alexandre','Nelinho, não posso ir.');
 const current=turn('b','Nelinho','Amanhã faço alteração',{replyToId:'a'});
 const context=groupContext([first],current);
 await interpretParticipation('fake',current.text,{groupConversation:context},[],async(_url,options)=>{
  const request=JSON.parse(String(options?.body));assert.deepEqual(JSON.parse(request.input).context.groupConversation,context);
  return output({addressedTo:'person',personalRequest:false,scope:'conversation',action:'silent',journeyId:null});
 });
 const answer=await converse('fake',current.text,[],{groupConversation:context},async()=>{throw Error('must not query');},async(_url,options)=>{
  const request=JSON.parse(String(options?.body));assert.deepEqual(JSON.parse(request.input[0].content).groupConversation,context);
  assert.ok(!request.instructions.includes(first.text));
  return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:'SILENT'}]}]}));
 });assert.equal(answer,null);
});
test('Uncertain recipient is silent even if model proposes an action or question; clarification requires assistant addressee',async()=>{
 for(const action of ['join','leave','clarify','none']){
  const result=await interpretParticipation('fake','sim',{},[],async()=>output({addressedTo:'unclear',personalRequest:true,scope:action==='none'?'tournament_question':'personal_participation',action,journeyId:null}));
  assert.equal(result.action,'silent');
 }
 const result=await interpretParticipation('fake','alterar',{},[],async()=>output({addressedTo:'group',personalRequest:true,scope:'personal_participation',action:'clarify',journeyId:null}));
 assert.equal(result.action,'silent');
});

test('Explicit reply resolves despite timestamp precision differences between transport and local sends',()=>{
 const sent=turn('a','platform','Qual o dia?',{source:'platform',at:now+400});
 const current=turn('b','João','Dia 23',{replyToId:'a'});
 const context=groupContext([sent],current);
 assert.equal(context.repliedMessage?.id,'a');
});
