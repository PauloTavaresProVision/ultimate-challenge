import type {Prisma} from './generated/prisma/client.ts';
import type {Journey} from '../../lib/journey.ts';
import {encrypt} from './security.ts';
import {config} from './config.ts';

export const rosterQuietMs=5000;
export async function queueJourneyRoster(tx:Prisma.TransactionClient,j:Journey,text:string,now=new Date()){
  // Share the delivery claim lock: never replace a body that a sender already read.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('invitation-delivery'))`;
  const key='journey-roster:'+j.id;
  const pointer=await tx.setting.findUnique({where:{key}});
  const data={encryptedBody:encrypt(text,config.MESSAGE_KEY),nextAttemptAt:new Date(now.getTime()+rosterQuietMs),expiresAt:new Date(j.date+'T'+j.time+':00+01:00')};
  if(pointer){
    const changed=await tx.outbox.updateMany({where:{id:pointer.value,recipient:j.group,kind:'journey_roster',status:'pending',attempts:0},data});
    if(changed.count)return;
  }
  const row=await tx.outbox.create({data:{...data,recipient:j.group,kind:'journey_roster'}});
  await tx.setting.create({data:{key:'journey-message:'+row.id,value:j.id}});
  await tx.setting.upsert({where:{key},create:{key,value:row.id},update:{value:row.id}});
}
