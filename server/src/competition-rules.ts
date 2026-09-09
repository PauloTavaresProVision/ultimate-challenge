import { divisions, rankings, type Player, type Game } from '../../lib/tournament.ts';
export const addDays = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0,10);
export function movementPlan(players: Player[], games: Game[], cutoff: string) {
  const rank = rankings(players, games.filter(g => g.published && g.date < cutoff), addDays(cutoff,-1).slice(0,7));
  const changes: { id: string; name: string; side: string; from: string; to: string; points: number }[] = [];
  const used = new Set<string>();
  for (let i=0;i<divisions.length-1;i++) for (const side of ['Esquerda','Direita']) {
    const upper = rank.filter(p => p.verified && p.division === divisions[i] && p.side === side);
    const lower = rank.filter(p => p.verified && p.division === divisions[i+1] && p.side === side);
    const down = upper.at(-1), up = lower[0];
    if (!up || !down) throw new Error(`Faltam jogadores ${side.toLowerCase()} para trocar entre ${divisions[i]} e ${divisions[i+1]}.`);
    if (used.has(up.id) || used.has(down.id)) throw new Error(`As divisões intermédias precisam de dois jogadores de cada lado para haver subida e descida distintas (${divisions[i]} / ${divisions[i+1]}).`);
    for (const [p,to] of [[up,divisions[i]],[down,divisions[i+1]]] as const) {
      used.add(p.id); changes.push({id:p.id,name:p.name,side:p.side,from:p.division,to,points:p.points});
    }
  }
  return changes;
}
export function monthRecord(players: Player[], games: Game[], month: string) {
  const table = rankings(players, games.filter(g => g.published), month).map(({id,name,division,side,points,wins,losses,bonus,birth}) => ({id,name,division,side,points,wins,losses,bonus,birth}));
  return { month, table, champions: divisions.map(division => ({division, player:table.find(p => p.division === division) ?? null})) };
}
