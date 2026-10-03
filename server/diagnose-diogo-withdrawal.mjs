import {db} from './src/db.ts';
import {config} from './src/config.ts';
import {decrypt,phoneFromJid} from './src/security.ts';
import {listJourneys} from './src/journeys.ts';
const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
try{
 const players=await db.player.findMany({where:{name:{contains:'Diogo',mode:'insensitive'}}});
 const matches=players.filter(p=>normalize(p.name)==='diogo vieira silva');
 if(matches.length!==1)throw Error('Não foi possível identificar Diogo Vieira Silva sem dúvidas.');
 const p=matches[0];
 const group=(await db.setting.findUnique({where:{key:'whatsapp_group'}}))?.value;
 const rows=group?await db.groupInbox.findMany({where:{group,receivedAt:{gte:new Date(Date.now()-2*86400000)}},orderBy:[{messageAt:'desc'},{sequence:'desc'}]}):[];
 const events=[];
 for(const row of rows){
   const m=JSON.parse(decrypt(row.encryptedPayload,config.MESSAGE_KEY));
   let phone=phoneFromJid(m.key.participantAlt)??phoneFromJid(m.key.participant);
   if(!phone&&row.encryptedContext){const c=JSON.parse(decrypt(row.encryptedContext,config.MESSAGE_KEY));if(normalize(c.currentMessage.authorName)===normalize(p.name))phone=p.phone;}
   if(phone!==p.phone)continue;
   events.push({id:row.id,hora:row.messageAt,texto:m.message.extendedTextMessage.text,estado:row.status,tentativas:row.attempts,
     decisao:row.encryptedDecision?JSON.parse(decrypt(row.encryptedDecision,config.MESSAGE_KEY)):null,erro:row.lastError});
   if(events.length>=10)break;
 }
 console.log(JSON.stringify({jogador:p.name,eventos:events,inscricoes:(await listJourneys()).filter(j=>j.group===group&&(j.confirmed.includes(p.id)||j.waiting.includes(p.id))).map(j=>({nivel:j.division,data:j.date,hora:j.time,estado:j.status,inscricao:j.confirmed.includes(p.id)?'confirmado':'em_espera'})),nota:'Consulta apenas. Nenhuma inscrição alterada e nenhuma mensagem enviada. Ausência de evento não prova que não escreveu; pode ser anterior à instalação da fila.'},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}finally{await db.$disconnect();}
