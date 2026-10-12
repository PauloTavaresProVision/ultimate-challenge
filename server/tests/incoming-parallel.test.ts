import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {drainIncomingParallel,type IncomingJob,type PreparedIncoming} from '../src/incoming-queue.ts';
import {enrol,type Journey} from '../../lib/journey.ts';

type Job=IncomingJob&{author:string;action:'join'|'leave';done:boolean;order:number};
function fixture(count:number){
 let now=100000;
 const jobs:Job[]=Array.from({length:count},(_,i)=>({id:String(i),author:'player-'+i,action:'join',done:false,order:i,attempts:0,nextAttemptAt:new Date(0),receivedAt:new Date(now-3000)}));
 const sorted=()=>jobs.filter(j=>!j.done).sort((a,b)=>a.order-b.order);
 const store={first:async()=>sorted()[0]??null,pending:async(n:number)=>sorted().slice(0,n).map(j=>({...j})),
 attempt:async(j:Job)=>{jobs.find(x=>x.id===j.id)!.attempts++;},
 complete:async(j:Job)=>{jobs.find(x=>x.id===j.id)!.done=true;},
 retry:async(j:Job,at:Date)=>{jobs.find(x=>x.id===j.id)!.nextAttemptAt=at;}};
 return {jobs,store,options:{now:()=>now},advance:()=>{now+=60000;}};
}

test('20 simultaneous requests: four overlapping analyses, chronological vacancies, duplicates and withdrawal',async()=>{
 const f=fixture(20);f.jobs[5].author='player-0';f.jobs[9].author='player-2';f.jobs[9].action='leave';
 const journey={confirmed:[],waiting:[],capacity:6} as unknown as Journey;
 const baseline=structuredClone(journey);
 const apply=(j:Journey,job:Job)=>{enrol(j,job.author,job.action);if(job.action==='leave'&&j.waiting.length&&j.confirmed.length<j.capacity)j.confirmed.push(j.waiting.shift()!);};
 f.jobs.forEach(job=>apply(baseline,job));
 let running=0,peak=0;const committed:string[]=[],snapshots:string[]=[],finished:string[]=[];
 const count=await drainIncomingParallel(f.store,async job=>({author:job.author,snapshot:async()=>{
 snapshots.push(job.id);
 return async commit=>{
  running++;peak=Math.max(peak,running);
  await delay(job.order%4===0?20:1);running--;finished.push(job.id);
  await commit();apply(journey,job);committed.push(job.id);
 };
 }}),f.options);
 assert.equal(count,20);assert.equal(peak,4);
 assert.notDeepEqual(finished,committed);assert.deepEqual(committed,f.jobs.map(j=>j.id));
 assert.deepEqual(snapshots,committed);assert.deepEqual(journey,baseline);
 assert.equal(new Set(journey.confirmed).size,journey.confirmed.length);
});

test('Same author snapshot and interpretation wait for their prior committed result',async()=>{
 const f=fixture(4);f.jobs[2].author=f.jobs[0].author;
 let registered=false;
 await drainIncomingParallel(f.store,async job=>({author:job.author,snapshot:async()=>{
  if(job.id==='2')assert.equal(registered,true);
  return async commit=>{if(job.id==='0')await delay(10);await commit();if(job.id==='0')registered=true;};
 }}),f.options);
 assert.ok(f.jobs.every(j=>j.done));
});

test('Failed oldest analysis blocks later commits; cached later analyses survive retry without overtaking',async()=>{
 const f=fixture(8),cache=new Set<string>(),counts=new Map<string,number>(),committed:string[]=[];
 let fail=true;
 const prepare=async(job:Job):Promise<PreparedIncoming>=>({author:job.author,snapshot:async()=>async commit=>{
  if(!cache.has(job.id)){
   counts.set(job.id,(counts.get(job.id)??0)+1);
   if(job.id==='0'&&fail){await delay(10);throw Error('Provider timeout');}
   cache.add(job.id);
  }
  await commit();committed.push(job.id);
 }});
 assert.equal(await drainIncomingParallel(f.store,prepare,f.options),0);
 assert.deepEqual(committed,[]);assert.equal(f.jobs[4].attempts,0);
 assert.equal(await drainIncomingParallel(f.store,prepare,f.options),0);
 fail=false;f.advance();assert.equal(await drainIncomingParallel(f.store,prepare,f.options),8);
 assert.deepEqual(committed,f.jobs.map(j=>j.id));assert.equal(counts.get('0'),2);assert.equal(counts.get('1'),1);
});

test('Lease loss during interpretation prevents every commit and acknowledgement',async()=>{
 const f=fixture(4);let active=true,mutations=0;
 await drainIncomingParallel(f.store,async job=>({author:job.author,snapshot:async()=>async commit=>{
  await delay(5);active=false;await commit();mutations++;
 }}),{...f.options,active:()=>active});
 assert.equal(mutations,0);assert.ok(f.jobs.every(j=>!j.done));
});

test('Preparation failure settles started work and retains subsequent jobs',async()=>{
 const f=fixture(4);const committed:string[]=[];
 const n=await drainIncomingParallel(f.store,async job=>{
  if(job.id==='1')throw Error('Phone resolution failed');
  return {author:job.author,snapshot:async()=>async commit=>{await delay(5);await commit();committed.push(job.id);}};
 },f.options);
 assert.equal(n,1);assert.deepEqual(committed,['0']);assert.equal(f.jobs[2].attempts,0);
});

test('Restart after commit replays idempotently and preserves next vacancy',async()=>{
 const f=fixture(4);const committed=new Set<string>();let crash=true,confirmations=0;
 const prepare=async(job:Job):Promise<PreparedIncoming>=>({author:job.author,snapshot:async()=>async commit=>{
  await commit();if(!committed.has(job.id)){committed.add(job.id);confirmations++;}
  if(job.id==='0'&&crash)throw Error('Crash after transaction');
 }});
 await drainIncomingParallel(f.store,prepare,f.options);assert.equal(confirmations,1);
 crash=false;f.advance();await drainIncomingParallel(f.store,prepare,f.options);
 assert.equal(confirmations,4);assert.ok(f.jobs.every(j=>j.done));
});

test('A fresh oldest request cannot be overtaken even if later requests are ready',async()=>{
 const f=fixture(4);f.jobs[0].receivedAt=new Date(f.options.now());let preparations=0;
 assert.equal(await drainIncomingParallel(f.store,async()=>{preparations++;throw Error();},f.options),0);
 assert.equal(preparations,0);
});


test('Storage failure during preparation cannot release the lease while another task is still running',async()=>{
 const f=fixture(4);let settled=false;
 f.store.retry=async()=>{throw Error('Storage unavailable');};
 await assert.rejects(drainIncomingParallel(f.store,async job=>{
  if(job.id==='1')throw Error('Preparation unavailable');
  return {author:job.author,snapshot:async()=>async commit=>{await delay(10);await commit();settled=true;}};
 },f.options),/Storage unavailable/);
 assert.equal(settled,true);assert.equal(f.jobs[0].done,true);assert.equal(f.jobs[2].attempts,0);
});
