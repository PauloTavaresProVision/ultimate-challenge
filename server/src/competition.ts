import { db } from './db.ts';
import { monthRecord } from './competition-rules.ts';
import type { Player, Game } from '../../lib/tournament.ts';
export async function runCompetition(today = new Date().toLocaleDateString('en-CA', {timeZone:'Africa/Luanda'})) {
  return db.$transaction(async tx => {
    // Shared lock serializes results, admin saves and scheduled operations.
    await tx.$queryRaw`SELECT id FROM "Revision" WHERE id = 1 FOR UPDATE`;
    const rawGames = await tx.game.findMany({where:{published:true},orderBy:{date:'asc'}});
    if (!rawGames.length) return;
    const games = rawGames.map(({courtId,...g}) => ({...g,court:courtId})) as Game[];
    const players = (await tx.player.findMany()).map(p=>({...p,birth:p.birth.toISOString().slice(0,10)})) as Player[];
    const settings = await tx.setting.findMany({where:{key:{startsWith:'competition:'}}});
    const known = new Map(settings.map(s=>[s.key,s.value]));
    const save = async (key:string,value:unknown) => { const text=JSON.stringify(value); await tx.setting.upsert({where:{key},create:{key,value:text},update:{value:text}}); known.set(key,text); };
    const anchor = known.has('competition:anchor') ? JSON.parse(known.get('competition:anchor')!) as string : games[0].date;
    if (!known.has('competition:anchor')) await save('competition:anchor',anchor);
    const events: {date:string;type:'month';key:string;month?:string}[]=[];
    // Division changes are exclusively manual; do not queue overdue or future exchanges.
    let month=anchor.slice(0,7);
    while(month<today.slice(0,7)) { const next=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)).toISOString().slice(0,10); if(!known.has('competition:month:'+month)) events.push({date:next,type:'month',key:'competition:month:'+month,month}); month=next.slice(0,7); }
    events.sort((a,b)=>a.date.localeCompare(b.date));
    let changed=false;
    let blocked:string|null=null;
    for(const event of events) {
      if(games.some(g=>g.date<event.date && !g.winner)) { blocked=`A operação de ${event.date} aguarda resultados dos jogos anteriores.`; break; }
      if(event.type==='month') {
        await save(event.key,{...monthRecord(players,games,event.month!),closedAt:new Date().toISOString()});
        await tx.audit.create({data:{actor:'system',action:`Mês ${event.month} encerrado. Campeões e classificação guardados; novo mês a zero.`}});
      }
      changed=true;
    }
    await save('competition:status',{checkedAt:new Date().toISOString(),blocked,nextMovement:null,manualMovements:true});
    if(changed) await tx.revision.update({where:{id:1},data:{value:{increment:1}}});
  },{timeout:20000});
}
