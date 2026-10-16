import {rankings,type Player,type Game} from './tournament.ts';
export const luandaToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Luanda',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const shiftDate=(date:string,days:number)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
export function competitionCycle(games:Game[],today=luandaToday(),anchor?:string){
 const first=anchor??games.filter(g=>g.published).map(g=>g.date).sort()[0]??today;
 const days=Math.max(0,Math.floor((Date.parse(today)-Date.parse(first))/86400000));
 const start=shiftDate(first,Math.floor(days/14)*14);
 return {start,end:shiftDate(start,13),next:shiftDate(start,14)};
}
export function cycleRankings(players:Player[],games:Game[],today=luandaToday(),anchor?:string){
 const cycle=competitionCycle(games,today,anchor);
 return rankings(players,games.filter(g=>g.published&&g.date>=cycle.start&&g.date<=cycle.end),'');
}
