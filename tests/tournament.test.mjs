import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialPlayers,
  initialGames,
  rankings,
  draw,
  conflict,
} from '../lib/tournament.ts';
test('Sorteios preservam lados, divisão e unicidade, sem repetir parceiros', () => {
  for (let n = 0; n < 100; n++) {
    const result = draw(initialPlayers, initialGames, 2);
    assert.equal(result.length, 6);
    const used = result.flatMap((g) => [...g.a, ...g.b]);
    assert.equal(new Set(used).size, 24);
    const previous = new Set(
      initialGames.flatMap((g) => [g.a, g.b]).map((p) => p.sort().join('|')),
    );
    for (const g of result)
      for (const pair of [g.a, g.b]) {
        assert(!previous.has([...pair].sort().join('|')));
        const ps = pair.map((id) => initialPlayers.find((p) => p.id === id));
        assert.equal(ps[0].side, 'Esquerda');
        assert.equal(ps[1].side, 'Direita');
        assert(ps.every((p) => p.division === g.division));
      }
  }
});
test('Número incompatível e ausência de combinações falham claramente', () => {
  assert.throws(
    () =>
      draw(
        initialPlayers.filter((p) => p.id !== 'p0'),
        initialGames,
        2,
      ),
    /grupos de 4/,
  );
  const players = initialPlayers.slice(0, 4);
  const blocked = [
    { ...initialGames[0], a: ['p0', 'p1'], b: ['p2', 'p3'] },
    { ...initialGames[0], a: ['p0', 'p3'], b: ['p2', 'p1'] },
  ];
  assert.throws(() => draw(players, blocked, 2), /não existe sorteio/);
});
test('3, 7, 11, 15 pontos em sequências de vitória e 1 na derrota', () => {
  const games = Array.from({ length: 4 }, (_, i) => ({
    ...initialGames[0],
    id: `t${i}`,
    date: `2026-09-${String(1 + i * 7).padStart(2, '0')}`,
    winner: 'a',
  }));
  for (let n = 1; n <= 4; n++)
    assert.equal(
      rankings(initialPlayers, games.slice(0, n)).find((p) => p.id === 'p0')
        .points,
      [3, 7, 11, 15][n - 1],
    );
  games[2].winner = 'b';
  const p = rankings(initialPlayers, games).find((p) => p.id === 'p0');
  assert.equal(p.points, 11);
  assert.equal(p.bonus, 1);
  assert.equal(p.losses, 1);
});
test('Desempate por nascimento, um líder por divisão, mês isolado', () => {
  const r = rankings(initialPlayers, initialGames);
  assert.equal(r.filter((p) => p.division === 'M1+')[0].id, 'p0');
  assert(
    rankings(initialPlayers, initialGames, '2026-10').every(
      (p) => p.points === 0,
    ),
  );
});
test('Sobreposições são detetadas e horários adjacentes aceites', () => {
  const g = initialGames[0];
  assert(conflict({ ...g, id: 'other', time: '18:30' }, [g]));
  assert(!conflict({ ...g, id: 'other', time: '19:30' }, [g]));
  assert(conflict({ ...g, id: 'other', court: 'c9' }, [g]));
  assert(!conflict({ ...g, id: 'other', date: '2026-09-06' }, [g]));
});
test('Correção recalcula pontos sem os duplicar', () => {
  const games = initialGames.map((g) => ({ ...g }));
  const before = rankings(initialPlayers, games).find((p) => p.id === 'p0');
  games[0].winner = 'b';
  const after = rankings(initialPlayers, games).find((p) => p.id === 'p0');
  assert.equal(before.points, 3);
  assert.equal(after.points, 1);
  assert.equal(after.wins, 0);
});
