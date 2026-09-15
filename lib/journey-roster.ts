import type {Journey} from './journey.ts';
export function journeyRoster(j:Journey,players:Array<{id:string;name:string}>) {
 const names=new Map(players.map(p=>[p.id,p.name.replace(/[\r\n]+/g,' ').trim()]));
 const list=(ids:string[])=>ids.map((id,i)=>`${i+1}. ${names.get(id) ?? 'Jogador'}`).join('\n');
 const free=Math.max(0,j.capacity-j.confirmed.length);
 return `🎾 *Ultimate Challenge · ${j.division}*\n\n📅 ${j.date.split('-').reverse().join('/')} às ${j.time}\n📍 Premier Padel Club\n\n*Jogadores confirmados*\n\n${list(j.confirmed)||'Ainda sem jogadores confirmados.'}\n\n👥 *${j.confirmed.length} de ${j.capacity} vagas preenchidas*\n${free?`🟢 *${free===1?'Ainda há 1 vaga!':`Ainda há ${free} vagas!`}*`:'🟠 *Vagas preenchidas. Inscrições em lista de espera.*'}${j.waiting.length?`\n\n*Lista de espera*\n\n${list(j.waiting)}`:''}\n\nQueres jogar? Responde a esta mensagem a confirmar a tua participação. 💪`;
}
