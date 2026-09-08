import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {WASocket} from '@whiskeysockets/baileys';
import {joinApprovedPlayer} from '../src/group-join.ts';
const phone='244900000001@s.whatsapp.net';
function socket(participants:unknown[],status='200') {let calls=0;return {api:{groupMetadata:async()=>({participants}),groupParticipantsUpdate:async()=>{calls++;return [{status}];}} as unknown as Pick<WASocket,'groupMetadata'|'groupParticipantsUpdate'>,calls:()=>calls};}
test('Existing members including LID phone mapping are not added again',async()=>{const s=socket([{id:'123@lid',phoneNumber:phone}]);assert.equal(await joinApprovedPlayer(s.api,'group@g.us',phone),'already_member');assert.equal(s.calls(),0);});
test('Successful addition and privacy rejection have distinct outcomes',async()=>{assert.equal(await joinApprovedPlayer(socket([]).api,'group@g.us',phone),'added');assert.equal(await joinApprovedPlayer(socket([],'403').api,'group@g.us',phone),'invite');});
test('Unknown results and transport failures never claim success or trigger fallback',async()=>{await assert.rejects(joinApprovedPlayer(socket([],'500').api,'group@g.us',phone));const s=socket([]);s.api.groupParticipantsUpdate=async()=>{throw Error('connection lost');};await assert.rejects(joinApprovedPlayer(s.api,'group@g.us',phone));});
