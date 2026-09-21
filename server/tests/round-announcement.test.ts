import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roundAnnouncement} from '../src/round-announcement.ts';
import {decodeBotMessage} from '../src/bot-message.ts';

const players = ['1','2','3','4'].map(id => ({id,phone:`+24492345678${id}`}));
const courts = [{id:'c',location:'Premier Padel Club'}];
const game = {division:'M1+',date:'2026-09-23',time:'20:00',court:'c',a:['1','2'],b:['3','4']};
test('Round announces each participant once across four games, with real mentions and earliest time', () => {
  const message = roundAnnouncement(['21:00','20:40','20:20','20:00'].map(time=>({...game,time})),players,courts,'https://example.com/');
  const decoded = decodeBotMessage(JSON.stringify(message));
  assert.equal(decoded.mentions?.length,4);
  assert.equal(message.text.match(/@244923456781/g)?.length,1);
  assert.ok(message.text.includes('23/09/2026'));
  assert.ok(message.text.includes('*20:00*'));
  assert.ok(!message.text.includes('21:00'));
  assert.ok(message.text.includes('Premier Padel Club'));
  assert.ok(message.text.endsWith('https://example.com/jogos'));
  assert.deepEqual(decodeBotMessage('Old round text'),{text:'Old round text'});
});
test('Multiple divisions and dates retain their own announcement context', () => {
  const message = roundAnnouncement([game,{...game,division:'M2',date:'2026-09-22'}],players,courts,'https://example.com');
  assert.ok(message.text.includes('Ultimate Challenge · M2'));
  assert.ok(message.text.includes('22/09/2026'));
  assert.ok(message.text.includes('Ultimate Challenge · M1+'));
  assert.equal(message.mentions.length,4);
});
test('Missing participants and invalid numbers cannot produce a misleading convocatoria', () => {
  assert.throws(()=>roundAnnouncement([game],players.slice(1),courts,'https://example.com'));
  assert.throws(()=>roundAnnouncement([game],players.map(p=>({...p,phone:'invalid'})),courts,'https://example.com'));
});
