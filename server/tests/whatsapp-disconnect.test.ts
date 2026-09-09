import {test} from 'node:test';
import assert from 'node:assert/strict';
import {disconnectPolicy} from '../src/whatsapp-disconnect.ts';
test('Replacement and forbidden stop without invalidating saved session',()=>{for(const code of [440,403]){assert.equal(disconnectPolicy(code).invalidate,false);assert.equal(disconnectPolicy(code).stop,true);}});
test('Only explicit logout invalidates; transient errors reconnect',()=>{assert.equal(disconnectPolicy(401).invalidate,true);for(const code of [408,428,515,undefined]){assert.equal(disconnectPolicy(code).invalidate,false);assert.equal(disconnectPolicy(code).stop,false);}});
test('Bad session is preserved for diagnosis instead of forcing a new QR',()=>{assert.equal(disconnectPolicy(500).invalidate,false);assert.equal(disconnectPolicy(500).stop,true);assert.notEqual(disconnectPolicy(500).message,disconnectPolicy(401).message);});
