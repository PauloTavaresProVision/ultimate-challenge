import type {Express,RequestHandler} from 'express';
import {z} from 'zod';
import {db} from './db.ts';
import {config} from './config.ts';
import {decrypt,encrypt,digest} from './security.ts';
import {rankings,type Player} from '../../lib/tournament.ts';
import {defaultRules,type PublicRules} from '../../lib/public-rules.ts';
import {todayLuanda,vacancies} from './substitutions.ts';
import {classifyQuestion} from './bot-intent.ts';
export async function botEnabled(){return (await db.setting.findUnique({where:{key:'bot-enabled'}}))?.value!=='false';}
async function budget(playerId:string){
 const hour=new Date().toISOString().slice(0,13),minute=new Date().toISOString().slice(0,16);
 for(const [key,limit] of [['bot-hour:'+hour,60],['bot-user:'+playerId+':'+minute,4]] as const){const row=await db.rateLimit.upsert({where:{key},create:{key,count:1,expiresAt:new Date(Date.now()+7200000)},update:{count:{increment:1}}});if(row.count>limit)throw Error('Limite de perguntas atingido. Aguarda antes de tentar novamente.');}
}
export async function answerQuestion(playerId:string,text:string,classifier=classifyQuestion){
 const player=await db.player.findUnique({where:{id:playerId}});if(!player||!player.verified||player.status!=='Ativo')throw Error('Seleciona um jogador aprovado e validado.');
 const key=await db.setting.findUnique({where:{key:'openai_key'}});if(!key)throw Error('Configura primeiro a chave OpenAI.');
 await budget(playerId);
 const saved=await db.setting.findUnique({where:{key:'public-rules'}});const rules:PublicRules=saved?JSON.parse(saved.value).rules:defaultRules;
 const intent=await classifier(decrypt(key.value,config.MESSAGE_KEY),text,rules.sections.map(s=>s.title));
 const today=todayLuanda(),origin=config.APP_ORIGIN.replace(/\/$/,'');
 if(intent.intent==='silent')return null;
 if(intent.intent==='clarify')return 'Podes indicar a tua pergunta sobre os jogos, pontos ou regras? Para registar resultados, usa '+origin+'/jogos. Alterações precisam da organização.';
 if(intent.intent==='help')return 'Consulta os teus jogos e regista vitória ou derrota em '+origin+'/jogos. Entra com o teu número WhatsApp e o código de validação. Inscrições e substituições dependem da organização.';
 if(intent.intent==='rules'){const section=rules.sections[intent.section];return (section?section.title+'\n'+section.text:'Consulta o regulamento do Ultimate Challenge.')+'\n\nVer regras: '+origin+'/regras';}
 if(intent.intent==='movements'){const row=await db.setting.findUnique({where:{key:'competition:status'}});const status=row?JSON.parse(row.value):null;return status?.blocked?'As movimentações estão pendentes: '+status.blocked:status?.nextMovement?'Próximas subidas e descidas previstas: '+status.nextMovement+'.':'Ainda não há data de movimentações definida. A organização precisa de publicar a primeira ronda.';}
 if(intent.intent==='games'){
  const pending=(await vacancies()).filter(v=>v.status==='pending');
  let games=await db.game.findMany({where:{published:true,date:{gte:today},OR:[{a:{has:playerId}},{b:{has:playerId}}]},include:{court:true},orderBy:[{date:'asc'},{time:'asc'}]});
  const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);const tomorrow=date.toISOString().slice(0,10);
  if(intent.when==='today'||intent.when==='tomorrow')games=games.filter(g=>g.date===(intent.when==='today'?today:tomorrow));
  else if(intent.when==='week'){const end=new Date(today+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+((7-end.getUTCDay())%7));games=games.filter(g=>g.date<=end.toISOString().slice(0,10));}
  else if(games.length)games=games.filter(g=>g.round===games[0].round);
  if(!games.length)return `${player.name}, não tens jogos publicados ${intent.when==='today'?'para hoje':intent.when==='tomorrow'?'para amanhã':intent.when==='week'?'para esta semana':'para as próximas rondas'}.`;
  const people=await db.player.findMany({where:{id:{in:[...new Set(games.flatMap(g=>[...g.a,...g.b]))]}},select:{id:true,name:true}});const name=(id:string)=>people.find(p=>p.id===id)?.name??'Jogador';
  return `${player.name}, os teus jogos:\n\n`+games.slice(0,4).map(g=>{const absent=pending.filter(v=>v.gameIds.includes(g.id));const team=g.a.includes(playerId)?g.a:g.b,other=g.a.includes(playerId)?g.b:g.a;const label=(id:string)=>absent.some(v=>v.playerId===id)?'Aguarda suplente':name(id);return `${g.date} · ${g.time} · ${g.court.name} · ${g.court.location}\nParceiro: ${team.filter(id=>id!==playerId).map(label).join(' / ')}\nAdversários: ${other.map(label).join(' / ')}${absent.length?'\nAguarda suplente aprovado.':''}${absent.some(v=>v.playerId===playerId)?' A tua ausência está registada.':''}`;}).join('\n\n')+'\n\n'+origin+'/jogos';
 }
 const people=await db.player.findMany();const games=await db.game.findMany({where:{published:true,date:{startsWith:today.slice(0,7)}}});
 const table=rankings(people.map(p=>({...p,birth:p.birth.toISOString().slice(0,10)})) as Player[],games.map(g=>({...g,court:g.courtId})) as Parameters<typeof rankings>[1],today.slice(0,7));
 const division=intent.division==='mine'?player.division:intent.division;const divisionTable=table.filter(p=>p.division===division);
 if(intent.intent==='points'){const mine=table.find(p=>p.id===playerId);return `${player.name}, tens ${mine?.points??0} pontos este mês na divisão ${player.division}. Vitórias: ${mine?.wins??0}; derrotas: ${mine?.losses??0}; bónus acumulado: ${mine?.bonus??0}. Posição: ${table.filter(p=>p.division===player.division).findIndex(p=>p.id===playerId)+1}.`;}
 return `Classificação atual · ${division} · ${today.slice(0,7)}\n`+(divisionTable.length?divisionTable.slice(0,10).map((p,i)=>`${i+1}. ${p.name} — ${p.points} pontos`).join('\n'):'Ainda não há jogadores nesta divisão.');
}
export async function handleAI(group:string,phone:string,text:string,id:string){
 if(!text.trim()||text.length>1500||!await botEnabled())return;
 const selected=await db.setting.findUnique({where:{key:'whatsapp_group'}});if(selected?.value!==group)return;
 const player=await db.player.findUnique({where:{phone}});if(!player||player.status!=='Ativo'||!player.verified)return;
 const key='bot-event:'+digest(group+':'+id);
 try{await db.setting.create({data:{key,value:'processing'}});}catch(e){if((e as {code?:string}).code==='P2002')return;throw e;}
 try{
 const answer=await answerQuestion(player.id,text);
 await db.$transaction(async tx=>{
  if(answer && (await tx.setting.findUnique({where:{key:'bot-enabled'}}))?.value!=='false' && (await tx.setting.findUnique({where:{key:'whatsapp_group'}}))?.value===group)await tx.outbox.create({data:{recipient:group,kind:'ai',encryptedBody:encrypt(answer,config.MESSAGE_KEY),expiresAt:new Date(Date.now()+300000)}});
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
