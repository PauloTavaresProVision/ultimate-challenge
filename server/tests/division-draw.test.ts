import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDivisionDraw, type DrawPlan } from '../../lib/division-draw.ts';
import type { Player, Court } from '../../lib/tournament.ts';
const players: Player[] = Array.from({ length: 12 }, (_, i) => ({
  id: `p${i}`,
  name: `Jogador ${i}`,
  phone: '',
  birth: '1990-01-01',
  side: i < 4 ? 'Esquerda' : 'Direita',
  division: 'M1+',
  status: 'Ativo',
  verified: true,
  note: '',
}));
const courts: Court[] = Array.from({ length: 3 }, (_, i) => ({
  id: `c${i}`,
  name: `Campo ${i}`,
  location: 'Premier',
  active: true,
}));
const plan: DrawPlan = {
  division: 'M1+',
  date: '2026-10-06',
  time: '18:00',
  sides: Object.fromEntries(
    players.map((p, i) => [p.id, i < 6 ? 'Esquerda' : 'Direita']),
  ),
  courtIds: courts.map((c) => c.id),
};
test('12 players use three courts, four games and stable round sides without changing profiles', () => {
  const before = JSON.stringify(players);
  const { generated } = prepareDivisionDraw(
    plan,
    players,
    courts,
    [],
    () => 0.42,
  );
  assert.equal(generated.length, 12);
  assert.equal(JSON.stringify(players), before);
  for (const p of players) {
    const own = generated
      .filter((g) => [...g.a, ...g.b].includes(p.id))
      .sort((a, b) => a.time.localeCompare(b.time));
    assert.equal(own.length, 4);
    let pair = '';
    for (let i = 0; i < own.length; i++) {
      const g = own[i],
        team = g.a.includes(p.id) ? g.a : g.b;
      assert.equal(plan.sides[team[0]], 'Esquerda');
      assert.equal(plan.sides[team[1]], 'Direita');
      if (i) {
        assert.equal(team.join(','), pair);
        assert.notEqual(g.court, own[i - 1].court);
      }
      pair = team.join(',');
    }
    assert.equal(own[3].time, '19:00');
  }
});
test('rejects imbalance and incorrect court count', () => {
  assert.throws(
    () =>
      prepareDivisionDraw(
        {
          ...plan,
          sides: Object.fromEntries(players.map((p) => [p.id, p.side])),
        },
        players,
        courts,
        [],
      ),
    /Equilibra/,
  );
  assert.throws(
    () =>
      prepareDivisionDraw(
        { ...plan, courtIds: ['c0', 'c1'] },
        players,
        courts,
        [],
      ),
    /3 campos/,
  );
});
test('preserves another division and detects occupied courts', () => {
  const other = {
    id: 'other',
    round: 1,
    division: 'M2' as const,
    a: ['x', 'y'],
    b: ['z', 'w'],
    court: 'c0',
    date: '2026-10-07',
    time: '18:00',
    duration: 20,
    winner: null,
    published: true,
  };
  assert.deepEqual(
    prepareDivisionDraw(plan, players, courts, [other]).games[0],
    other,
  );
  assert.throws(
    () =>
      prepareDivisionDraw(plan, players, courts, [
        { ...other, date: plan.date },
      ]),
    /ocupado/,
  );
});
