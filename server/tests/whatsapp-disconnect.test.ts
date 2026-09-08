import {test} from 'node:test';
import assert from 'node:assert/strict';
import {disconnectPolicy} from '../src/whatsapp-disconnect.ts';
test('Replacement and forbidden stop without invalidating saved session',()=>{for(const code of [440,403]){assert.equal(disconnectPolicy(code).invalidate,false);assert.equal(disconnectPolicy(code).stop,true);}});
test('Only explicit logout and bad session invalidate; transient errors reconnect',()=>{for(const code of [401,500])assert.equal(disconnectPolicy(code).invalidate,true);for(const code of [408,428,515,undefined]){assert.equal(disconnectPolicy(code).invalidate,false);assert.equal(disconnectPolicy(code).stop,false);}});
