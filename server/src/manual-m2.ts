import type {Express,RequestHandler} from 'express';
import type {Prisma} from './generated/prisma/client.ts';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {db} from './db.ts';
import {rankings,type Player,type Game} from '../../lib/tournament.ts';
const divisionSchema=z.enum(['M1+','M1','M2+','M2']);
const fail=(message:string):never=>{throw Object.assign(Error(message),{status:409});};
async function preview(tx:Prisma.TransactionClient,from:string){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Luanda'}).format(new Date());
 const games=(await tx.game.findMany()).map(g=>({...g,court:g.courtId})) as Game[];
 const players=(await tx.player.findMany()).map(p=>({...p,birth:p.birth.toISOString().slice(0,10)})) as Player[];
 const candidates=rankings(players,games.filter(g=>g.published),today.slice(0,7)).filter(p=>p.division===from).map((p,i)=>({id:p.id,name:p.name,position:i+1,points:p.points,scheduled:games.some(g=>!g.winner&&g.date>=today&&[...g.a,...g.b].includes(p.id))}));
 return {from,candidates,revision:(await tx.revision.findUnique({where:{id:1}}))!.value};
}
export function installManualM2(app:Express,auth:RequestHandler,admin:RequestHandler){
 app.get('/api/admin/competition/manual-divisions',auth,admin,async(req,res)=>{const from=divisionSchema.parse(req.query.from);res.json(await db.$transaction(tx=>preview(tx,from)));});
 app.post('/api/admin/competition/manual-divisions',auth,admin,async(req,res)=>{
  const input=z.object({from:divisionSchema,to:z.enum(['M1+','M1','M2+']),revision:z.number().int(),ids:z.array(z.string()).min(1).max(1000)}).parse(req.body);
  if(input.from===input.to)fail('Escolhe um nível de destino diferente.');
  const result=await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "Revision" WHERE id = 1 FOR UPDATE`;
   const plan=await preview(tx,input.from);
   if(plan.revision!==input.revision)fail('Os dados mudaram. Atualiza a lista e revê os jogadores antes de confirmar.');
   if(new Set(input.ids).size!==input.ids.length)fail('A seleção tem jogadores repetidos.');
   const chosen=plan.candidates.filter(p=>input.ids.includes(p.id));
   if(chosen.length!==input.ids.length)fail('Algum jogador já não está ativo neste nível. Atualiza a lista.');
   const changes=chosen.map(p=>({id:p.id,name:p.name,points:p.points,from:input.from,to:input.to}));
   for(const change of changes)await tx.player.update({where:{id:change.id},data:{division:change.to}});
   const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Luanda'}).format(new Date());
   await tx.setting.create({data:{key:'competition:move:manual-'+randomUUID(),value:JSON.stringify({date,changes,manual:true})}});
   await tx.audit.create({data:{actor:res.locals.session.adminId,action:`Alteração manual ${input.from} → ${input.to}: ${changes.map(p=>p.name).join('; ')}. Pontos e jogos mantidos.`}});
   await tx.revision.update({where:{id:1},data:{value:{increment:1}}});
   return {count:changes.length,to:input.to};
  });
  res.json(result);
 });
}
