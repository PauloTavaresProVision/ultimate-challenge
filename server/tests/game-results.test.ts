import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultWinner } from '../src/game-results.ts';
const game = { published: true, a: ['a1', 'a2'], b: ['b1', 'b2'], winner: null, date: '2026-09-08' };
test('A win or loss maps to the correct winning team for every participant', () => {
  for (const p of game.a) { assert.equal(resultWinner(game, p, 'win', game.date), 'a'); assert.equal(resultWinner(game, p, 'loss', game.date), 'b'); }
  for (const p of game.b) { assert.equal(resultWinner(game, p, 'win', game.date), 'b'); assert.equal(resultWinner(game, p, 'loss', game.date), 'a'); }
});
test('Results reject outsiders, unpublished games, future games and overwrites', () => {
  assert.throws(() => resultWinner(game, 'outsider', 'win', game.date), { status: 403 });
  assert.throws(() => resultWinner({ ...game, published: false }, 'a1', 'win', game.date), { status: 404 });
  assert.throws(() => resultWinner({ ...game, winner: 'a' }, 'b1', 'win', game.date), { status: 409 });
  assert.throws(() => resultWinner(game, 'a1', 'win', '2026-09-07'), { status: 409 });
});
