import {test} from 'node:test';
import assert from 'node:assert/strict';
import {closeDiagnostic} from '../src/whatsapp-close-diagnostic.ts';
test('logout diagnostics report known causes without exposing protocol data',()=>{
  const result=closeDiagnostic({output:{statusCode:401},data:{attrs:{type:'device_removed',secret:'private-value'}}},'connected',Date.now());
  assert.equal(result.reason,'device_removed');assert.equal(result.code,401);
  assert(!JSON.stringify(result).includes('private-value'));
  assert.equal(closeDiagnostic({data:{reason:'private-value'}},'qr',Date.now()).reason,'not_provided');
});
