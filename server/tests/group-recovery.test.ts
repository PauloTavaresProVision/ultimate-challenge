import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recoverGroupEntry} from '../src/group-recovery.ts';
import {joinApprovedPlayer} from '../src/group-join.ts';
const error=new Error('Protocol error (Runtime.callFunctionOn): Execution context was destroyed.');
test('only interrupted membership operations are eligible for bounded recovery',()=>{
 assert.equal(recoverGroupEntry('group_join','adicionar-participante',2,error),true);
 assert.equal(recoverGroupEntry('group_join','adicionar-participante',4,error),false);
 for(const stage of ['enviar-link','obter-link','preparar-boas-vindas'])assert.equal(recoverGroupEntry('group_join',stage,0,error),false);
 assert.equal(recoverGroupEntry('invitation','adicionar-participante',0,error),false);
 assert.equal(recoverGroupEntry('group_join','adicionar-participante',0,new Error('403')),false);
});
test('recovered membership checks existing members without adding twice',async()=>{
 let additions=0;
 const socket={groupMetadata:async()=>({id:'1@g.us',subject:'Test',participants:[{id:'244900000001@s.whatsapp.net'}]}),groupParticipantsUpdate:async()=>{additions++;return [{status:'200'}];}};
 assert.equal(await joinApprovedPlayer(socket,'1@g.us','244900000001@s.whatsapp.net'),'already_member');
 assert.equal(additions,0);
});
