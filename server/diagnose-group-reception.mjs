// Read-only: no AI calls, registrations, resends or changes to settings.
import {db} from './src/db.ts';
import {config} from './src/config.ts';
import {decrypt,digest} from './src/security.ts';
import {PARTICIPATION_VERSION} from './src/journey-ai.ts';
import {listJourneys} from './src/journeys.ts';
import {groupMessageId} from './src/group-memory.ts';
try{
 const settings=await db.setting.findMany({where:{key:{in:['whatsapp_group','bot-enabled','whatsapp-automatic-paused','whatsapp_engine','openai_key']}}});
 const value=key=>settings.find(s=>s.key===key)?.value;
 const group=value('whatsapp_group');
 if(!group)throw Error('Grupo não configurado.');
 const record=await db.setting.findUnique({where:{key:'group-context:'+digest(group)}});
 const history=record?JSON.parse(decrypt(record.value,config.MESSAGE_KEY)):[];
 const players=await db.player.findMany({select:{id:true,name:true,phone:true,status:true,verified:true,division:true}});
 const authors=new Map(players.map(p=>[digest(group+':'+p.phone),p]));
 const journeys=(await listJourneys()).filter(j=>j.group===group&&new Date(j.date+'T'+j.time+':00+01:00')>new Date());
 const mappings=await db.setting.findMany({where:{key:{startsWith:'outbox-message:'}}});
 const references=new Map((await db.setting.findMany({where:{key:{startsWith:'journey-message:'}}})).map(r=>[r.key.slice('journey-message:'.length),r.value]));
 const messages=history.filter(m=>m.source==='member').slice(-20).map(m=>{
  const p=authors.get(m.authorId);
  const mapping=m.replyToId?mappings.find(r=>groupMessageId(group,r.value)===m.replyToId):null;
  const outboxId=mapping?.key.slice('outbox-message:'.length);
  const journeyId=outboxId?(references.get(outboxId)??journeys.find(j=>j.announcementId===outboxId)?.id):null;
  const target=journeys.find(j=>j.id===journeyId);
  const prior=history.find(t=>t.id===m.replyToId);
  return {hora:new Date(m.at).toLocaleString('pt-PT',{timeZone:'Africa/Luanda'}),autor:p?.name??m.authorName,texto:m.text.slice(0,160),jogadorIdentificado:!!p,aprovado:p?.status==='Ativo',numeroValidado:p?.verified??false,nivel:p?.division??null,respondeA:m.replyToId?{origemNoHistorico:prior?.source??'fora_do_historico',referenciaEncontrada:!!journeyId,jornada:target?`${target.division} ${target.date} ${target.time} (${target.status})`:null}:null};
 });
 console.log(JSON.stringify({versao:PARTICIPATION_VERSION,iaAtiva:value('bot-enabled')!=='false',enviosPausados:value('whatsapp-automatic-paused')==='true',chaveOpenAIConfigurada:!!value('openai_key'),metodo:value('whatsapp_engine'),jornadas:journeys.map(j=>({nivel:j.division,data:j.date,hora:j.time,estado:j.status,confirmados:j.confirmed.length,espera:j.waiting.length})),mensagensRecentes:messages,nota:'Histórico limitado às últimas 40 mensagens e 12 horas. Ausência de uma mensagem aqui não prova que o webhook não chegou.'},null,2));
}catch{console.error('Não foi possível concluir o diagnóstico. Nenhum dado foi alterado.');process.exitCode=1;}
finally{await db.$disconnect();}
