import type {Prisma} from './generated/prisma/client.ts';
import {randomInt} from 'node:crypto';
import {codeDigest,encrypt} from './security.ts';
import {config} from './config.ts';
export async function queueCode(tx:Prisma.TransactionClient,playerId:string,phone:string) {
  const code=String(randomInt(100000,1000000));
  const expiresAt=new Date(Date.now()+600000);
  await tx.verificationCode.updateMany({where:{playerId,consumedAt:null},data:{consumedAt:new Date()}});
  await tx.verificationCode.create({data:{playerId,digest:codeDigest(playerId,code,config.SESSION_SECRET),expiresAt}});
  await tx.outbox.create({data:{recipient:`${phone.slice(1)}@s.whatsapp.net`,encryptedBody:encrypt(`Escada: o teu código é ${code}. Expira em 10 minutos. Não o partilhes.`,config.MESSAGE_KEY),kind:'verification',expiresAt}});
}
