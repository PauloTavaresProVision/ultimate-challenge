import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webStartupError} from '../src/whatsapp-web-error.ts';
test('browser startup diagnostics distinguish profile lock, missing browser and timeout without exposing raw errors',()=>{
  assert.match(webStartupError(new Error('The profile appears to be in use by another Chromium process')),/bloqueado/);
  assert.match(webStartupError(new Error('Could not find Chrome')),/não foi encontrado/);
  assert.match(webStartupError('auth timeout'),/tempo limite/);
  assert.match(webStartupError(new Error('net::ERR_NAME_NOT_RESOLVED')),/rede/);
  assert(!webStartupError(new Error('private-token-secret')).includes('private-token-secret'));
});
