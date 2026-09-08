import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextReceipt} from '../src/whatsapp-receipts.ts';
test('Rejection overrides acceptance and late acceptance cannot hide a rejection', () => {
  assert.equal(nextReceipt(2,0),0);
  assert.equal(nextReceipt(0,2),0);
  assert.equal(nextReceipt(null,0),0);
});
test('Late ACKs cannot downgrade delivered/read messages', () => {
  assert.equal(nextReceipt(3,2),3);
  assert.equal(nextReceipt(4,3),4);
  assert.equal(nextReceipt(3,0),3);
  assert.equal(nextReceipt(0,3),3);
});
