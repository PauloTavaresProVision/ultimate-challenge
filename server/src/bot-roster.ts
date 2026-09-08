export function rosterReply(division:string, players:{name:string;side:string}[]) {
  if (!players.length) return `Ainda não há jogadores com inscrição aprovada na divisão ${division}.`;
  return `Na divisão ${division} ${players.length===1?'há 1 jogador com inscrição aprovada':'há '+players.length+' jogadores com inscrição aprovada'}:\n\n`+players.map(p=>`• ${p.name} — ${p.side}`).join('\n');
}
