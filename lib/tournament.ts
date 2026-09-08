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
      for (const g of [...games]
        .filter(
          (g) =>
            g.date.startsWith(month) &&
            g.winner &&
            (g.a.includes(p.id) || g.b.includes(p.id)),
        )
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
        )) {
        const win = g[g.winner!].includes(p.id);
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
