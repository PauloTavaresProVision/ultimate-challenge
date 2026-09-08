import {db} from './db.ts';
import {rankings,type Player} from '../../lib/tournament.ts';
import {defaultRules} from '../../lib/public-rules.ts';
import {vacancies,todayLuanda} from './substitutions.ts';
import type {Query} from './tournament-assistant.ts';
export async function queryTournament(playerId:string,q:Query){
 const me=await db.player.findUnique({where:{id:playerId}});
 if(!me?.verified||me.status!=='Ativo')throw Error('Jogador não autorizado.');
 const division=q.division==='mine'?me.division:q.division;
 const people=await db.player.findMany({where:{status:'Ativo',verified:true},select:{id:true,name:true,division:true,side:true},orderBy:{name:'asc'}});
 const matches=people.filter(p=>(division==='all'||p.division===division)&&p.name.toLocaleLowerCase().includes(q.name.toLocaleLowerCase()));
 const page=(rows:unknown[])=>({total:rows.length,offset:q.offset,items:rows.slice(q.offset,q.offset+50),hasMore:rows.length>q.offset+50});
 if(q.topic==='players')return page(matches.map(({id,...p})=>({...p,isYou:id===playerId})));
 if(q.topic==='rules'){const row=await db.setting.findUnique({where:{key:'public-rules'}});return row?JSON.parse(row.value).rules:defaultRules;}
 if(q.topic==='courts')return page(await db.court.findMany({where:{active:true},select:{name:true,location:true}}));
 if(q.topic==='competition'){const row=await db.setting.findUnique({where:{key:'competition:status'}});return row?JSON.parse(row.value):{status:'Ainda não definido'};}
 if(q.topic==='substitutions')return page((await vacancies()).filter(v=>(division==='all'||v.division===division)&&v.status==='pending').map(v=>({name:v.name,division:v.division,side:v.side,round:v.round,date:v.date,status:v.status,candidates:v.candidates.map(id=>people.find(p=>p.id===id)?.name??'Jogador')})));
 if(q.topic==='games'){
  const ids=q.mine?[playerId]:q.name?matches.map(p=>p.id):null;
  const rows=await db.game.findMany({where:{published:true,date:{gte:q.from||todayLuanda(),...(q.to?{lte:q.to}:{})},...(division!=='all'?{division}:{}),...(ids?{OR:[{a:{hasSome:ids}},{b:{hasSome:ids}}]}:{})},include:{court:true},orderBy:[{date:'asc'},{time:'asc'}]});
  const allNames=await db.player.findMany({select:{id:true,name:true}});
  const pending=(await vacancies()).filter(v=>v.status==='pending');
  const name=(id:string,gameId:string)=>pending.some(v=>v.playerId===id&&v.gameIds.includes(gameId))?'Aguarda suplente':allNames.find(p=>p.id===id)?.name??'Jogador';
  return page(rows.map(g=>({round:g.round,date:g.date,time:g.time,duration:g.duration,division:g.division,court:g.court.name,location:g.court.location,a:g.a.map(id=>name(id,g.id)),b:g.b.map(id=>name(id,g.id)),winner:g.winner})));
 }
 const month=(q.from||todayLuanda()).slice(0,7);
 if(month!==todayLuanda().slice(0,7))return {error:'Classificação histórica não disponível nesta consulta. Não uses a classificação atual como histórica.'};
 const players=await db.player.findMany();const games=await db.game.findMany({where:{published:true,date:{startsWith:month}}});
 const table=rankings(players.map(p=>({...p,birth:p.birth.toISOString().slice(0,10)})) as Player[],games.map(g=>({...g,court:g.courtId})) as Parameters<typeof rankings>[1],month);
 return page(table.filter(p=>matches.some(m=>m.id===p.id)).map(p=>({name:p.name,division:p.division,side:p.side,position:table.filter(other=>other.division===p.division).findIndex(other=>other.id===p.id)+1,points:p.points,wins:p.wins,losses:p.losses,bonus:p.bonus,isYou:p.id===playerId})));
}
