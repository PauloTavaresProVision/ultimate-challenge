import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mentionedReply,decodeBotMessage} from '../src/bot-message.ts';
test('Replies carry a visible tag and a WhatsApp mention of the registered sender',()=>{
 const reply=mentionedReply('Sim, avisamos no grupo.','+244900000001');
 assert.equal(reply.text,'@244900000001 Sim, avisamos no grupo.');
 assert.deepEqual(reply.mentions,['244900000001@s.whatsapp.net']);
 assert.deepEqual(decodeBotMessage(JSON.stringify({format:'mentioned-reply-v1',...reply})),reply);
});
test('Already queued plain text replies remain readable',()=>{
 assert.deepEqual(decodeBotMessage('Ainda não há jogos.'),{text:'Ainda não há jogos.'});
 assert.throws(()=>mentionedReply('Olá','123@lid'));
});
test('Private clarification metadata survives decoding without changing visible message',()=>{
 const reply=mentionedReply('Qual o dia?','+244900000001');
 assert.deepEqual(decodeBotMessage(JSON.stringify({format:'mentioned-reply-v1',...reply,interaction:'clarification'})),{...reply,interaction:'clarification'});
});
