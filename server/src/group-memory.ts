import {db} from './db.ts';
import {config} from './config.ts';
import {digest,decrypt,encrypt} from './security.ts';
import {appendGroupTurn,groupContext,groupTurnSchema,GROUP_CONTEXT_AGE,type GroupTurn} from './group-context.ts';
// Provider-specific prefixes are absent from quoted message IDs.
export const groupMessageId=(group:string,id:string)=>digest(group+':'+id.replace(/^zapi:[^:]+:/,''));
export async function rememberGroupMessage(group:string,turn:GroupTurn){
 const key='group-context:'+digest(group);
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  const selected=await tx.setting.findUnique({where:{key:'whatsapp_group'}});
  if(selected?.value!==group)throw Error('Grupo não selecionado.');
  const record=await tx.setting.findUnique({where:{key}});
  let history:GroupTurn[]=[];
  if(record)history=groupTurnSchema.array().parse(JSON.parse(decrypt(record.value,config.MESSAGE_KEY)));
  const messages=appendGroupTurn(history,turn);
  const value=encrypt(JSON.stringify(messages),config.MESSAGE_KEY);
  await tx.setting.upsert({where:{key},create:{key,value},update:{value}});
  return groupContext(messages,messages.find(m=>m.id===turn.id)??turn);
 });
}

export async function pruneGroupMemory(){
 const rows=await db.setting.findMany({where:{key:{startsWith:'group-context:'}}});
 for(const row of rows){
  const messages=groupTurnSchema.array().parse(JSON.parse(decrypt(row.value,config.MESSAGE_KEY)));
  const recent=messages.filter(m=>m.at>=Date.now()-GROUP_CONTEXT_AGE);
  if(recent.length===messages.length)continue;
  // Conditional writes cannot erase a concurrent append.
  if(!recent.length)await db.setting.deleteMany({where:{key:row.key,value:row.value}});
  else await db.setting.updateMany({where:{key:row.key,value:row.value},data:{value:encrypt(JSON.stringify(recent),config.MESSAGE_KEY)}});
 }
}
