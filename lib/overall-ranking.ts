import {rankings,type Player,type Game} from './tournament.ts';

export function overallRanking(players:Player[],games:Game[]){
 const published=games.filter(g=>g.published);
 const participants=new Set(published.filter(g=>g.winner).flatMap(g=>[...g.a,...g.b]));
 // Preserve former players' earned points without admitting unapproved zero-score entries.
 const eligible=players.filter(p=>p.status==='Ativo'||participants.has(p.id)).map(p=>({...p,status:'Ativo' as const}));
 return rankings(eligible,published,'').map((p,i)=>({id:p.id,name:p.name,division:p.division,side:p.side,position:i+1,points:p.points,wins:p.wins,losses:p.losses,bonus:p.bonus}));
}
export type OverallRankingRow=ReturnType<typeof overallRanking>[number];
