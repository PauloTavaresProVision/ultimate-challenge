import {cycleRankings,competitionCycle} from './competition-cycle.ts';
import {rankings,type Player,type Game} from './tournament.ts';
export type StandingRow={id:string;name:string;position:number;points:number;wins:number;losses:number;bonus:number;isYou:boolean};
export type PlayerStandingMonth={month:string;division:string;archived:boolean;cycle?:{start:string;end:string;next:string};rows:StandingRow[];divisions:{division:string;rows:StandingRow[]}[]};
type ArchivedRow={id:string;name:string;division:string;points:number;wins:number;losses:number;bonus:number};
export function playerStandings(playerId:string,players:Player[],games:Game[],month:string,archives:{month:string;table:ArchivedRow[]}[]=[],period?:{today:string;anchor?:string}):PlayerStandingMonth[]{
  const me=players.find(p=>p.id===playerId);
  if(!me)throw Error('Jogador não encontrado.');
  const project=(table:ArchivedRow[],division:string)=>table.filter(p=>p.division===division).map((p,i)=>({id:p.id,name:p.name,position:i+1,points:p.points,wins:p.wins,losses:p.losses,bonus:p.bonus,isYou:p.id===playerId}));
  const divisions=(table:ArchivedRow[])=>['M1+','M1','M2+','M2'].map(division=>({division,rows:project(table,division)}));
  const published=games.filter(g=>g.published);
  const available=[...new Set([month,...published.map(g=>g.date.slice(0,7)).filter(m=>m<month),...archives.map(a=>a.month).filter(m=>m<month)])].sort((a,b)=>b.localeCompare(a));
  return available.map(value=>{
    const archive=archives.find(a=>a.month===value);
    const monthlyGames=published.filter(g=>g.date.startsWith(value));
    // Unclosed past months still need to remain visible. Their latest recorded
    // game is the best available division evidence until a snapshot is saved.
    const latest=new Map<string,Game>();
    for(const game of [...monthlyGames].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)))
      for(const id of [...game.a,...game.b])latest.set(id,game);
    const roster=value===month?players:players.filter(p=>latest.has(p.id)).map(p=>({...p,division:latest.get(p.id)!.division,status:'Ativo' as const}));
    const cycle=value===month&&period?competitionCycle(games,period.today,period.anchor):undefined;
    const table=archive?.table??(cycle&&period?cycleRankings(roster,games,period.today,period.anchor):rankings(roster,monthlyGames,value));
    const division=table.find(p=>p.id===playerId)?.division??me.division;
    return {month:value,division,...(cycle?{cycle}:{}),archived:!!archive,rows:project(table,division),divisions:divisions(table)};
  });
}
