import { divisions, rankings, type Player, type Game } from '../../lib/tournament.ts';
export const addDays = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0,10);
// One dated exception: never attach it to the deployment date or to an overdue cycle.
export function exceptionalM2Cycle(anchor:string){
 const requested='2026-10-14';
 let cutoff=addDays(anchor,14);
 while(cutoff<requested)cutoff=addDays(cutoff,14);
 return cutoff;
}
export function movementPlan(players: Player[], games: Game[], cutoff: string, m2Relegations?:20|'manual-done') {
  const rank = rankings(players, games.filter(g => g.published && g.date < cutoff), addDays(cutoff,-1).slice(0,7));
  const changes: { id: string; name: string; side: string; from: string; to: string; points: number }[] = [];
  const used = new Set<string>();
  for (let i=0;i<divisions.length-1;i++) {
   if(i===2&&m2Relegations==='manual-done')continue;
   if(i===2&&m2Relegations===20){
    const candidates=rank.filter(p=>p.verified&&p.division==='M2+');
    if(candidates.length<20)throw new Error('A descida excecional exige pelo menos 20 jogadores elegíveis no M2+.');
    const down=candidates.slice(-20);
    if(down.some(p=>used.has(p.id)))throw new Error('A descida dos 20 últimos coincide com jogadores que sobem para M1. Revê o número de participantes do M2+.');
    for(const p of down){used.add(p.id);changes.push({id:p.id,name:p.name,side:p.side,from:p.division,to:'M2',points:p.points});}
    // Retain the usual promotions where M2 has eligible players; an empty M2 must not prevent its creation.
    for(const side of ['Esquerda','Direita']){
     const up=rank.find(p=>p.verified&&p.division==='M2'&&p.side===side);
     if(up){used.add(up.id);changes.push({id:up.id,name:up.name,side:up.side,from:up.division,to:'M2+',points:up.points});}
    }
    continue;
   }
   for (const side of ['Esquerda','Direita']) {
    const upper = rank.filter(p => p.verified && p.division === divisions[i] && p.side === side);
    const lower = rank.filter(p => p.verified && p.division === divisions[i+1] && p.side === side);
    const down = upper.at(-1), up = lower[0];
    if (!up || !down) throw new Error(`Faltam jogadores ${side.toLowerCase()} para trocar entre ${divisions[i]} e ${divisions[i+1]}.`);
    if (used.has(up.id) || used.has(down.id)) throw new Error(`As divisões intermédias precisam de dois jogadores de cada lado para haver subida e descida distintas (${divisions[i]} / ${divisions[i+1]}).`);
    for (const [p,to] of [[up,divisions[i]],[down,divisions[i+1]]] as const) {
      used.add(p.id); changes.push({id:p.id,name:p.name,side:p.side,from:p.division,to,points:p.points});
    }
  }
  }
  return changes;
}
export function monthRecord(players: Player[], games: Game[], month: string) {
  const table = rankings(players, games.filter(g => g.published), month).map(({id,name,division,side,points,wins,losses,bonus,birth}) => ({id,name,division,side,points,wins,losses,bonus,birth}));
  return { month, table, champions: divisions.map(division => ({division, player:table.find(p => p.division === division) ?? null})) };
}

export function manualM2Plan(players:Player[],games:Game[],month:string){
 const rank=rankings(players,games.filter(g=>g.published),month).filter(p=>p.verified&&p.division==='M2+');
 if(rank.length<20)throw Error('São necessários pelo menos 20 jogadores ativos e validados no M2+.');
 return rank.map((p,i)=>({id:p.id,name:p.name,position:i+1,points:p.points,from:'M2+',to:'M2'})).slice(-20);
}
