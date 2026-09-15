import type {Journey} from '../../lib/journey.ts';
export function activeWelcomeJourneys(journeys:Journey[],group:string,division:string,now=Date.now()){
 return journeys.filter(j=>j.group===group&&j.division===division&&j.status==='open'&&Date.parse(j.date+'T'+j.time+':00+01:00')>now).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
}
export function welcomeText(player:{name:string;division:string;side:string},origin:string,journeys:Journey[]=[]){
 const slots=journeys.map(j=>{
  const free=Math.max(0,j.capacity-j.confirmed.length);
  return `📅 *${j.date.split('-').reverse().join('/')} às ${j.time}*\n📍 Premier Padel Club\n👥 *${free?`${free} ${free===1?'vaga livre':'vagas livres'}`:'Vagas preenchidas · lista de espera aberta'}*`;
 }).join('\n\n');
 const participation=journeys.length?`*Inscrições abertas para a tua divisão*\n\n${slots}\n\n*Como participar?*\nResponde aqui com «Estou in», «Quero entrar» ou confirma a data em que queres jogar. Recebes a confirmação da tua vaga; se estiver cheio, entras na lista de espera.\n\nSe houver várias jornadas abertas, indica a data em que queres jogar. Se depois não puderes ir, avisa aqui para libertar a vaga.`:'Neste momento não há inscrições abertas para a tua divisão. Avisamos aqui no grupo quando abrirem. Para participar, basta responder ao anúncio a confirmar a tua participação.';
 return `🎾 *Bem-vindo ao Ultimate Challenge, ${player.name}!*\n\nFicaste na divisão *${player.division}*, a jogar à *${player.side.toLowerCase()}*.\n\n${participation}\n\n📣 Os jogos e os campos serão anunciados após o sorteio.\n\n📋 *Regras:* ${origin.replace(/\/$/,'')}/regras`;
}
