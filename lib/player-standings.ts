import {rankings,type Player,type Game} from './tournament.ts';
export type StandingRow={id:string;name:string;position:number;points:number;wins:number;losses:number;bonus:number;isYou:boolean};
export type PlayerStandingMonth={month:string;division:string;archived:boolean;rows:StandingRow[];divisions:{division:string;rows:StandingRow[]}[]};
type ArchivedRow={id:string;name:string;division:string;points:number;wins:number;losses:number;bonus:number};
export function playerStandings(playerId:string,players:Player[],games:Game[],month:string,archives:{month:string;table:ArchivedRow[]}[]=[]):PlayerStandingMonth[]{
  const me=players.find(p=>p.id===playerId);
  if(!me)throw Error('Jogador não encontrado.');
  const project=(table:ArchivedRow[],division:string)=>table.filter(p=>p.division===division).map((p,i)=>({id:p.id,name:p.name,position:i+1,points:p.points,wins:p.wins,losses:p.losses,bonus:p.bonus,isYou:p.id===playerId}));
  const divisions=(table:ArchivedRow[])=>['M1+','M1','M2+','M2'].map(division=>({division,rows:project(table,division)}));
  const current=rankings(players,games.filter(g=>g.published),month);
  return [{month,division:me.division,archived:false,rows:project(current,me.division),divisions:divisions(current)},...archives.filter(a=>a.month<month).sort((a,b)=>b.month.localeCompare(a.month)).map(a=>{
    const division=a.table.find(p=>p.id===playerId)?.division??me.division;
    return {month:a.month,division,archived:true,rows:project(a.table,division),divisions:divisions(a.table)};
  })];
}
