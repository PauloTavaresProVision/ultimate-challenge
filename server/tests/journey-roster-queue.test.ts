import {test} from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{DATABASE_URL:'postgresql://localhost/unused',APP_ORIGIN:'https://test.invalid',SESSION_SECRET:'s'.repeat(32),MESSAGE_KEY:'a'.repeat(64),ADMIN_EMAIL:'test@example.com',ADMIN_PASSWORD:'test-password'});
const {queueJourneyRoster,rosterQuietMs}=await import('../src/journey-roster-queue.ts');
const {claimDelivery}=await import('../src/delivery-queue.ts');
const {decrypt}=await import('../src/security.ts');
const {db}=await import('../src/db.ts');
const group='test@g.us',now=new Date('2026-10-12T12:00:00Z');
function fixture(){
 const settings=new Map<string,string>(),rows:any[]=[];let pending=0;
 const tx:any={
  $executeRaw:async()=>{},
  setting:{findUnique:async({where}:any)=>settings.has(where.key)?{value:settings.get(where.key)}:null,
   create:async({data}:any)=>{settings.set(data.key,data.value);},
   upsert:async({where,create,update}:any)=>{settings.set(where.key,settings.has(where.key)?update.value:create.value);}},
  groupInbox:{count:async()=>pending},
  outbox:{count:async()=>0,
   create:async({data}:any)=>{const row={id:String(rows.length),status:'pending',attempts:0,createdAt:now,...data};rows.push(row);return row;},
   updateMany:async({where,data}:any)=>{const row=rows.find(r=>r.id===where.id&&r.status===where.status&&(where.attempts===undefined||r.attempts===where.attempts));if(!row)return {count:0};Object.assign(row,data);return {count:1};},
   findFirst:async({where}:any)=>rows.find(r=>r.status===where.status&&r.nextAttemptAt<=where.nextAttemptAt.lte&&r.expiresAt>where.expiresAt.gt&&!where.kind?.notIn.includes(r.kind))??null},
 };
 return {tx,rows,settings,setPending:(n:number)=>{pending=n;}};
}

test('20 roster updates coalesce per journey; confirmations and announcement references remain intact',async()=>{
 const f=fixture();const j={id:'first',group,date:'2026-10-20',time:'20:00'} as any;
 for(let i=1;i<=20;i++)await queueJourneyRoster(f.tx,j,'Players: '+i,new Date(now.getTime()+i*10));
 assert.equal(f.rows.length,1);assert.equal(decrypt(f.rows[0].encryptedBody,'a'.repeat(64)),'Players: 20');
 assert.equal(f.rows[0].nextAttemptAt.getTime(),now.getTime()+200+rosterQuietMs);
 assert.equal(f.settings.get('journey-message:0'),'first');
 await queueJourneyRoster(f.tx,{...j,id:'second'},'Other division',now);assert.equal(f.rows.length,2);
 f.rows[0].status='sending';f.rows[0].attempts=1;
 await queueJourneyRoster(f.tx,j,'Players: 21',now);assert.equal(f.rows.length,3);
 assert.equal(decrypt(f.rows[0].encryptedBody,'a'.repeat(64)),'Players: 20');
 assert.equal(f.settings.get('journey-message:2'),'first');
});

test('Pending group requests hold roster but never block individual confirmations; release after catch-up',async()=>{
 const f=fixture();const original=db.$transaction;
 db.$transaction=(async(fn:any)=>fn(f.tx)) as any;
 try{
  await queueJourneyRoster(f.tx,{id:'first',group,date:'2026-10-20',time:'20:00'} as any,'Latest roster',now);
  await f.tx.outbox.create({data:{kind:'journey_reply',recipient:group,nextAttemptAt:now,expiresAt:new Date('2026-10-20')}});
  f.setPending(20);
  assert.equal((await claimDelivery(new Date(now.getTime()+6000)))?.kind,'journey_reply');
  assert.equal(f.rows[0].status,'pending');
  f.setPending(0);
  assert.equal((await claimDelivery(new Date(now.getTime()+6000)))?.kind,'journey_roster');
 }finally{db.$transaction=original;await db.$disconnect();}
});


test('Manual messages are spaced by five seconds while other message types remain available',async()=>{
 const f=fixture();const original=db.$transaction;db.$transaction=(async(fn:any)=>fn(f.tx)) as any;
 try{
  for(const kind of ['group_manual','group_manual','journey_reply'])await f.tx.outbox.create({data:{kind,recipient:group,nextAttemptAt:now,expiresAt:new Date('2026-10-20')}});
  assert.equal((await claimDelivery(now))?.id,'0');
  assert.equal((await claimDelivery(new Date(now.getTime()+1000)))?.id,'2');
  assert.equal(await claimDelivery(new Date(now.getTime()+4999)),null);
  assert.equal((await claimDelivery(new Date(now.getTime()+5000)))?.id,'1');
 }finally{db.$transaction=original;await db.$disconnect();}
});
