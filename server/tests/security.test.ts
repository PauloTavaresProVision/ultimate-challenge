import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  hashPassword,
  checkPassword,
  encrypt,
  decrypt,
  phoneFromJid,
  codeDigest,
  digest,
  randomToken,
} from '../src/security.ts';
test('Password hashes are salted and reject incorrect passwords', () => {
  const a = hashPassword('long-passphrase-123');
  const b = hashPassword('long-passphrase-123');
  assert.notEqual(a, b);
  assert(checkPassword('long-passphrase-123', a));
  assert(!checkPassword('incorrect', a));
});
test('Encrypted WhatsApp messages authenticate contents and key', () => {
  const key = randomBytes(32).toString('hex');
  const body = encrypt('code 123456', key);
  assert(!body.includes('123456'));
  assert.equal(decrypt(body, key), 'code 123456');
  assert.throws(() => decrypt(body, randomBytes(32).toString('hex')));
});
test('LID and group identifiers never become phone numbers', () => {
  assert.equal(phoneFromJid('244900123456:4@s.whatsapp.net'), '+244900123456');
  assert.equal(phoneFromJid('123456789012345@lid'), null);
  assert.equal(phoneFromJid('123456789@g.us'), null);
  assert.equal(phoneFromJid('abc@s.whatsapp.net'), null);
});
test('Codes are bound to player and server secret; sessions unpredictable', () => {
  assert.notEqual(
    codeDigest('a', '123456', 'secret'),
    codeDigest('b', '123456', 'secret'),
  );
  assert.notEqual(randomToken(), randomToken());
  assert.equal(digest('abc').length, 64);
});
