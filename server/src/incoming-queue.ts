// The caller holds a database lock for the entire drain, including retries.
// Never select only "due" jobs: that would let a later request overtake a failure.
export type IncomingJob = {id:string;attempts:number;nextAttemptAt:Date;receivedAt:Date};
export interface IncomingStore<T extends IncomingJob> {
  first():Promise<T|null>;
  attempt(job:T):Promise<void>;
  complete(job:T):Promise<void>;
  retry(job:T,at:Date):Promise<void>;
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
