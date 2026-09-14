import type {Prisma} from './generated/prisma/client.ts';
import type {Journey} from '../../lib/journey.ts';
import {decrypt} from './security.ts';
import {config} from './config.ts';
import {decodeBotMessage} from './bot-message.ts';
export async function resolveJourneyReference(tx:Prisma.TransactionClient, group:string, quotedId:string, journeys:Journey[]) {
 const mappings=await tx.setting.findMany({where:{key:{startsWith:'outbox-message:'},OR:[{value:quotedId},{AND:[{value:{startsWith:'zapi:'}},{value:{endsWith:':'+quotedId}}]}]}});
 const matches=new Set<string>();
 for(const mapping of mappings){
  const id=mapping.key.slice('outbox-message:'.length);
  const message=await tx.outbox.findUnique({where:{id}});
  if(!message||message.recipient!==group)continue;
  const direct=journeys.find(j=>j.announcementId===id);
  if(direct){matches.add(direct.id);continue;}
  const ref=await tx.setting.findUnique({where:{key:'journey-message:'+id}});
  if(ref){if(journeys.some(j=>j.id===ref.value))matches.add(ref.value);continue;}
  // Compatibility with confirmations sent before explicit references were stored.
  if(message.kind!=='journey_reply')continue;
  try{
   const text=decodeBotMessage(decrypt(message.encryptedBody,config.MESSAGE_KEY)).text;
   const header=/^(?:@\d+ )?(M1\+?|M2\+?) · (\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2})\n/.exec(text);
   if(!header)continue;
   for(const j of journeys)if(j.division===header[1]&&j.date===`${header[4]}-${header[3]}-${header[2]}`&&j.time===header[5])matches.add(j.id);
  }catch{}
 }
 return matches.size===1?[...matches][0]:null;
}
