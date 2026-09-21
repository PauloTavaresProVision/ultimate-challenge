import {test} from 'node:test';import assert from 'node:assert/strict';
import {forbiddenPartnership} from '../../lib/pairing-restrictions.ts';
test('Restriction is symmetric, accent tolerant, exact-name and M1+ scoped',()=>{
 const a={name:'SERGIO VIEIRA',division:'M1+' as const},b={name:'Ivo Guilherme Rêgo',division:'M1+' as const};
 assert.equal(forbiddenPartnership(a,b),true);assert.equal(forbiddenPartnership(b,a),true);
 assert.equal(forbiddenPartnership({...a,division:'M1'},{...b,division:'M1'}),false);
 assert.equal(forbiddenPartnership({...a,name:'Sérgio Vieira Santos'},b),false);
});
