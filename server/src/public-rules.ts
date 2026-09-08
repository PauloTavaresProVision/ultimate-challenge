import type {Express,RequestHandler} from 'express';
import {z} from 'zod';
import {db} from './db.ts';
import {defaultRules} from '../../lib/public-rules.ts';
const schema=z.object({version:z.number().int().nonnegative(),rules:z.object({title:z.string().trim().min(1).max(150),intro:z.string().trim().max(500),sections:z.array(z.object({title:z.string().trim().min(1).max(150),text:z.string().trim().min(1).max(8000)})).min(1).max(30)})});
export function installRules(app:Express,auth:RequestHandler,admin:RequestHandler){
 app.get('/api/rules',async(_req,res)=>{const row=await db.setting.findUnique({where:{key:'public-rules'}});res.set('Cache-Control','no-store').json(row?JSON.parse(row.value):{version:0,rules:defaultRules});});
 app.put('/api/admin/rules',auth,admin,async(req,res)=>{
  const input=schema.parse(req.body);
  const result=await db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('public-rules'))`;
   const row=await tx.setting.findUnique({where:{key:'public-rules'}});const version=row?JSON.parse(row.value).version:0;
   if(version!==input.version)throw Object.assign(new Error('As regras foram alteradas noutra sessão. Reabre o separador antes de editar.'),{status:409});
   const result={version:version+1,rules:input.rules};
   await tx.setting.upsert({where:{key:'public-rules'},create:{key:'public-rules',value:JSON.stringify(result)},update:{value:JSON.stringify(result)}});
   await tx.audit.create({data:{actor:'admin',action:'Atualizou o texto das regras públicas.'}});return result;
  });res.json(result);
 });
}
