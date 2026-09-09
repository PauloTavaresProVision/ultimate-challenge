import {divisions, weeklySchedule, type Division, type Game, type Court, type draw} from './tournament.ts';

export type WeeklyCalendar = {divisions:Record<Division,{weekday:number;time:string}>};
export type RoundCalendar = Record<Division,{date:string;time:string}>;
export const weekdayNames=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
// The former shared time is retained when upgrading to division calendars.
export function normalizeCalendar(raw?: {time?:string;divisions?:WeeklyCalendar['divisions']}|null):WeeklyCalendar {
  return {divisions:Object.fromEntries(divisions.map(d=>[d,raw?.divisions?.[d]??{weekday:d==='M1+'||d==='M1'?2:3,time:raw?.time??'18:00'}])) as WeeklyCalendar['divisions']};
}
const shift=(date:string,n:number)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export function nextRoundCalendar(calendar:WeeklyCalendar,games:Game[],today:string):RoundCalendar {
  const latestRound=Math.max(0,...games.map(g=>g.round));
  const previous=games.filter(g=>g.round===latestRound).map(g=>g.date).sort()[0];
  let anchor=previous&&shift(previous,7)>today?shift(previous,7):today;
  // Find a single week where all divisions can still play, preserving seven days per division.
  let monday=shift(anchor,-((new Date(anchor+'T12:00:00Z').getUTCDay()+6)%7));
  for(let attempt=0;attempt<54;attempt++,monday=shift(monday,7)){
    const result=Object.fromEntries(divisions.map(d=>[d,{date:shift(monday,(calendar.divisions[d].weekday+6)%7),time:calendar.divisions[d].time}])) as RoundCalendar;
    if(divisions.every(d=>result[d].date>=today&&games.filter(g=>g.division===d).every(g=>result[d].date>=shift(g.date,7))))return result;
  }
  throw new Error('Não foi possível encontrar uma semana disponível.');
}
export function scheduleDivisions(pairs:ReturnType<typeof draw>,courts:Court[],round:number,calendar:RoundCalendar):Game[]{
  const sessions=new Map<string,typeof pairs>();
  for(const pair of pairs){const slot=calendar[pair.division];const key=slot.date+'|'+slot.time;sessions.set(key,[...(sessions.get(key)??[]),pair]);}
  return [...sessions].flatMap(([key,pool])=>{const [date,time]=key.split('|');return weeklySchedule(pool,courts,round,date,time);});
}
