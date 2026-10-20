import type {Game,Court} from './tournament.ts';
export type CourtChange={id:string;from:string;to:string};
export function changeRoundCourts(games:Game[],others:Game[],courts:Court[],changes:CourtChange[],today:string){
 if(!games.length||games.some(g=>g.date<today||g.winner))throw Error('Só podes alterar campos de jornadas sem resultados e que ainda não passaram.');
 if(changes.length!==games.length||new Set(changes.map(c=>c.id)).size!==games.length)throw Error('A jornada mudou. Atualiza a página e volta a escolher os campos.');
 const updated=games.map(g=>{
  const c=changes.find(c=>c.id===g.id);
  if(!c||c.from!==g.court)throw Error('Os campos foram alterados por outro administrador. Atualiza a página.');
  if(!courts.some(court=>court.id===c.to&&(court.active||c.to===g.court)))throw Error('Escolhe um campo ativo.');
  return {...g,court:c.to};
 });
 const minutes=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
 for(const g of updated){
  if([...others,...updated].some(o=>o.id!==g.id&&o.date===g.date&&o.court===g.court&&minutes(g.time)<minutes(o.time)+o.duration&&minutes(o.time)<minutes(g.time)+g.duration))
   throw Error(`O campo ${courts.find(c=>c.id===g.court)?.name??g.court} já está ocupado às ${g.time}. Escolhe outro campo.`);
 }
 return updated;
}
