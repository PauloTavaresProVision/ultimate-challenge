// Deterministic queue/load simulation. No database, AI API or WhatsApp calls.
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {drainIncomingParallel} from './src/incoming-queue.ts';
import {enrol} from '../lib/journey.ts';

async function evaluate(concurrency){
 const start=performance.now();
 const jobs=Array.from({length:20},(_,i)=>({id:String(i),author:'player-'+i,action:'join',attempts:0,receivedAt:new Date(Date.now()-3000),nextAttemptAt:new Date(0),done:false}));
 jobs[6].author=jobs[0].author; // repeated signup
 jobs[12].author=jobs[2].author;jobs[12].action='leave';
 jobs[18].author=jobs[2].author; // same person joins again after leaving
 const journey={confirmed:[],waiting:[],capacity:8};
 const expected=structuredClone(journey),order=[],confirmationTimes=[];
 const apply=(j,job)=>{enrol(j,job.author,job.action);if(job.action==='leave'&&j.waiting.length&&j.confirmed.length<j.capacity)j.confirmed.push(j.waiting.shift());};
 jobs.forEach(job=>apply(expected,job));
 let running=0,peak=0;
 const store={first:async()=>jobs.find(j=>!j.done),pending:async n=>jobs.filter(j=>!j.done).slice(0,n),attempt:async j=>{j.attempts++;},complete:async j=>{j.done=true;},retry:async()=>{throw Error('Unexpected failure');}};
 await drainIncomingParallel(store,async job=>({author:job.author,snapshot:async()=>async commit=>{
  running++;peak=Math.max(peak,running);
  await delay(Number(job.id)%4===0?100:50);running--;
  await commit();apply(journey,job);order.push(job.id);confirmationTimes.push(performance.now()-start);
 }}),{concurrency});
 assert.deepEqual(order,jobs.map(j=>j.id));assert.deepEqual(journey,expected);assert.ok(jobs.every(j=>j.done));assert.ok(peak<=concurrency);
 return {paralelismo:concurrency,picoDeAnalises:peak,pedidos:20,tempoTotalMs:Math.round(performance.now()-start),ultimaConfirmacaoSimuladaMs:Math.round(confirmationTimes.at(-1)),confirmados:journey.confirmed.length,emEspera:journey.waiting.length};
}
console.log('Simulação local: análise artificial de 50–100 ms por pedido. Não mede a latência real da IA nem do WhatsApp.');
console.log(JSON.stringify({sequencial:await evaluate(1),paralelo:await evaluate(4)},null,2));
console.log('OK: ordem preservada, sem inscrições duplicadas, desistência e reentrada corretas. Nenhuma mensagem enviada e nenhuma inscrição real alterada.');
