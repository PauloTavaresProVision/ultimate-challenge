export const divisions = ['M1+', 'M1', 'M2'] as const;
export type Division = (typeof divisions)[number];
export type Player = {
  id: string;
  name: string;
  phone: string;
  birth: string;
  side: 'Esquerda' | 'Direita';
  division: Division;
  status: 'Ativo' | 'Pendente' | 'Rejeitado' | 'Inativo';
  verified: boolean;
  note: string;
};
export type Court = {
  id: string;
  name: string;
  location: string;
  active: boolean;
};
export type Game = {
  id: string;
  round: number;
  division: Division;
  a: string[];
  b: string[];
  court: string;
  date: string;
  time: string;
  duration: number;
  winner: 'a' | 'b' | null;
  published: boolean;
};
const names = [
  'Paulo Tavares',
  'João Martins',
  'Rui Ferreira',
  'Pedro Costa',
  'Miguel Santos',
  'André Silva',
  'Carlos Mendes',
  'Luís Almeida',
  'Ricardo Sousa',
  'Bruno Fernandes',
  'Tiago Lopes',
  'Nuno Pereira',
  'Diogo Rocha',
  'Filipe Gomes',
  'Hugo Carvalho',
  'Daniel Pinto',
  'Marco Vieira',
  'Vasco Correia',
  'António Ramos',
  'Sérgio Dias',
  'Gonçalo Alves',
  'Tomás Neves',
  'David Matos',
  'José Teixeira',
];
export const initialPlayers: Player[] = names.map((name, i) => ({
  id: `p${i}`,
  name,
  phone: `+24490000${String(i).padStart(4, '0')}`,
  birth: `${1978 + (i % 18)}-0${(i % 9) + 1}-15`,
  side: i % 2 ? 'Direita' : 'Esquerda',
  division: divisions[Math.floor(i / 8)],
  status: 'Ativo',
  verified: true,
  note: '',
}));
initialPlayers.push(
  ...['Eduardo Freitas', 'Francisco Brito', 'Manuel Azevedo'].map(
    (name, i): Player => ({
      id: `pending${i}`,
      name,
      phone: `+24490000900${i}`,
      birth: `${1985 + i}-03-12`,
      side: i % 2 ? 'Direita' : 'Esquerda',
      division: divisions[i],
      status: 'Pendente',
      verified: i !== 2,
      note: '',
    }),
  ),
);
export const initialCourts: Court[] = [1, 2, 3].map((n) => ({
  id: `c${n}`,
  name: `Campo ${n}`,
  location: 'Clube de Padel',
  active: true,
}));
export const initialGames: Game[] = Array.from({ length: 6 }, (_, i) => ({
  id: `g${i}`,
  round: 1,
  division: divisions[Math.floor(i / 2)],
  a: [`p${i * 4}`, `p${i * 4 + 1}`],
  b: [`p${i * 4 + 2}`, `p${i * 4 + 3}`],
  court: `c${(i % 3) + 1}`,
  date: '2026-09-05',
  time: i < 3 ? '18:00' : '19:30',
  duration: 90,
  winner: i % 2 ? 'b' : 'a',
  published: true,
}));
export function rankings(players: Player[], games: Game[], month = '2026-09') {
  return players
    .filter((p) => p.status === 'Ativo')
    .map((p) => {
      let points = 0,
        wins = 0,
        losses = 0,
        bonus = 0,
        streak = 0;
      let week = "";
      for (const g of [...games]
        .filter(
          (g) =>
            g.date.startsWith(month) &&
            (g.a.includes(p.id) || g.b.includes(p.id)),
        )
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
        )) {
        const currentWeek = g.round + ':' + g.date;
        if (week !== currentWeek) { streak = 0; week = currentWeek; }
        if (!g.winner) { streak = 0; continue; }
        const win = g[g.winner].includes(p.id);
        if (win) {
          wins++;
          points += 3;
          if (streak > 0) {
            points++;
            bonus++;
          }
          streak++;
        } else {
          losses++;
          points++;
          streak = 0;
        }
      }
      return { ...p, points, wins, losses, bonus, streak };
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        a.birth.localeCompare(b.birth) ||
        a.name.localeCompare(b.name),
    );
}
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function draw(
  players: Player[],
  games: Game[],
  round: number,
  rng = Math.random,
) {
  const result: { division: Division; a: string[]; b: string[] }[] = [];
  for (const division of divisions) {
    const pool = players.filter(
      (p) => p.status === 'Ativo' && p.division === division,
    );
    if (!pool.length) continue;
    const left = shuffle(
        pool.filter((p) => p.side === 'Esquerda'),
        rng,
      ),
      right = pool.filter((p) => p.side === 'Direita');
    if (left.length !== right.length || pool.length % 4)
      throw new Error(
        `${division}: são necessários grupos de 4 jogadores, com o mesmo número de esquerdas e direitas.`,
      );
    const forbidden = new Set(
      games
        .filter((g) => g.round === round - 1)
        .flatMap((g) => [g.a, g.b])
        .map((pair) => [...pair].sort().join('|')),
    );
    function pair(index: number, remaining: Player[]): string[][] | null {
      if (index === left.length) return [];
      for (const r of shuffle(remaining, rng)) {
        if (forbidden.has([left[index].id, r.id].sort().join('|'))) continue;
        const rest = pair(
          index + 1,
          remaining.filter((p) => p.id !== r.id),
        );
        if (rest) return [[left[index].id, r.id], ...rest];
      }
      return null;
    }
    const pairs = pair(0, right);
    if (!pairs)
      throw new Error(
        `${division}: não existe sorteio válido sem repetir parceiros da semana anterior.`,
      );
    const teams = shuffle(pairs, rng);
    for (let i = 0; i < teams.length; i += 2)
      result.push({ division, a: teams[i], b: teams[i + 1] });
  }
  if (!result.length) throw new Error('Não há jogadores ativos para sortear.');
  return result;
}
export function conflict(candidate: Game, games: Game[]) {
  const start = (g: Game) =>
    Number(g.time.slice(0, 2)) * 60 + Number(g.time.slice(3));
  return games.some(
    (g) =>
      g.id !== candidate.id &&
      g.date === candidate.date &&
      start(g) < start(candidate) + candidate.duration &&
      start(candidate) < start(g) + g.duration &&
      (g.court === candidate.court ||
        [...g.a, ...g.b].some((id) =>
          [...candidate.a, ...candidate.b].includes(id),
        )),
  );
}


