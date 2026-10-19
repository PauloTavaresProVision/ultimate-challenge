import {db} from './db.ts';
import {latestCycleClosure,luandaToday} from '../../lib/competition-cycle.ts';
export async function competitionPeriod(){
 const rows=await db.setting.findMany({where:{key:{startsWith:'competition:'}}});
 const anchor=rows.find(r=>r.key==='competition:anchor');
 return {today:luandaToday(),anchor:anchor?JSON.parse(anchor.value) as string:undefined,closed:latestCycleClosure(rows)};
}
