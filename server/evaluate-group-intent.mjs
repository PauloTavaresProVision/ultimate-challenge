// Read-only evaluation using the configured OpenAI key. No WhatsApp messages or registrations.
import {db} from './src/db.ts';
import {decrypt} from './src/security.ts';
import {config} from './src/config.ts';
import {interpretParticipation} from './src/journey-ai.ts';
const cases = [
  ['Pedro canhão queres sair ?', 'silent'],
  ['Sai do jogo e entra o Carlos Pereira para o lugar dele', 'silent'],
  ['João, amanhã vens jogar?', 'silent'],
  ['A Ana não vai, fica a Maria no lugar dela', 'silent'],
  ['Estão abertas as inscrições. Respondam quero entrar para participar.', 'silent'],
  ['Com quem joga o Pedro?', 'none'],
  ['Quantas vagas há?', 'none'],
  ['Estou in', 'join'],
  ['23/09 confirmado', 'join'],
  ['Afinal não consigo ir, tira o meu nome', 'leave'],
];
try {
  const stored=await db.setting.findUnique({where:{key:'openai_key'}});
  if(!stored)throw Error('Chave OpenAI não configurada.');
  const key=decrypt(stored.value,config.MESSAGE_KEY);
  let failed=0;
  for(const [message,expected] of cases){
    const result=await interpretParticipation(key,message,{
      authorName:'Nelinho',division:'M1+',today:'2026-09-21T12:00:00+01:00',
      history:{text:'quero entrar',action:'join'},
      journeys:[{id:'evaluation',division:'M1+',date:'2026-09-23',time:'20:00',status:'open',enrolled:false}],
    },['evaluation']);
    const ok=result.action===expected;
    if(!ok)failed++;
    console.log(`${ok?'OK':'FALHOU'} | ${message} | esperado: ${expected} | obtido: ${result.action}`);
  }
  console.log(`${cases.length-failed}/${cases.length} casos corretos. Nenhuma mensagem enviada ao WhatsApp.`);
  if(failed)process.exitCode=1;
}catch{console.error('Não foi possível concluir a avaliação da IA. Nenhuma mensagem enviada ao WhatsApp.');process.exitCode=1;}
finally{await db.$disconnect();}
