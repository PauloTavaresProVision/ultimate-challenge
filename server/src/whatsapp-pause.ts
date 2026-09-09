import {db} from './db.ts';
export const pauseKey='whatsapp-automatic-paused';
export async function automaticPaused(){
  return (await db.setting.findUnique({where:{key:pauseKey}}))?.value==='true';
}
export async function setAutomaticPaused(paused:boolean){
  await db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('invitation-delivery'))`;
    await tx.setting.upsert({where:{key:pauseKey},create:{key:pauseKey,value:String(paused)},update:{value:String(paused)}});
  });
}
export class DeliveryPaused extends Error {}
