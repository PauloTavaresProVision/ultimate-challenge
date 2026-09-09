import {db} from './db.ts';
import {config} from './config.ts';
import {encrypt,digest,phoneFromJid} from './security.ts';
export function welcomeText(player:{name:string;division:string;side:string},origin:string){
 return `🎾 Bem-vindo ao Ultimate Challenge, ${player.name}!\n\nFicaste na divisão ${player.division}, a jogar à ${player.side.toLowerCase()}.\n\nOs jogos e horários serão publicados aqui no grupo quando o sorteio estiver disponível.\n\n📋 Ver regras: ${origin.replace(/\/$/,'')}/regras`;
}
export async function retryWelcome(id:string){
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`welcome-retry:${id}`}))`;
  const row=await tx.outbox.findUnique({where:{id}});
  if(!row||row.kind!=='welcome'||row.status!=='uncertain')throw new Error('Estas boas-vindas já não estão disponíveis para reenvio.');
  const group=await tx.setting.findUnique({where:{key:'whatsapp_group'}});
  if(group?.value!==row.recipient)throw new Error('O grupo associado mudou. O reenvio foi impedido.');
  const reference=await tx.setting.findFirst({where:{key:{startsWith:'welcome:'},value:id}});
  const players=await tx.player.findMany({where:{status:'Ativo',verified:true}});
  const player=players.find(p=>reference?.key==='welcome:'+digest(row.recipient+':'+p.id));
  if(!player)throw new Error('O jogador já não tem uma inscrição ativa.');
  const updated=await tx.outbox.updateMany({where:{id,status:'uncertain'},data:{status:'pending',encryptedBody:encrypt(welcomeText(player,config.APP_ORIGIN),config.MESSAGE_KEY),sentAt:null,nextAttemptAt:new Date(),expiresAt:new Date(Date.now()+86400000)}});
  if(!updated.count)throw new Error('O estado da mensagem mudou. Atualiza a lista.');
  return {ok:true,playerName:player.name};
 });
}
export async function queueWelcome(group:string,jids:string[]){
 const phones=[...new Set(jids.map(phoneFromJid).filter((p):p is string=>!!p))];
 if(!phones.length)return;
 await db.$transaction(async tx=>{
  const selected=await tx.setting.findUnique({where:{key:'whatsapp_group'}});
  if(selected?.value!==group)return;
  const players=await tx.player.findMany({where:{phone:{in:phones},status:'Ativo',verified:true}});
  for(const player of players){
   const key='welcome:'+digest(group+':'+player.id);
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
   if(await tx.setting.findUnique({where:{key}}))continue;
   const row=await tx.outbox.create({data:{recipient:group,kind:'welcome',encryptedBody:encrypt(welcomeText(player,config.APP_ORIGIN),config.MESSAGE_KEY),expiresAt:new Date(Date.now()+86400000)}});
   await tx.setting.create({data:{key,value:row.id}});
  }
 });
}
