// Read-only replay: calls the interpreter, never the registration or sending handlers.
import {db} from './src/db.ts';
import {config} from './src/config.ts';
import {decrypt,digest} from './src/security.ts';
import {interpretParticipation,PARTICIPATION_VERSION} from './src/journey-ai.ts';
import {listJourneys} from './src/journeys.ts';
import {groupContext,groupTurnSchema} from './src/group-context.ts';
import {groupMessageId} from './src/group-memory.ts';
import {resolveJourneyReference} from './src/journey-reference.ts';

const safeCode=value=>typeof value==='string'&&/^[a-zA-Z0-9_.-]{1,80}$/.test(value)?value:undefined;
try{
 const group=(await db.setting.findUnique({where:{key:'whatsapp_group'}}))?.value;
 if(!group){console.log('Não há grupo configurado.');process.exitCode=1;}
 else{
  const stored=await db.setting.findUnique({where:{key:'openai_key'}});
  if(!stored)throw Error('missing_key');
  const key=decrypt(stored.value,config.MESSAGE_KEY);
  const record=await db.setting.findUnique({where:{key:'group-context:'+digest(group)}});
  const history=record?groupTurnSchema.array().parse(JSON.parse(decrypt(record.value,config.MESSAGE_KEY))):[];
  const candidates=history.filter(m=>m.source==='member').slice(-20);
  console.log(JSON.stringify({versao:PARTICIPATION_VERSION,mensagens:candidates.length,modo:'Só análise: nenhuma inscrição, mensagem WhatsApp ou configuração será alterada.',limite:'Reavalia com o código atual e o histórico ainda retido. Estado das jornadas e dos jogadores é o atual; não reconstitui decisões antigas nem esclarecimentos já apagados.'}));
  const players=await db.player.findMany({select:{id:true,name:true,phone:true,division:true,status:true,verified:true}});
  const authors=new Map(players.map(p=>[digest(group+':'+p.phone),p]));
  const all=(await listJourneys()).filter(j=>j.group===group);
  const mappings=await db.setting.findMany({where:{key:{startsWith:'outbox-message:'}}});
  let failures=0;
  for(const m of candidates){
   const p=authors.get(m.authorId);
   const header={hora:new Date(m.at).toLocaleString('pt-PT',{timeZone:'Africa/Luanda'}),autor:p?.name??m.authorName,texto:m.text.slice(0,160)};
   if(!p||!p.verified||p.status!=='Ativo'){console.log(JSON.stringify({...header,resultado:'Não chega à IA: jogador não identificado, não aprovado ou não validado.'}));continue;}
   const journeys=all.filter(j=>new Date(j.date+'T'+j.time+':00+01:00').getTime()>m.at);
   const mapping=m.replyToId?mappings.find(r=>groupMessageId(group,r.value)===m.replyToId):null;
   const rawId=mapping?.value.replace(/^zapi:[^:]+:/,'');
   const quotedJourney=rawId?await resolveJourneyReference(db,group,rawId,journeys):null;
   const trace=[],requests=[];
   const probe=async(url,options)=>{
    const start=Date.now();
    const request={fase:JSON.parse(String(options.body)).text?.format?.name};requests.push(request);
    try{
     const response=await fetch(url,options);
     request.http=response.status;request.ms=Date.now()-start;
     const body=await response.clone().json().catch(()=>null);
     request.estado=body?.status;
     request.codigo=safeCode(body?.error?.code);
     request.tipo=safeCode(body?.error?.type);
     request.incompleta=safeCode(body?.incomplete_details?.reason);
     return response;
    }catch(e){request.ms=Date.now()-start;request.falha=['TimeoutError','AbortError'].includes(e?.name)?e.name:'network_error';throw e;}
   };
   try{
    const decision=await interpretParticipation(key,m.text,{authorName:p.name,authorId:m.authorId,groupConversation:groupContext(history,m),division:p.division,today:new Date(m.at).toISOString(),quotedJourney,history:null,journeys:journeys.map(j=>({id:j.id,division:j.division,date:j.date,time:j.time,status:j.status,enrolled:j.confirmed.includes(p.id)||j.waiting.includes(p.id)}))},journeys.map(j=>j.id),probe,v=>trace.push(v));
    const j=journeys.find(j=>j.id===decision.journeyId);
    console.log(JSON.stringify({...header,pedidosOpenAI:requests,analise:trace,decisao:decision.action,jornada:j?`${j.division} ${j.date} ${j.time}`:null,referenciaValidada:!!quotedJourney}));
   }catch{
    failures++;console.log(JSON.stringify({...header,pedidosOpenAI:requests,analise:trace,resultado:'Falha ao interpretar. Nenhuma alteração efetuada.'}));
    if(requests.some(r=>r.http===401||r.http===403||r.http===429)){
     console.log('Avaliação interrompida: a OpenAI recusou o pedido. O código HTTP e o código de erro acima identificam a causa.');break;
    }
   }
  }
  if(!candidates.length)console.log('As mensagens já não estão no histórico retido. Não é possível reproduzir essas mensagens a partir desta base de dados.');
  console.log('Fim. Nenhuma mensagem enviada ao WhatsApp e nenhuma inscrição alterada.');
  if(failures)process.exitCode=1;
 }
}catch{
 console.error('Não foi possível ler os dados necessários para a análise. Nenhuma inscrição ou mensagem foi alterada.');process.exitCode=1;
}finally{await db.$disconnect();}
