import {competitionCycle,latestCycleClosure} from '../../lib/competition-cycle.ts';
import { db } from './db.ts';
import { monthRecord, fourPlayerMovementPlan, addDays } from './competition-rules.ts';
import type { Player, Game } from '../../lib/tournament.ts';
export async function runCompetition(today = new Date().toLocaleDateString('en-CA', {timeZone:'Africa/Luanda'})) {
  return db.$transaction(async tx => {
    // Shared lock serializes results, admin saves and scheduled operations.
    await tx.$queryRaw`SELECT id FROM "Revision" WHERE id = 1 FOR UPDATE`;
    const rawGames = await tx.game.findMany({where:{published:true},orderBy:{date:'asc'}});
    if (!rawGames.length) return;
    const games = rawGames.map(({courtId,...g}) => ({...g,court:courtId})) as Game[];
    let players = (await tx.player.findMany()).map(p=>({...p,birth:p.birth.toISOString().slice(0,10)})) as Player[];
    const settings = await tx.setting.findMany({where:{key:{startsWith:'competition:'}}});
    const known = new Map(settings.map(s=>[s.key,s.value]));
    const save = async (key:string,value:unknown) => { const text=JSON.stringify(value); await tx.setting.upsert({where:{key},create:{key,value:text},update:{value:text}}); known.set(key,text); };
    const anchor = known.has('competition:anchor') ? JSON.parse(known.get('competition:anchor')!) as string : games[0].date;
    if (!known.has('competition:anchor')) await save('competition:anchor',anchor);
    const policyKey='competition:four-player-policy';
    if(!known.has(policyKey))await save(policyKey,{firstCutoff:competitionCycle(games,today,anchor).next});
    const policy=JSON.parse(known.get(policyKey)!) as {firstCutoff:string};
    const events: {date:string;type:'month'|'move';key:string;month?:string}[]=[];
    for(let date=policy.firstCutoff;date<=today;date=addDays(date,14))if(!known.has('competition:move:'+date))events.push({date,type:'move',key:'competition:move:'+date});
    let month=anchor.slice(0,7);
    while(month<today.slice(0,7)) { const next=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),1)).toISOString().slice(0,10); if(!known.has('competition:month:'+month)) events.push({date:next,type:'month',key:'competition:month:'+month,month}); month=next.slice(0,7); }
    events.sort((a,b)=>a.date.localeCompare(b.date)||(a.type==='month'?-1:1));
    const closure=latestCycleClosure(settings);
    let changed=false;
    let blocked:string|null=null;
    for(const event of events) {
      const cycleStart=closure&&addDays(closure.cutoff,14)===event.date?closure.date:addDays(event.date,-14);
      if(games.some(g=>g.date<event.date&&!g.winner&&(event.type==='month'||(['M1+','M1'].includes(g.division)&&g.date>=cycleStart)))) { blocked=`A operação de ${event.date} aguarda resultados dos jogos anteriores.`; break; }
      if(event.type==='month') {
        await save(event.key,{...monthRecord(players,games,event.month!),closedAt:new Date().toISOString()});
        await tx.audit.create({data:{actor:'system',action:`Mês ${event.month} encerrado. Campeões e classificação guardados; novo mês a zero.`}});
      }
      if(event.type==='move'){
        let changes;
        try{changes=fourPlayerMovementPlan(players,games,cycleStart,event.date);}catch(e){blocked=(e as Error).message;break;}
        if(games.some(g=>g.date>=event.date&&!g.winner&&[...g.a,...g.b].some(id=>changes.some(c=>c.id===id)))){blocked=`A troca de ${event.date} aguarda revisão dos jogos já publicados para os jogadores que mudam de nível.`;break;}
        for(const change of changes)await tx.player.update({where:{id:change.id},data:{division:change.to}});
        await save(event.key,{date:event.date,cycleStart,changes,automatic:true,pointsReset:true});
        players=players.map(p=>({...p,division:(changes.find(c=>c.id===p.id)?.to??p.division) as Player['division']}));
        await tx.audit.create({data:{actor:'system',action:`Troca quinzenal ${event.date}: 4 M1+ → M1 e 4 M1 → M1+. Novo ciclo a zero; ranking mensal preservado.`}});
      }
      changed=true;
    }
    await save('competition:status',{checkedAt:new Date().toISOString(),blocked,nextMovement:events.find(e=>e.type==='move'&&!known.has(e.key))?.date??competitionCycle(games,today,anchor,latestCycleClosure([...known].map(([key,value])=>({key,value})))).next,manualMovements:false,manualDivisions:['M2+','M2']});
    if(changed) await tx.revision.update({where:{id:1},data:{value:{increment:1}}});
  },{timeout:20000});
}
