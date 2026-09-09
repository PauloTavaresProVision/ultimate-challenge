import {db} from './db.ts';
export async function deliveryStatus(id:string,stored:string){
  if(!['sent','uncertain','sending'].includes(stored))return stored;
  const message=await db.setting.findUnique({where:{key:'outbox-message:'+id}});if(!message)return stored;
  const receipt=await db.setting.findUnique({where:{key:'wa-receipt:'+message.value}});const code=receipt?Number(receipt.value):null;
  if(code===0)return 'failed';if(code!==null&&code>=4)return 'read';if(code===3)return 'delivered';if(code===2)return 'accepted';
  return message.value.startsWith('zapi:')?'provider_queued':stored;
}
