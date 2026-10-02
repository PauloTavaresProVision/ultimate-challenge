import {db} from './src/db.ts';
try {
  const group=(await db.setting.findUnique({where:{key:'whatsapp_group'}}))?.value;
  if(!group)throw Error('Grupo não configurado.');
  const pending=await db.groupInbox.findMany({where:{group,status:'pending'},orderBy:[{messageAt:'asc'},{sequence:'asc'}],take:30,
    select:{id:true,messageAt:true,receivedAt:true,attempts:true,nextAttemptAt:true,lastError:true}});
  console.log(JSON.stringify({now:new Date(),pendingTotal:await db.groupInbox.count({where:{group,status:'pending'}}),
    completed:await db.groupInbox.count({where:{group,status:'done'}}),pending},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}finally{await db.$disconnect();}
