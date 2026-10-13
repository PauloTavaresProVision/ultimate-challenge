import type {Game} from './tournament.ts';

export function managementRounds(games:Game[],today:string,division='Todas') {
  const grouped=new Map<string,Game[]>();
  for(const game of games){
    if(division!=='Todas'&&game.division!==division)continue;
    const key=`${game.date}:${game.division}:${game.round}`;
    grouped.set(key,[...(grouped.get(key)??[]),game]);
  }
  return [...grouped].map(([id,rows])=>({
    id,round:rows[0].round,date:rows[0].date,division:rows[0].division,
    games:rows.sort((a,b)=>a.time.localeCompare(b.time)||a.court.localeCompare(b.court)),
    past:rows[0].date<today||rows.every(g=>!!g.winner),
    draft:rows.some(g=>!g.published),
    players:[...new Set(rows.flatMap(g=>[...g.a,...g.b]))],
  })).sort((a,b)=>a.date.localeCompare(b.date)||a.division.localeCompare(b.division)||a.round-b.round);
}
