import type {Journey} from './journey.ts';
export function mergeM2Journeys(journeys:Journey[],today:string){
 const result=journeys.map(j=>({...j,confirmed:[...j.confirmed],waiting:[...j.waiting],courtIds:[...j.courtIds]}));
 const aliases:Record<string,string>={};
 const touched=new Set<string>();
 const original=journeys.filter(j=>j.division==='M2'&&j.date>=today);
 for(const source of original){
  const matches=result.filter(j=>j.id!==source.id&&j.group===source.group&&j.date===source.date&&j.division==='M2+');
  if(matches.length>1)throw Error(`Há várias jornadas M2+ em ${source.date}. Resolve a duplicação antes de unir.`);
  const target=matches[0];
  if(target&&target.time!==source.time)throw Error(`M2 e M2+ têm horas diferentes em ${source.date} (${source.time} / ${target.time}). Define primeiro a hora comum.`);
  if(source.status==='drawn'||target?.status==='drawn')throw Error(`Já há sorteio preparado em ${source.date}. A união precisa de rever esse sorteio; nenhuma alteração foi aplicada.`);
  if(!target){
   const moved=result.find(j=>j.id===source.id)!;moved.division='M2+';touched.add(moved.id);continue;
  }
  target.mergedFrom=[...new Set([...(target.mergedFrom??[]),source.id])];
  target.confirmed=[...new Set([...target.confirmed,...source.confirmed])];
  target.waiting=[...new Set([...target.waiting,...source.waiting])].filter(id=>!target.confirmed.includes(id));
  target.courtIds=[...new Set([...target.courtIds,...source.courtIds])];
  target.capacity=Math.max(target.capacity,source.capacity,target.courtIds.length*4,Math.ceil(target.confirmed.length/4)*4);
  // Do not promote anyone from waiting without an administrator's decision.
  target.status=target.status==='open'||source.status==='open'?'open':'closed';
  aliases[source.id]=target.id;touched.add(target.id);
  result.splice(result.findIndex(j=>j.id===source.id),1);
 }
 return {journeys:result,aliases,changed:result.filter(j=>touched.has(j.id)),original};
}