/** Fixed partners; prefer new opponents while every team changes court. */
export function weeklySchedule(pairs: ReturnType<typeof draw>, courts: Court[], round: number, date: string): Game[] {
  if (courts.length < 2) throw new Error('Ativa pelo menos dois campos para permitir a rotação entre jogos.');
  const result: Game[] = [];
  const batches: typeof pairs[] = [];
  for (const division of divisions) {
    const pool=pairs.filter(p=>p.division===division);
    for(let i=0;i<pool.length;i+=courts.length)batches.push(pool.slice(i,i+courts.length));
  }
  for (const [batchIndex,batch] of batches.entries()) {
    const teams = batch.flatMap(p => [{ ids:p.a, division:p.division }, {ids:p.b, division:p.division}]);
    const previous = new Map<number,number>();
    const encounters = new Map<string,number>();
    const key = (a:number,b:number) => [a,b].sort((x,y)=>x-y).join(':');
    type Match = {a:number;b:number;court:number};
    for (let slot=0;slot<4;slot++) {
      let best:Match[]|null=null, bestCost=Infinity, budget=30000;
      function search(remaining:number[],used:Set<number>,matches:Match[],cost:number) {
        if (--budget<0 || cost>=bestCost) return;
        if (!remaining.length) { best=[...matches]; bestCost=cost; return; }
        const a=remaining[0];
        const opponents=remaining.slice(1).filter(b=>teams[a].division===teams[b].division)
          .sort((b,c)=>(encounters.get(key(a,b))??0)-(encounters.get(key(a,c))??0));
        for(const b of opponents) for(let offset=0;offset<courts.length;offset++) {
          const court=(offset+slot+matches.length)%courts.length;
          if(used.has(court)||previous.get(a)===court||previous.get(b)===court)continue;
          used.add(court); matches.push({a,b,court});
          search(remaining.filter(x=>x!==a&&x!==b),used,matches,cost+(encounters.get(key(a,b))??0));
          matches.pop();used.delete(court);
        }
      }
      search(teams.map((_,i)=>i),new Set(),[],0);
      if(!best)throw new Error('Não foi possível combinar adversários e rotação de campos. Tenta outro sorteio.');
      const minutes=1080+batchIndex*80+slot*20;
      if(minutes+20>1440)throw new Error('Não há horários suficientes no dia. Ativa mais campos.');
      for(const match of best as Match[]) {
        const {a,b,court}=match;
        encounters.set(key(a,b),(encounters.get(key(a,b))??0)+1);
        previous.set(a,court);previous.set(b,court);
        result.push({id:crypto.randomUUID(),round,date,division:teams[a].division,a:teams[a].ids,b:teams[b].ids,
          court:courts[court].id,time:String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0'),
          duration:20,winner:null,published:false});
      }
    }
  }
  return result;
}
