import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rosterReply} from '../src/bot-roster.ts';
test('Roster lists the supplied approved players with division and playing side',()=>{
 const reply=rosterReply('M1',[{name:'Ana',side:'Esquerda'},{name:'João',side:'Direita'}]);
 assert.match(reply,/M1/);assert.match(reply,/2 jogadores/);assert.match(reply,/Ana — Esquerda/);assert.match(reply,/João — Direita/);
});
test('Empty divisions do not fabricate players',()=>{
 assert.equal(rosterReply('M1+',[]),'Ainda não há jogadores com inscrição aprovada na divisão M1+.');
});
