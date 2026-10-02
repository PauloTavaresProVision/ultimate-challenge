import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drainIncoming,type IncomingJob,type IncomingStore} from '../src/incoming-queue.ts';
import {enrol,type Journey} from '../../lib/journey.ts';

type Job=IncomingJob&{messageAt:number;sequence:number;done:boolean};
function fixture() {
 let now=100000;
 const jobs:Job[]=[];
 const add=(id:string,messageAt:number)=>{
   if(jobs.some(j=>j.id===id))return;
   jobs.push({id,messageAt,sequence:jobs.length,done:false,attempts:0,nextAttemptAt:new Date(0),receivedAt:new Date(now-3000)});
 };
 const store:IncomingStore<Job>={
   first:async()=>{const j=jobs.filter(j=>!j.done).sort((a,b)=>a.messageAt-b.messageAt||a.sequence-b.sequence)[0];return j?{...j}:null;},
   attempt:async j=>{jobs.find(x=>x.id===j.id)!.attempts++;},
   complete:async j=>{jobs.find(x=>x.id===j.id)!.done=true;},
   retry:async(j,at)=>{jobs.find(x=>x.id===j.id)!.nextAttemptAt=at;}
 };
 return {jobs,add,store,options:{now:()=>now},advance:(ms:number)=>{now+=ms;}};
}
test('Earlier request keeps the last vacancy despite AI failure; later arrival cannot overtake on retry',async()=>{
 const f=fixture();f.add('tiago',20);f.add('wilson',10);
 const j={confirmed:['existing'],waiting:[],capacity:2} as unknown as Journey;
 let fail=true;
 const process=async(job:Job)=>{if(job.id==='wilson'&&fail)throw Error('API timeout');enrol(j,job.id,'join');};
 await drainIncoming(f.store,process,f.options);
 assert.deepEqual(j.confirmed,['existing']);assert.equal(f.jobs.find(x=>x.id==='tiago')!.attempts,0);
 await drainIncoming(f.store,process,f.options);
 assert.deepEqual(j.waiting,[]);
 fail=false;f.advance(5000);
 await drainIncoming(f.store,process,f.options);
 assert.deepEqual(j.confirmed,['existing','wilson']);assert.deepEqual(j.waiting,['tiago']);
});
test('Restart retries a committed event without creating a second registration or confirmation',async()=>{
 const f=fixture();f.add('same-provider-event',1);f.add('same-provider-event',1);
 const committed=new Set<string>();let confirmations=0,crash=true;
 const process=async(j:Job)=>{if(!committed.has(j.id)){committed.add(j.id);confirmations++;}if(crash)throw Error('Crash after commit');};
 await drainIncoming(f.store,process,f.options);
 assert.equal(f.jobs[0].done,false);
 crash=false;f.advance(5000);
 await drainIncoming(f.store,process,f.options);
 assert.equal(confirmations,1);assert.equal(f.jobs.length,1);assert.equal(f.jobs[0].done,true);
});
test('A burst of 60 requests retains chronological order across drain batches',async()=>{
 const f=fixture();for(let i=59;i>=0;i--)f.add(String(i),i);
 const seen:number[]=[];const process=async(j:Job)=>{seen.push(Number(j.id));};
 assert.equal(await drainIncoming(f.store,process,f.options),50);
 assert.equal(await drainIncoming(f.store,process,f.options),10);
 assert.deepEqual(seen,Array.from({length:60},(_,i)=>i));
});
test('Retry backoff does not discard requests and never grows beyond one minute',async()=>{
 const f=fixture();f.add('one',1);
 for(let i=0;i<8;i++){
   await drainIncoming(f.store,async()=>{throw Error('Unavailable');},f.options);
   assert.equal(f.jobs[0].done,false);
   assert.ok(f.jobs[0].nextAttemptAt.getTime()-f.options.now()<=60000);
   f.advance(60000);
 }
 assert.equal(f.jobs[0].attempts,8);
});
test('Disconnected worker stops without acknowledging the current request',async()=>{
 const f=fixture();f.add('one',1);f.add('two',2);let active=true;
 await drainIncoming(f.store,async()=>{active=false;},{...f.options,active:()=>active});
 assert.equal(f.jobs[0].done,false);assert.equal(f.jobs[1].attempts,0);
});
test('Equal timestamps use arrival order; a fresh head waits for the reorder window',async()=>{
 const f=fixture();f.add('first',1);f.add('second',1);f.jobs[0].receivedAt=new Date(f.options.now());
 const seen:string[]=[];
 assert.equal(await drainIncoming(f.store,async j=>{seen.push(j.id);},f.options),0);
 f.advance(2000);await drainIncoming(f.store,async j=>{seen.push(j.id);},f.options);
 assert.deepEqual(seen,['first','second']);
});
