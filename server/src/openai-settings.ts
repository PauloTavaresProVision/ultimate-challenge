import type {Express,RequestHandler} from 'express';
import {z} from 'zod';
import {db} from './db.ts';
import {config} from './config.ts';
import {encrypt,decrypt} from './security.ts';
import {probeOpenAI} from './openai-probe.ts';
export function installOpenAI(app:Express,auth:RequestHandler,admin:RequestHandler){
 app.get('/api/admin/openai',auth,admin,async(_req,res)=>{
  const rows=await db.setting.findMany({where:{key:{in:['openai_key','openai_test']}}});
  res.json({configured:rows.some(r=>r.key==='openai_key'),test:JSON.parse(rows.find(r=>r.key==='openai_test')?.value??'null')});
 });
 app.put('/api/admin/openai',auth,admin,async(req,res)=>{
  const {key}=z.object({key:z.string().trim().min(20).max(512).regex(/^sk-[A-Za-z0-9_-]+$/)}).parse(req.body);
  const encrypted=encrypt(key,config.MESSAGE_KEY);
  await db.$transaction(async tx=>{await tx.setting.upsert({where:{key:'openai_key'},create:{key:'openai_key',value:encrypted},update:{value:encrypted}});await tx.setting.deleteMany({where:{key:'openai_test'}});});
  res.json({configured:true,test:null});
 });
 app.delete('/api/admin/openai',auth,admin,async(_req,res)=>{await db.setting.deleteMany({where:{key:{in:['openai_key','openai_test']}}});res.json({configured:false,test:null});});
 app.post('/api/admin/openai/test',auth,admin,async(_req,res)=>{
  const row=await db.setting.findUnique({where:{key:'openai_key'}});
  if(!row)return res.status(400).json({error:'Guarda primeiro a chave OpenAI.'});
  let key:string;try{key=decrypt(row.value,config.MESSAGE_KEY);}catch{return res.status(409).json({error:'Não foi possível abrir a chave guardada. Guarda-a novamente.'});}
  const result={...await probeOpenAI(key),checkedAt:new Date().toISOString()};
  const saved=await db.$transaction(async tx=>{await tx.$queryRaw`SELECT key FROM "Setting" WHERE key = 'openai_key' FOR UPDATE`;const current=await tx.setting.findUnique({where:{key:'openai_key'}});if(current?.value!==row.value)return false;await tx.setting.upsert({where:{key:'openai_test'},create:{key:'openai_test',value:JSON.stringify(result)},update:{value:JSON.stringify(result)}});return true;});
  if(!saved)return res.status(409).json({error:'A chave foi alterada durante o teste. Testa a chave atual.'});
  res.json(result);
 });
}
