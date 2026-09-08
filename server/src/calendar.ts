import type {Express,RequestHandler} from 'express';
import {z} from 'zod';
import {db} from './db.ts';
export function installCalendar(app:Express,auth:RequestHandler,admin:RequestHandler){
 app.get('/api/admin/calendar',auth,admin,async(_req,res)=>{const row=await db.setting.findUnique({where:{key:'weekly-calendar'}});res.json(row?JSON.parse(row.value):{weekday:null,time:'18:00'});});
 app.put('/api/admin/calendar',auth,admin,async(req,res)=>{
  const value=z.object({weekday:z.number().int().min(0).max(6),time:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)}).strict().parse(req.body);
  await db.setting.upsert({where:{key:'weekly-calendar'},create:{key:'weekly-calendar',value:JSON.stringify(value)},update:{value:JSON.stringify(value)}});
  res.json(value);
 });
}
