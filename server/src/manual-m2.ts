import type {Express,RequestHandler} from 'express';
import type {Prisma} from './generated/prisma/client.ts';
import {z} from 'zod';
import {db} from './db.ts';
import {manualM2Plan,exceptionalM2Cycle} from './competition-rules.ts';
import type {Player,Game} from '../../lib/tournament.ts';
const key='competition:exception:m2-20-2026-10-14';
const fail=(message:string):never=>{throw Object.assign(Error(message),{status:409});};
async function preview(tx:Prisma.TransactionClient){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Luanda'}).format(new Date());
 const games=(await tx.game.findMany()).map(g=>({...g,court:g.courtId})) as Game[];
 const first=games.filter(g=>g.published).sort((a,b)=>a.date.localeCompare(b.date))[0];
 if(!first)fail('Ainda não há jogos publicados.');
 const anchor=JSON.parse((await tx.setting.findUnique({where:{key:'competition:anchor'}}))?.value??JSON.stringify(first!.date));
 const exception=JSON.parse((await tx.setting.findUnique({where:{key}}))?.value??JSON.stringify({date:exceptionalM2Cycle(anchor),count:20,status:'pending'}));
 if(exception.status!=='pending')fail('Esta exceção já foi processada. Não pode ser repetida.');
 if(await tx.setting.findUnique({where:{key:'competition:move:'+exception.date}}))fail('O ciclo desta exceção já foi processado.');
 const month=exception.date.slice(0,7);
 if(today.slice(0,7)!==month)fail('Esta descida manual pertence ao ciclo de '+month+'.');
 if(games.some(g=>g.published&&g.division==='M2+'&&g.date<=today&&!g.winner))fail('Preenche os resultados M2+ em falta antes de rever as descidas.');
 const players=(await tx.player.findMany()).map(p=>({...p,birth:p.birth.toISOString().slice(0,10)})) as Player[];
 const changes=manualM2Plan(players,games.filter(g=>g.date<=today),month);
 if(games.some(g=>!g.winner&&g.date>=today&&[...g.a,...g.b].some(id=>changes.some(p=>p.id===id))))fail('Há jogadores da lista em jogos por realizar. Revê esses sorteios antes da descida.');
 const revision=(await tx.revision.findUnique({where:{id:1}}))!.value;
 return {exception,month,changes,revision};
}
export function installManualM2(app:Express,auth:RequestHandler,admin:RequestHandler){
 app.get('/api/admin/competition/manual-m2',auth,admin,async(_req,res)=>res.json(await db.$transaction(preview)));
 app.post('/api/admin/competition/manual-m2',auth,admin,async(req,res)=>{
  const input=z.object({revision:z.number().int(),ids:z.array(z.string()).length(20)}).parse(req.body);
  const result=await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "Revision" WHERE id = 1 FOR UPDATE`;
   const plan=await preview(tx);
   if(plan.revision!==input.revision||JSON.stringify(plan.changes.map(p=>p.id))!==JSON.stringify(input.ids))fail('Os dados mudaram. Revê novamente a lista antes de confirmar.');
   for(const change of plan.changes)await tx.player.update({where:{id:change.id},data:{division:'M2'}});
   const value=JSON.stringify({...plan.exception,status:'applied-manual',changes:plan.changes,appliedAt:new Date().toISOString()});
   await tx.setting.upsert({where:{key},create:{key,value},update:{value}});
   const historyKey='competition:move:manual-m2-'+plan.exception.date;
   await tx.setting.create({data:{key:historyKey,value:JSON.stringify({date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Luanda'}).format(new Date()),changes:plan.changes,manual:true})}});
   await tx.audit.create({data:{actor:res.locals.session.adminId,action:'Descida manual dos 20 últimos M2+ para M2: '+plan.changes.map(p=>p.name).join('; ')+'. Pontos mantidos.'}});
   await tx.revision.update({where:{id:1},data:{value:{increment:1}}});
   return {count:plan.changes.length};
  });
  res.json(result);
 });
}
