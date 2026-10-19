import {rankings,type Player,type Game} from './tournament.ts';
export const luandaToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Luanda',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const shiftDate=(date:string,days:number)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
export function competitionCycle(games:Game[],today=luandaToday(),anchor?:string,closed?:CycleClosure){
 if(closed&&closed.date<=today&&today<shiftDate(closed.cutoff,14))return {start:closed.date,end:shiftDate(closed.cutoff,13),next:shiftDate(closed.cutoff,14)};
 const first=anchor??games.filter(g=>g.published).map(g=>g.date).sort()[0]??today;
 const days=Math.max(0,Math.floor((Date.parse(today)-Date.parse(first))/86400000));
 const start=shiftDate(first,Math.floor(days/14)*14);
 return {start,end:shiftDate(start,13),next:shiftDate(start,14)};
}
export function cycleRankings(players:Player[],games:Game[],today=luandaToday(),anchor?:string,closed?:CycleClosure){
 const cycle=competitionCycle(games,today,anchor,closed);
 return rankings(players,games.filter(g=>g.published&&g.date>=cycle.start&&g.date<=cycle.end),'');
}

export type CycleClosure={date:string;cutoff:string};
// Only complete paired exchanges close a cycle; individual manual changes do not.
export function latestCycleClosure(rows:{key:string;value:string}[]):CycleClosure|undefined{
 const closures:CycleClosure[]=[];
 for(const row of rows){
  if(!/^competition:move:\d{4}-\d{2}-\d{2}$/.test(row.key))continue;
  const record=JSON.parse(row.value);
  const changes=record.changes??[];
  if(changes.length!==8||new Set(changes.map((c:{id:string})=>c.id)).size!==8)continue;
  if(changes.filter((c:{from:string;to:string})=>c.from==='M1'&&c.to==='M1+').length!==4||changes.filter((c:{from:string;to:string})=>c.from==='M1+'&&c.to==='M1').length!==4)continue;
  const cutoff=row.key.slice('competition:move:'.length);
  if(/^\d{4}-\d{2}-\d{2}$/.test(record.date)&&record.date<=cutoff)closures.push({date:record.date,cutoff});
 }
 return closures.sort((a,b)=>b.cutoff.localeCompare(a.cutoff))[0];
}
