import {db} from './db.ts';
import {digest} from './security.ts';
import {retryWelcome} from './welcome.ts';

// Explicit operator action: never runs automatically at startup.
try {
 const phone=process.argv[2];
 if(!/^\+[1-9]\d{7,14}$/.test(phone??''))throw new Error('Indica o número com indicativo.');
 const player=await db.player.findFirst({where:{phone,status:'Ativo',verified:true}});
 const group=await db.setting.findUnique({where:{key:'whatsapp_group'}});
 if(!player||!group)throw new Error('Jogador ativo ou grupo não encontrado.');
 const reference=await db.setting.findUnique({where:{key:'welcome:'+digest(group.value+':'+player.id)}});
 if(!reference)throw new Error('Não existem boas-vindas para este jogador.');
 const result=await retryWelcome(reference.value);
 console.log(`Boas-vindas de ${result.playerName} colocadas na fila. A entrega ainda não está confirmada.`);
}catch(error){console.error((error as Error).message);process.exitCode=1;}
finally{await db.$disconnect();}
