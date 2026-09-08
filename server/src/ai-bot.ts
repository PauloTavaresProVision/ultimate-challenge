import {converse,type Turn} from './tournament-assistant.ts';
import {queryTournament} from './tournament-queries.ts';
import type {Express,RequestHandler} from 'express';
import {z} from 'zod';
import {db} from './db.ts';
import {config} from './config.ts';
import {decrypt,encrypt,digest} from './security.ts';
import {todayLuanda} from './substitutions.ts';
import {mentionedReply} from './bot-message.ts';
export async function botEnabled(){return (await db.setting.findUnique({where:{key:'bot-enabled'}}))?.value!=='false';}
async function budget(playerId:string){
 const hour=new Date().toISOString().slice(0,13),minute=new Date().toISOString().slice(0,16);
 for(const [key,limit] of [['bot-hour:'+hour,60],['bot-user:'+playerId+':'+minute,4]] as const){const row=await db.rateLimit.upsert({where:{key},create:{key,count:1,expiresAt:new Date(Date.now()+7200000)},update:{count:{increment:1}}});if(row.count>limit)throw Error('Limite de perguntas atingido. Aguarda antes de tentar novamente.');}
}
const conversations = new Map<string,Promise<unknown>>();
export async function answerQuestion(playerId:string,text:string,scope='simulator') {
 const memoryKey='bot-memory:'+digest(scope+':'+playerId);
 const previous=conversations.get(memoryKey)??Promise.resolve();
 const work=previous.catch(()=>{}).then(async()=>{
  const player=await db.player.findUnique({where:{id:playerId}});
  if(!player?.verified||player.status!=='Ativo')throw Error('Seleciona um jogador aprovado e validado.');
  const key=await db.setting.findUnique({where:{key:'openai_key'}});if(!key)throw Error('Configura primeiro a chave OpenAI.');
  await budget(playerId);
  const record=await db.setting.findUnique({where:{key:memoryKey}});
  let history:Turn[]=[];
  if(record){try{const saved=JSON.parse(decrypt(record.value,config.MESSAGE_KEY));if(saved.expiresAt>Date.now())history=saved.turns.slice(-8);}catch{}}
  const answer=await converse(decrypt(key.value,config.MESSAGE_KEY),text,history,{name:player.name,division:player.division,side:player.side,today:todayLuanda(),timezone:'Africa/Luanda',gamesUrl:config.APP_ORIGIN+'/jogos',rulesUrl:config.APP_ORIGIN+'/regras'},q=>queryTournament(playerId,q));
  if(answer){
   const turns=[...history,{role:'user',content:text},{role:'assistant',content:answer}].slice(-8);
   const value=encrypt(JSON.stringify({expiresAt:Date.now()+3600000,turns}),config.MESSAGE_KEY);
   await db.setting.upsert({where:{key:memoryKey},create:{key:memoryKey,value},update:{value}});
  }
  return answer;
 });
 conversations.set(memoryKey,work);
 try{return await work;}finally{if(conversations.get(memoryKey)===work)conversations.delete(memoryKey);}
}
export async function handleAI(group:string,phone:string,text:string,id:string){
 if(!text.trim()||text.length>1500||!await botEnabled())return;
 const selected=await db.setting.findUnique({where:{key:'whatsapp_group'}});if(selected?.value!==group)return;
 const player=await db.player.findUnique({where:{phone}});if(!player||player.status!=='Ativo'||!player.verified)return;
 const key='bot-event:'+digest(group+':'+id);
 try{await db.setting.create({data:{key,value:'processing'}});}catch(e){if((e as {code?:string}).code==='P2002')return;throw e;}
 try{
 const answer=await answerQuestion(player.id,text,group);
 await db.$transaction(async tx=>{
  if(answer && (await tx.setting.findUnique({where:{key:'bot-enabled'}}))?.value!=='false' && (await tx.setting.findUnique({where:{key:'whatsapp_group'}}))?.value===group)await tx.outbox.create({data:{recipient:group,kind:'ai',encryptedBody:encrypt(JSON.stringify({format:"mentioned-reply-v1",...mentionedReply(answer,player.phone)}),config.MESSAGE_KEY),expiresAt:new Date(Date.now()+300000)}});
  await tx.setting.update({where:{key},data:{value:answer?'answered':'silent'}});
  if(answer)await tx.audit.create({data:{actor:'bot',action:`IA preparou uma resposta para ${player.name}: ${answer.slice(0,1500)}`}});
 });
 }catch(e){await db.setting.update({where:{key},data:{value:'error'}});await db.setting.upsert({where:{key:'bot-error'},create:{key:'bot-error',value:JSON.stringify({at:new Date().toISOString(),message:'Não foi possível responder. Testa a IA no simulador para verificar a ligação e a quota.'})},update:{value:JSON.stringify({at:new Date().toISOString(),message:'Não foi possível responder. Testa a IA no simulador para verificar a ligação e a quota.'})}});}
}
export function installAI(app:Express,auth:RequestHandler,admin:RequestHandler){
 app.get('/api/admin/bot',auth,admin,async(_req,res)=>res.json({enabled:await botEnabled(),players:await db.player.findMany({where:{status:'Ativo',verified:true},select:{id:true,name:true}}),history:await db.audit.findMany({where:{actor:'bot'},orderBy:{createdAt:'desc'},take:20}),error:JSON.parse((await db.setting.findUnique({where:{key:'bot-error'}}))?.value??'null')}));
 app.put('/api/admin/bot',auth,admin,async(req,res)=>{const {enabled}=z.object({enabled:z.boolean()}).parse(req.body);await db.setting.upsert({where:{key:'bot-enabled'},create:{key:'bot-enabled',value:String(enabled)},update:{value:String(enabled)}});res.json({enabled});});
 app.post('/api/admin/bot/simulate',auth,admin,async(req,res)=>{const {playerId,text}=z.object({playerId:z.string(),text:z.string().trim().min(1).max(1500)}).parse(req.body);try{res.json({answer:await answerQuestion(playerId,text)});}catch(e){res.status(400).json({error:(e as Error).message.startsWith('Não foi')||(e as Error).message.startsWith('A OpenAI')||(e as Error).message.startsWith('A chave')||(e as Error).message.startsWith('Limite')||(e as Error).message.startsWith('Seleciona')||(e as Error).message.startsWith('Configura')?(e as Error).message:'Não foi possível testar a IA. Verifica a chave e a configuração.'});}});
}
