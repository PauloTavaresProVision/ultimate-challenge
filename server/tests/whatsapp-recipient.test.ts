import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveRecipient} from '../src/whatsapp-recipient.ts';
test('Private sends use the stored WhatsApp LID mapping', async () => {
  assert.equal(await resolveRecipient('244900000001@s.whatsapp.net',async pn=>{assert.equal(pn,'244900000001@s.whatsapp.net');return '123456@lid';}),'123456@lid');
});
test('Missing or invalid mappings preserve the phone; groups do not query mappings', async () => {
  const pn='244900000001@s.whatsapp.net';
  assert.equal(await resolveRecipient(pn,async()=>null),pn);
  assert.equal(await resolveRecipient(pn,async()=>'123@g.us'),pn);
  assert.equal(await resolveRecipient('123@g.us',async()=>{throw new Error('must not query');}),'123@g.us');
});
