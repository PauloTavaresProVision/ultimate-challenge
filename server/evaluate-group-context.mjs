// Real model evaluation only. No WhatsApp sends, registrations or database writes.
import {db} from './src/db.ts';
import {decrypt} from './src/security.ts';
import {config} from './src/config.ts';
import {interpretParticipation,PARTICIPATION_VERSION} from './src/journey-ai.ts';
import {groupContext} from './src/group-context.ts';
const base=Date.parse('2026-09-21T22:00:00+01:00');
const message=(id,author,text,extra={})=>({id,authorId:author,authorName:author,source:'member',at:base+Number(id)*1000,text,...extra});
const announcement=message('0','Ultimate Challenge','M1+ · 23/09/2026 às 20:00. Inscrições abertas. Responde para participar.',{source:'platform'});
const absent=message('1','Alexandre','Boa noite Nelinho, não vou conseguir jogar entre pfvr 1 suplente');
const question=message('2','Pedro','João, vens jogar amanhã?');
const platformQuestion=message('2','Ultimate Challenge','Pretendes entrar em M1+ no dia 23 ou no dia 30?',{source:'platform',audienceIds:['João']});
const cases=[
 {label:'In responde a lista validada mas eco marcado humano',history:[{...announcement,source:'connected_account'}],current:message('3','João','In',{replyToId:'0'}),expected:'join',journeyId:'first',verifiedQuote:'first'},
 {label:'In responde a anúncio validado fora do histórico',history:[],current:message('3','João','In',{replyToId:'0'}),expected:'join',journeyId:'first',verifiedQuote:'first'},
 {label:'In sem histórico com uma única jornada aberta',history:[],current:message('3','João','In'),expected:'join',journeyId:'first',single:true},
 {label:'Estou dentro sem histórico com uma única jornada aberta',history:[],current:message('3','João','Estou dentro'),expected:'join',journeyId:'first',single:true},
 {label:'In sem citar anúncio',history:[announcement],current:message('3','João','In'),expected:'join',journeyId:'first'},
 {label:'Estou dentro sem citar anúncio',history:[announcement],current:message('3','João','Estou dentro'),expected:'join',journeyId:'first'},
 {label:'In sem anúncio no histórico e duas datas',history:[],current:message('3','João','In'),expected:'join'},
 {label:'Estou dentro após conversa de outros',history:[absent,message('2','Nelinho','Amanhã faço alteração')],current:message('3','João','Estou dentro'),expected:'join'},
 {label:'Adesão após confirmação de outro jogador',history:[announcement,message('2','Ultimate Challenge','Pedro, estás confirmado!',{source:'platform',audienceIds:['Pedro']})],current:message('3','João','In'),expected:'join',journeyId:'first'},
 {label:'Adesão informal sem vocabulário fixo',history:[announcement],current:message('3','João','Guardem-me um lugar, também vou jogar!'),expected:'join',journeyId:'first'},
 {label:'Estou dentro dirigido a pessoa',history:[question],current:message('3','João','Estou dentro',{replyToId:'2'}),expected:'silent'},
 {label:'Adesão a jantar entre pessoas',history:[message('1','Pedro','João, vens jantar connosco?')],current:message('3','João','Estou dentro'),expected:'silent'},
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
 {label:'Confirmação com outras palavras dirigida a pessoa',history:[message('1','Rui','Miguel, conto contigo no treino?')],current:message('3','Miguel','Claro, lá estarei',{replyToId:'1'}),expected:'silent'},
 {label:'Outra pessoa responde ao esclarecimento alheio',history:[platformQuestion],current:message('3','Miguel','A primeira opção',{replyToId:'2'}),expected:'silent'},
 {label:'Nova adesão não herda o pedido anterior',history:[platformQuestion],current:message('3','Miguel','Quero inscrever-me no dia 23'),expected:'join',journeyId:'first'},
 {label:'Consulta explícita cita uma mensagem humana',history:[question],current:message('3','João','Assistente, confirma o horário dos meus jogos',{replyToId:'2'}),expected:'none'},
 {label:'Pergunta sobre campos não é alteração de inscrição',history:[absent],current:message('3','João','Plataforma, em que campo vou jogar?'),expected:'none'},
 {label:'Pergunta sobre dupla sem jogos no contexto',history:[],current:message('3','João','Com quem estou a jogar?'),expected:'none'},
 {label:'Desistência própria dirigida à plataforma',history:[announcement],current:message('3','João','Plataforma, tira-me dos jogos de dia 23, não consigo ir'),expected:'leave',journeyId:'first'},
];
try{
 const stored=await db.setting.findUnique({where:{key:'openai_key'}});
 if(!stored)throw Error();
 const key=decrypt(stored.value,config.MESSAGE_KEY);
 console.log('Avaliação:',PARTICIPATION_VERSION);
 let failed=0;
 for(const c of cases){
  const trace=[];
  const decision=await interpretParticipation(key,c.current.text,{quotedJourney:c.verifiedQuote??null,authorName:c.current.authorName,authorId:c.current.authorId,division:'M1+',today:new Date(base).toISOString(),groupConversation:groupContext(c.history,c.current),journeys:[{id:'first',date:'2026-09-23',time:'20:00',division:'M1+',status:'open',enrolled:false},{id:'second',date:'2026-09-30',time:'20:00',division:'M1+',status:'open',enrolled:false}].slice(0,c.single?1:2)},c.single?['first']:['first','second'],fetch,value=>trace.push(value));
  const ok=decision.action===c.expected&&(!c.journeyId||decision.journeyId===c.journeyId);
  if(!ok){failed++;console.log('DIAGNÓSTICO:',JSON.stringify(trace));}
  console.log(`${ok?'OK':'FALHOU'} | ${c.label} | esperado: ${c.expected}${c.journeyId?'/'+c.journeyId:''} | obtido: ${decision.action}/${decision.journeyId??'-'}`);
 }
 console.log(`${cases.length-failed}/${cases.length} conversas corretas. Nenhuma mensagem enviada e nenhuma inscrição alterada.`);
 if(failed)process.exitCode=1;
}catch{console.error('Não foi possível concluir a avaliação com a OpenAI. Nenhuma mensagem enviada e nenhuma inscrição alterada.');process.exitCode=1;}
finally{await db.$disconnect();}
