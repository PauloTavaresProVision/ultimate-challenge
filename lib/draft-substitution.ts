import type {Game,Player} from './tournament.ts';
import {forbiddenPartnership} from './pairing-restrictions.ts';

export function replaceDraftPlayer(games:Game[],players:Player[],round:number,division:string,outgoing:string,incoming:string):Game[]{
  const own=games.filter(g=>g.round===round&&g.division===division&&[...g.a,...g.b].includes(outgoing));
  if(own.length!==4||own.some(g=>g.published||g.winner))throw Error('Seleciona um jogador com quatro jogos em rascunho, sem resultados.');
  const substitute=players.find(p=>p.id===incoming);
  if(!substitute||substitute.status!=='Ativo'||!substitute.verified||substitute.division!==division||incoming===outgoing)throw Error('Escolhe um suplente aprovado da mesma divisão.');
  if(games.some(g=>(g.round===round||own.some(x=>x.date===g.date))&&[...g.a,...g.b].includes(incoming)))throw Error('O suplente já tem jogos nesta ronda ou neste dia.');
  for(const g of own){
    const pair=g.a.includes(outgoing)?g.a:g.b;
    const partner=players.find(p=>p.id===pair.find(id=>id!==outgoing));
    if(!partner)throw Error('Parceiro não encontrado.');
    if(forbiddenPartnership({...partner,division:g.division},substitute))throw Error('Estes jogadores não podem formar dupla.');
    if(games.some(old=>old.round===round-1&&[old.a,old.b].some(team=>team.includes(partner.id)&&team.includes(incoming))))throw Error('O suplente repetiria o parceiro da ronda anterior.');
  }
  const ids=new Set(own.map(g=>g.id));
  return games.map(g=>ids.has(g.id)?{...g,a:g.a.map(id=>id===outgoing?incoming:id) as Game['a'],b:g.b.map(id=>id===outgoing?incoming:id) as Game['b']}:g);
}
