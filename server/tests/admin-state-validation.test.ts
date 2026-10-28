import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{DATABASE_URL:'postgresql://localhost/unused',APP_ORIGIN:'https://test.invalid',SESSION_SECRET:'s'.repeat(32),MESSAGE_KEY:'a'.repeat(64),ADMIN_EMAIL:'test@example.com',ADMIN_PASSWORD:'test-password'});
const {parseAdminState,validateRetiredDivision}=await import('../src/admin-state.ts');
const player={id:'existing',name:'Existing Player',phone:'+244900000001',birth:'1980-01-01',side:'Esquerda',division:'M2',status:'Ativo',verified:true,note:''};
test('Unrelated state saves can preserve existing M2 players without reopening M2 assignments',()=>{
 const data=parseAdminState({revision:1,players:[player],courts:[],games:[]});
 assert.equal(data.players[0].division,'M2');
 assert.doesNotThrow(()=>validateRetiredDivision(data.players[0],{division:'M2'}));
 assert.throws(()=>validateRetiredDivision(data.players[0],{division:'M1'}),/Não é possível/);
 assert.throws(()=>validateRetiredDivision(data.players[0]),/Não é possível/);
 assert.doesNotThrow(()=>validateRetiredDivision({division:'M2+'},{division:'M2'}));
});
test('Invalid snapshot reports the rejected record and field instead of a generic message',()=>{
 assert.throws(()=>parseAdminState({revision:1,players:[{...player,birth:'invalid'}],courts:[],games:[]}),/Jogadores → registo 1 → data de nascimento/);
});
