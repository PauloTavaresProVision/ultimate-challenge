import type {Express,RequestHandler} from 'express';
import {z} from 'zod';
import {db} from './db.ts';
import {changeRoundCourts} from '../../lib/round-courts.ts';
import {luandaToday} from '../../lib/competition-cycle.ts';
import type {Game} from '../../lib/tournament.ts';
export function installRoundCourts(app:Express,auth:RequestHandler,admin:RequestHandler){
 app.post('/api/admin/round-courts',auth,admin,async(req,res)=>{
  const input=z.object({round:z.number().int().positive(),date:z.iso.date(),division:z.enum(['M1+','M1','M2+','M2']),changes:z.array(z.object({id:z.string(),from:z.string(),to:z.string()})).min(1).max(500)}).parse(req.body);
  await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM "Revision" WHERE id = 1 FOR UPDATE`;
   const all=(await tx.game.findMany({where:{date:input.date}})).map(({courtId,...g})=>({...g,court:courtId})) as Game[];
   const own=all.filter(g=>g.round===input.round&&g.division===input.division);
   const courts=await tx.court.findMany();
   let updated:Game[];
   try{updated=changeRoundCourts(own,all.filter(g=>!own.some(o=>o.id===g.id)),courts,input.changes,luandaToday());}
   catch(e){throw Object.assign(e as Error,{status:409});}
   const changed=updated.filter(g=>own.find(o=>o.id===g.id)!.court!==g.court);
   if(!changed.length)return;
   for(const g of changed)await tx.game.update({where:{id:g.id},data:{courtId:g.court}});
   await tx.audit.create({data:{actor:res.locals.session.adminId,action:`Campos alterados em ${input.division}, ${input.date}, ronda ${input.round}: ${[...new Set(changed.map(g=>`${courts.find(c=>c.id===own.find(o=>o.id===g.id)!.court)?.name} → ${courts.find(c=>c.id===g.court)?.name}`))].join('; ')}. Duplas e horários mantidos.`}});
   await tx.revision.update({where:{id:1},data:{value:{increment:1}}});
  });
  res.json({ok:true});
 });
}
