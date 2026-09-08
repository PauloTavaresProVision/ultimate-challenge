import type { Prisma } from './generated/prisma/client.ts';
import type {Express,RequestHandler} from 'express';
import {z} from 'zod';
import {db} from './db.ts';
import {config} from './config.ts';
import {encrypt,digest} from './security.ts';
export type Vacancy={id:string;round:number;date:string;playerId:string;name:string;division:string;side:string;gameIds:string[];sourceId?:string;candidates:string[];status:'pending'|'approved'|'cancelled';substituteId?:string};
const fail=(text:string):never=>{throw Object.assign(new Error(text),{status:409});};
export const todayLuanda=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Luanda',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export async function vacancies(tx:Prisma.TransactionClient=db){return (await tx.setting.findMany({where:{key:{startsWith:'absence:'}}})).map(r=>JSON.parse(r.value) as Vacancy);}
async function notice(tx:Prisma.TransactionClient,text:string){const group=await tx.setting.findUnique({where:{key:'whatsapp_group'}});if(group)await tx.outbox.create({data:{recipient:group.value,kind:'substitution',encryptedBody:encrypt(text,config.MESSAGE_KEY),expiresAt:new Date(Date.now()+86400000)}});}
async function lock(tx:Prisma.TransactionClient){await tx.revision.update({where:{id:1},data:{value:{increment:1}}});}
async function mark(tx:Prisma.TransactionClient,playerId:string,round:number,sourceId?:string){
 const existing=(await vacancies(tx)).find(v=>v.playerId===playerId&&v.round===round&&v.status!=='cancelled');if(existing)return existing;
 const p=await tx.player.findUnique({where:{id:playerId}});if(!p||!p.verified||p.status!=='Ativo')fail('Jogador não elegível.');
 const games=await tx.game.findMany({where:{round,published:true,OR:[{a:{has:playerId}},{b:{has:playerId}}]}});
 if(games.length!==4||games.some(g=>g.winner||g.duration!==20||g.date!==games[0].date)||games.some(g=>g.date<todayLuanda()))fail('A ausência exige quatro jogos publicados ainda sem resultados. Contacta a organização.');
 if(await tx.setting.findUnique({where:{key:'competition:month:'+games[0].date.slice(0,7)}}))fail('O mês já está encerrado.');
 const v:Vacancy={id:crypto.randomUUID(),round,date:games[0].date,playerId,name:p!.name,division:games[0].division,side:p!.side,gameIds:games.map(g=>g.id),sourceId,candidates:[],status:'pending'};
 await tx.setting.create({data:{key:'absence:'+v.id,value:JSON.stringify(v)}});
 await tx.audit.create({data:{actor:playerId,action:`Ausência registada: ${p!.name}, ronda ${round}. Aguarda suplente.`}});
 await notice(tx,`${p!.name} não participa na ronda ${round} (${v.date}). Os quatro jogos aguardam suplente. Podes responder “posso substituir” a esta ausência; a organização tem de aprovar.`);
 return v;
}
async function eligible(tx:Prisma.TransactionClient,v:Vacancy,id:string){
 const p=await tx.player.findUnique({where:{id}});
 if(!p||!p.verified||p.status!=='Ativo'||p.side!==v.side||p.division!==v.division||id===v.playerId)fail('O suplente deve estar aprovado e ter o mesmo lado e divisão.');
 if(await tx.game.count({where:{OR:[{round:v.round},{date:v.date}],AND:[{OR:[{a:{has:id}},{b:{has:id}}]}]}}))fail('Este jogador já tem jogos nessa ronda ou nesse dia.');
 return p!;
}
export async function approveVacancy(id:string,substituteId:string){return db.$transaction(async tx=>{
 await lock(tx);const v=(await vacancies(tx)).find(v=>v.id===id);if(!v||v.status!=='pending')fail('A vaga já não está pendente.');
 const vacancy=v!;const p=await eligible(tx,vacancy,substituteId);
 const games=await tx.game.findMany({where:{id:{in:vacancy.gameIds}}});
 if(games.length!==4||games.some(g=>g.winner||!g.published||g.date!==vacancy.date||g.round!==vacancy.round||![...g.a,...g.b].includes(vacancy.playerId))||vacancy.date<todayLuanda())fail('Os jogos já não permitem esta substituição.');
 if(await tx.setting.findUnique({where:{key:'competition:month:'+vacancy.date.slice(0,7)}}))fail('O mês já está encerrado.');
 const previous=await tx.game.findMany({where:{round:vacancy.round-1}});
 for(const g of games){
  const pair=g.a.includes(vacancy.playerId)?g.a:g.b;const partner=pair.find(x=>x!==vacancy.playerId)!;
  if(previous.some(old=>[old.a,old.b].some(team=>team.includes(partner)&&team.includes(substituteId))))fail('Este suplente repetiria o parceiro da semana anterior.');
  await tx.game.update({where:{id:g.id},data:{a:g.a.map(x=>x===vacancy.playerId?substituteId:x),b:g.b.map(x=>x===vacancy.playerId?substituteId:x)}});
 }
 vacancy.status='approved';vacancy.substituteId=substituteId;await tx.setting.update({where:{key:'absence:'+id},data:{value:JSON.stringify(vacancy)}});
 await tx.audit.create({data:{actor:'admin',action:`${p.name} substitui ${vacancy.name} nos quatro jogos da ronda ${vacancy.round}.`}});
 await notice(tx,`Substituição aprovada: ${p.name} substitui ${vacancy.name} nos quatro jogos da ronda ${vacancy.round}, divisão ${vacancy.division}, lado ${vacancy.side.toLowerCase()}. Consulta os jogos atualizados: ${config.APP_ORIGIN}/jogos`);
 return {ok:true};
});}
export function installSubstitutions(app:Express,auth:RequestHandler,admin:RequestHandler){
 app.get('/api/admin/substitutions',auth,admin,async(_req,res)=>{res.json({vacancies:await vacancies(),players:await db.player.findMany({where:{status:'Ativo',verified:true},select:{id:true,name:true,side:true,division:true}}),games:await db.game.findMany({where:{published:true,winner:null,date:{gte:todayLuanda()}},select:{round:true,date:true,a:true,b:true}})});});
 app.post('/api/admin/substitutions',auth,admin,async(req,res)=>{const input=z.object({playerId:z.string(),round:z.number().int().positive()}).parse(req.body);res.json(await db.$transaction(async tx=>{await lock(tx);return mark(tx,input.playerId,input.round);}));});
 app.post('/api/admin/substitutions/:id/approve',auth,admin,async(req,res)=>{const {playerId}=z.object({playerId:z.string()}).parse(req.body);res.json(await approveVacancy(String(req.params.id),playerId));});
 app.post('/api/admin/substitutions/:id/cancel',auth,admin,async(req,res)=>{res.json(await db.$transaction(async tx=>{await lock(tx);const v=(await vacancies(tx)).find(v=>v.id===req.params.id);if(!v||v.status!=='pending')fail('Vaga indisponível.');v!.status='cancelled';await tx.setting.update({where:{key:'absence:'+v!.id},data:{value:JSON.stringify(v)}});await notice(tx,`A organização cancelou a ausência de ${v!.name} na ronda ${v!.round}.`);return {ok:true};}));});
}
export function participationIntent(text:string){
 const s=text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
 if(/jogar\s*\?$/.test(s)||/\b(se|talvez|acho|sera|ele|ela)\b/.test(s))return null;
 if(/\b(nao (?:vou poder|posso|consigo) jogar|confirmo (?:a )?falta)\b/.test(s))return 'absence';
 if(/\bnao\b/.test(s))return null;
 if(/\b(posso substituir|posso jogar no lugar|ofereco-me|eu substituo)\b/.test(s)||/^(sim|(?:sim[, ]*)?(?:eu )?posso(?: jogar)?)[.!]?$/.test(s))return 'offer';
 return null;
}
export async function handleParticipation(group:string,phone:string,text:string,messageId:string,quotedId?:string){
 const intent=participationIntent(text);if(!intent)return false;
 if(intent==='offer'&&!quotedId&&!/substituir|substituo|lugar|ofere/i.test(text))return false;
 await db.$transaction(async tx=>{
 const selected=await tx.setting.findUnique({where:{key:'whatsapp_group'}});if(selected?.value!==group)return;
 const p=await tx.player.findUnique({where:{phone}});if(!p||p.status!=='Ativo'||!p.verified)return;
 await lock(tx);
 const eventKey='participation-event:'+digest(group+':'+messageId);if(await tx.setting.findUnique({where:{key:eventKey}}))return;
 const roundMatch=text.match(/ronda\s+(\d+)/i);const round=roundMatch?Number(roundMatch[1]):null;
 if(intent==='absence'){
  const own=await tx.game.findMany({where:{published:true,OR:[{a:{has:p.id}},{b:{has:p.id}}],date:{gte:todayLuanda()}}});
  const today=todayLuanda();const day=new Date(today+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+((7-day.getUTCDay())%7));const weekEnd=day.toISOString().slice(0,10);
  const dates=[...new Set(own.filter(g=>round?g.round===round:/\bhoje\b/i.test(text)?g.date===today:/esta semana/i.test(text)?g.date<=weekEnd:false).map(g=>g.round))];
  if(dates.length!==1){await notice(tx,`${p.name}, confirma a ronda a que faltas: escreve “confirmo falta ronda N”, trocando N pelo número da ronda. Nenhum jogo foi alterado.`);}
  else {try{await mark(tx,p.id,dates[0],messageId);}catch(e){if((e as {status?:number}).status!==409)throw e;await notice(tx,`${p.name}: ${(e as Error).message}`);}}
 }else{
  let pending=(await vacancies(tx)).filter(v=>v.status==='pending'&&v.date>=todayLuanda());
  if(!pending.length)return;
  if(round)pending=pending.filter(v=>v.round===round);
  if(quotedId){const quoted=pending.filter(v=>v.sourceId===quotedId);pending=quoted;}
  if(pending.length!==1 || (!quotedId&&!/substituir|substituo|lugar|ofere/i.test(text))){await notice(tx,`${p.name}, responde diretamente à mensagem de ausência do jogador com “posso substituir”, para identificarmos a vaga. A escolha fica pendente da organização.`);}
  else{const v=pending[0];try{await eligible(tx,v,p.id);if(!v.candidates.includes(p.id)){v.candidates.push(p.id);await tx.setting.update({where:{key:'absence:'+v.id},data:{value:JSON.stringify(v)}});await notice(tx,`${p.name} ofereceu-se para substituir ${v.name} na ronda ${v.round}. Aguarda aprovação do administrador; os jogos ainda não foram alterados.`);}}catch(e){if((e as {status?:number}).status!==409)throw e;await notice(tx,`${p.name}: ${(e as Error).message}`);}}
 }
 await tx.setting.create({data:{key:eventKey,value:new Date().toISOString()}});
 },{timeout:15000});return true;
}
