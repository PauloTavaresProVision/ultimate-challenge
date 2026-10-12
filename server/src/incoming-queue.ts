// The caller holds a database lock for the entire drain, including retries.
// Never select only "due" jobs: that would let a later request overtake a failure.
export type IncomingJob = {id:string;attempts:number;nextAttemptAt:Date;receivedAt:Date};
export interface IncomingStore<T extends IncomingJob> {
  first():Promise<T|null>;
  attempt(job:T):Promise<void>;
  complete(job:T):Promise<void>;
  retry(job:T,at:Date):Promise<void>;
}

export type IncomingCommit = () => Promise<void>;
export type PreparedIncoming = {
  author: string;
  // Capture conversation context in arrival order, before concurrent interpretation.
  snapshot: () => Promise<(commit: IncomingCommit) => Promise<void>>;
};
class EarlierRequestPending extends Error {}

// Interpret a bounded window concurrently; only the commit barrier grants mutation rights.
// The caller retains the database lease until every started task has settled.
export async function drainIncomingParallel<T extends IncomingJob>(
  store: IncomingStore<T> & {pending:(limit:number)=>Promise<T[]>},
  prepare:(job:T)=>Promise<PreparedIncoming>,
  options:{now?:()=>number;active?:()=>boolean;limit?:number;concurrency?:number}={},
) {
  const now=options.now??Date.now, active=options.active??(()=>true);
  const limit=options.limit??50, width=Math.max(1,Math.min(4,options.concurrency??4));
  let completed=0;
  while(completed<limit&&active()) {
    const candidates=await store.pending(Math.min(width,limit-completed));
    const jobs:T[]=[];
    for(const job of candidates){
      if(job.nextAttemptAt.getTime()>now()||job.receivedAt.getTime()+2000>now())break;
      jobs.push(job);
    }
    if(!jobs.length)break;
    let previous=Promise.resolve(true);
    const authors=new Map<string,Promise<boolean>>();
    const tasks:Promise<boolean>[]=[];
    let storageError:unknown;
    for(const job of jobs){
      const predecessor=previous;
      let prepared:PreparedIncoming;
      let run:(commit:IncomingCommit)=>Promise<void>;
      try {
        if(!active())break;
        await store.attempt(job);
        prepared=await prepare(job);
        const ownPrevious=authors.get(prepared.author);
        if(ownPrevious&&!await ownPrevious)break;
        if(!active())break;
        run=await prepared.snapshot();
      } catch {
        try {await store.retry(job,new Date(now()+Math.min(60000,5000*2**Math.min(job.attempts,4))));}
        catch(error){storageError=error;}
        break;
      }
      const task=(async()=>{
        const commit=async()=>{
          if(!await predecessor||!active())throw new EarlierRequestPending();
        };
        try {
          await run(commit);
          await commit();
          await store.complete(job);
          completed++;
          return true;
        } catch(error) {
          if(!(error instanceof EarlierRequestPending))
            await store.retry(job,new Date(now()+Math.min(60000,5000*2**Math.min(job.attempts,4))));
          return false;
        }
      })();
      authors.set(prepared.author,task);
      void task.catch(()=>{}); // Observe immediately; allSettled below propagates storage failures.
      previous=task;
      tasks.push(task);
    }
    const settled=await Promise.allSettled(tasks);
    if(storageError)throw storageError;
    if(settled.some(r=>r.status==='rejected'))throw Error('Falha ao guardar o estado da fila.');
    if(tasks.length!==jobs.length||settled.some(r=>r.status==='fulfilled'&&!r.value))break;
  }
  return completed;
}
export async function drainIncoming<T extends IncomingJob>(store:IncomingStore<T>,process:(job:T)=>Promise<void>,
  options:{now?:()=>number;active?:()=>boolean;limit?:number}={}) {
  const now=options.now??Date.now;
  let completed=0;
  while(completed<(options.limit??50) && (options.active?.()??true)) {
    const job=await store.first();
    if(!job||job.nextAttemptAt.getTime()>now()||job.receivedAt.getTime()+2000>now())break;
    await store.attempt(job);
    try {
      await process(job);
      if(!(options.active?.()??true))break;
      await store.complete(job);
      completed++;
    } catch {
      await store.retry(job,new Date(now()+Math.min(60000,5000*2**Math.min(job.attempts,4))));
      break;
    }
  }
  return completed;
}
