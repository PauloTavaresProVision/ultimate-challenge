// Real model evaluation only. No WhatsApp sends, registrations or database writes.
import {db} from './src/db.ts';
import {decrypt} from './src/security.ts';
import {config} from './src/config.ts';
import {interpretParticipation} from './src/journey-ai.ts';
import {groupContext} from './src/group-context.ts';
const base=Date.parse('2026-09-21T22:00:00+01:00');
const message=(id,author,text,extra={})=>({id,authorId:author,authorName:author,source:'member',at:base+Number(id)*1000,text,...extra});
const announcement=message('0','Ultimate Challenge','M1+ · 23/09/2026 às 20:00. Inscrições abertas. Responde para participar.',{source:'platform'});
const absent=message('1','Alexandre','Boa noite Nelinho, não vou conseguir jogar entre pfvr 1 suplente');
const question=message('2','Pedro','João, vens jogar amanhã?');
const platformQuestion=message('2','Ultimate Challenge','Pretendes entrar em M1+ no dia 23 ou no dia 30?',{source:'platform',audienceIds:['João']});
const cases=[
 {label:'Ausência dirigida ao organizador',history:[announcement],current:absent,expected:'silent'},
 {label:'Organizador continua conversa sem repetir o nome',history:[announcement,absent],current:message('3','Nelinho','Amanhã faço alteração'),expected:'silent'},
 {label:'Resposta citada a pessoa',history:[question],current:message('3','João','Sim, conta comigo',{replyToId:'2'}),expected:'silent'},
 {label:'Resposta informal continua conversa entre pessoas',history:[question],current:message('3','João','Sim, conta comigo'),expected:'silent'},
 {label:'Troca proposta pela organização',history:[absent],current:message('3','Nelinho','Entra o Carlos no lugar dele'),expected:'silent'},
 {label:'Intenção de outro autor não é herdada',history:[message('1','Pedro','Quero entrar'),platformQuestion],current:message('3','Carlos','Sim'),expected:'silent'},
 {label:'Pergunta humana sobre dados continua humana',history:[message('1','Pedro','Nelinho, podes ver quem joga comigo?')],current:message('3','Pedro','E em que campo?'),expected:'silent'},
 {label:'Adesão informal ao anúncio',history:[announcement],current:message('3','João','Estou in',{replyToId:'0'}),expected:'join',journeyId:'first'},
 {label:'Esclarecimento da plataforma ao mesmo autor',history:[message('1','João','Quero entrar'),platformQuestion],current:message('3','João','A de 23',{replyToId:'2'}),expected:'join',journeyId:'first'},
 {label:'Pedido claro mas ainda ambíguo',history:[announcement],current:message('3','João','Plataforma, quero alterar a minha inscrição'),expected:'clarify'},
 {label:'Consulta explícita após conversa social',history:[absent,message('2','Nelinho','Amanhã faço alteração')],current:message('3','João','Assistente, com quem jogo?'),expected:'none'},
 {label:'Desistência própria dirigida à plataforma',history:[announcement],current:message('3','João','Plataforma, tira-me dos jogos de dia 23, não consigo ir'),expected:'leave',journeyId:'first'},
];
try{
 const stored=await db.setting.findUnique({where:{key:'openai_key'}});
 if(!stored)throw Error();
 const key=decrypt(stored.value,config.MESSAGE_KEY);
 let failed=0;
 for(const c of cases){
  const decision=await interpretParticipation(key,c.current.text,{authorName:c.current.authorName,authorId:c.current.authorId,division:'M1+',today:new Date(base).toISOString(),groupConversation:groupContext(c.history,c.current),journeys:[{id:'first',date:'2026-09-23',time:'20:00',division:'M1+',status:'open',enrolled:false},{id:'second',date:'2026-09-30',time:'20:00',division:'M1+',status:'open',enrolled:false}]},['first','second']);
  const ok=decision.action===c.expected&&(!c.journeyId||decision.journeyId===c.journeyId);
  if(!ok)failed++;
  console.log(`${ok?'OK':'FALHOU'} | ${c.label} | esperado: ${c.expected}${c.journeyId?'/'+c.journeyId:''} | obtido: ${decision.action}/${decision.journeyId??'-'}`);
 }
 console.log(`${cases.length-failed}/${cases.length} conversas corretas. Nenhuma mensagem enviada e nenhuma inscrição alterada.`);
 if(failed)process.exitCode=1;
}catch{console.error('Não foi possível concluir a avaliação com a OpenAI. Nenhuma mensagem enviada e nenhuma inscrição alterada.');process.exitCode=1;}
finally{await db.$disconnect();}
