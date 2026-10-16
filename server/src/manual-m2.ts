import type {Express,RequestHandler} from 'express';
import type {Prisma} from './generated/prisma/client.ts';
import {z} from 'zod';
import {db} from './db.ts';
import {exceptionalM2Cycle} from './competition-rules.ts';
import {rankings,type Player,type Game} from '../../lib/tournament.ts';
const key='competition:exception:m2-20-2026-10-14';
const fail=(message:string):never=>{throw Object.assign(Error(message),{status:409});};
type Direction='down'|'up';
async function preview(tx:Prisma.TransactionClient,direction:Direction){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Luanda'}).format(new Date());
 const games=(await tx.game.findMany()).map(g=>({...g,court:g.courtId})) as Game[];
 const first=games.filter(g=>g.published).sort((a,b)=>a.date.localeCompare(b.date))[0];
 if(!first)fail('Ainda não há jogos publicados.');
 const anchor=JSON.parse((await tx.setting.findUnique({where:{key:'competition:anchor'}}))?.value??JSON.stringify(first!.date));
 const exception=JSON.parse((await tx.setting.findUnique({where:{key}}))?.value??JSON.stringify({date:exceptionalM2Cycle(anchor),count:20,status:'pending'}));
 const downApplied=!!exception.downApplied||exception.status==='applied-manual';
 const upApplied=!!exception.upApplied;
 if((direction==='down'?downApplied:upApplied)||!['pending','applied-manual'].includes(exception.status))fail('Esta operação já foi processada. Não pode ser repetida.');
 const completedCycle=await tx.setting.findUnique({where:{key:'competition:move:'+exception.date}});
 if(completedCycle&&!(direction==='up'&&downApplied&&!upApplied))fail('O ciclo desta exceção já foi processado.');
 const from=direction==='up'?'M2':'M2+',to=direction==='up'?'M2+':'M2';
 const alreadyMoved=new Set<string>((exception.changes??[]).map((p:{id:string})=>p.id));
 const month=exception.date.slice(0,7);
 if(today.slice(0,7)!==month)fail('Esta troca manual pertence ao ciclo de '+month+'.');
 const blocked=games.some(g=>g.published&&g.division===from&&g.date<=today&&!g.winner)?`Preenche os resultados ${from} em falta antes de confirmar a troca.`:null;
 const players=(await tx.player.findMany()).map(p=>({...p,birth:p.birth.toISOString().slice(0,10)})) as Player[];
 const candidates=rankings(players,games.filter(g=>g.published&&g.date<=today),month).filter(p=>p.verified&&p.division===from).map((p,i)=>({id:p.id,name:p.name,position:i+1,points:p.points,from,to,blocked:games.some(g=>!g.winner&&g.date>=today&&[...g.a,...g.b].includes(p.id))}));
 const eligible=candidates.filter(p=>!alreadyMoved.has(p.id));
 if(eligible.length<20)fail(`São necessários pelo menos 20 jogadores elegíveis no ${from}, sem repetir quem já mudou neste ciclo.`);
 const changes=direction==='up'?eligible.slice(0,20):eligible.slice(-20);
 const revision=(await tx.revision.findUnique({where:{id:1}}))!.value;
 return {exception,month,changes,candidates:eligible,blocked,revision,downApplied,upApplied};
}
export function installManualM2(app:Express,auth:RequestHandler,admin:RequestHandler){
 app.get('/api/admin/competition/manual-m2',auth,admin,async(req,res)=>{const direction=z.enum(['down','up']).parse(req.query?.direction??'down');res.json(await db.$transaction(tx=>preview(tx,direction)));});
 app.post('/api/admin/competition/manual-m2',auth,admin,async(req,res)=>{
  const input=z.object({direction:z.enum(['down','up']).default('down'),revision:z.number().int(),ids:z.array(z.string()).length(20)}).parse(req.body);
  const result=await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "Revision" WHERE id = 1 FOR UPDATE`;
   const plan=await preview(tx,input.direction);
   if(plan.revision!==input.revision)fail('Os dados mudaram. Revê novamente a lista antes de confirmar.');
   if(plan.blocked)fail(plan.blocked);
   if(new Set(input.ids).size!==20)fail('Seleciona exatamente 20 jogadores diferentes.');
   const chosen=plan.candidates.filter(p=>input.ids.includes(p.id));
   if(chosen.length!==20)fail('Seleciona apenas jogadores ativos e validados deste nível que ainda não mudaram neste ciclo.');
   if(chosen.some(p=>p.blocked))fail('Há jogadores selecionados em jogos por realizar. Revê esses sorteios antes da troca.');
   const changes=chosen.map(({blocked,...p})=>p);
   for(const change of changes)await tx.player.update({where:{id:change.id},data:{division:change.to}});
   const downApplied=plan.downApplied||input.direction==='down',upApplied=plan.upApplied||input.direction==='up';
   const value=JSON.stringify({...plan.exception,status:downApplied&&upApplied?'applied-manual':'pending',downApplied,upApplied,changes:[...(plan.exception.changes??[]),...changes],appliedAt:new Date().toISOString()});
   await tx.setting.upsert({where:{key},create:{key,value},update:{value}});
   const historyKey='competition:move:manual-m2-'+(input.direction==='up'?'up-':'')+plan.exception.date;
   await tx.setting.create({data:{key:historyKey,value:JSON.stringify({date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Luanda'}).format(new Date()),changes,manual:true})}});
   await tx.audit.create({data:{actor:res.locals.session.adminId,action:(input.direction==='up'?'Subida manual de 20 jogadores M2 para M2+: ':'Descida manual de 20 jogadores M2+ para M2: ')+changes.map(p=>p.name).join('; ')+'. Pontos mantidos.'}});
   await tx.revision.update({where:{id:1},data:{value:{increment:1}}});
   return {count:changes.length};
  });
  res.json(result);
 });
}
