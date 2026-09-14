import {test} from 'node:test';
import assert from 'node:assert/strict';
import {journeyIntent,enrol,type Journey} from '../../lib/journey.ts';
test('Only explicit first-person participation requests mutate the journey',()=>{
 for(const s of ['quero entrar','Quero participar!','inscreve-me','quero entrar jornada abc123'])assert.equal(journeyIntent(s),'join');
 for(const s of ['não posso ir','quero sair'])assert.equal(journeyIntent(s),'leave');
 for(const s of ['ele quer entrar','quero entrar?','talvez quero entrar','não quero entrar','posso substituir'])assert.equal(journeyIntent(s),null);
});
test('Registration is idempotent and capacity sends extras to waitlist',()=>{
 const j={confirmed:['a'],waiting:[],capacity:1} as unknown as Journey;
 enrol(j,'b','join');enrol(j,'b','join');assert.deepEqual(j.waiting,['b']);assert.deepEqual(j.confirmed,['a']);enrol(j,'a','leave');assert.deepEqual(j.confirmed,[]);
});
