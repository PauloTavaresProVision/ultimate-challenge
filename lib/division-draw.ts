import {
  draw,
  weeklySchedule,
  conflict,
  type Player,
  type Court,
  type Game,
  type Division,
} from './tournament.ts';
export type DrawPlan = {
  division: Division;
  date: string;
  time: string;
  sides: Record<string, Player['side']>;
  courtIds: string[];
};
export function prepareDivisionDraw(
  plan: DrawPlan,
  players: Player[],
  courts: Court[],
  games: Game[],
  rng = Math.random,
) {
  const selected = Object.entries(plan.sides).map(([id, side]) => {
    const p = players.find((p) => p.id === id);
    if (
      !p ||
      !p.verified ||
      p.status !== 'Ativo' ||
      p.division !== plan.division
    )
      throw Error('Seleciona apenas jogadores aprovados desta divisão.');
    return { ...p, side };
  });
  if (selected.length < 8 || selected.length % 4)
    throw Error(
      'Seleciona 8, 12, 16… jogadores. São necessários pelo menos dois campos para rodar.',
    );
  if (
    selected.filter((p) => p.side === 'Esquerda').length !==
    selected.length / 2
  )
    throw Error('Equilibra o número de jogadores à esquerda e à direita.');
  if (
    new Set(plan.courtIds).size !== plan.courtIds.length ||
    plan.courtIds.length !== selected.length / 4
  )
    throw Error(`Seleciona exatamente ${selected.length / 4} campos.`);
  const chosen = plan.courtIds.map((id) =>
    courts.find((c) => c.id === id && c.active),
  );
  if (chosen.some((c) => !c)) throw Error('Seleciona apenas campos ativos.');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(plan.date) ||
    !Number.isFinite(Date.parse(plan.date))
  )
    throw Error('Indica uma data válida.');
  const own = games.filter((g) => g.division === plan.division);
  const round =
    own.find((g) => !g.published)?.round ??
    Math.max(0, ...own.map((g) => g.round)) + 1;
  const replaced = own.filter((g) => g.round === round);
  if (replaced.some((g) => g.published || g.winner))
    throw Error('Não é permitido refazer uma ronda publicada.');
  const previous = own.filter((g) => g.round < round);
  if (previous.some((g) => !g.winner))
    throw Error('Conclui os resultados anteriores desta divisão.');
  if (
    previous.some(
      (g) => Date.parse(plan.date) - Date.parse(g.date) < 7 * 86400000,
    )
  )
    throw Error(
      'Deixa pelo menos sete dias desde a ronda anterior desta divisão.',
    );
  const retained = games.filter(
    (g) => g.division !== plan.division || g.round !== round,
  );
  const generated = weeklySchedule(
    draw(selected, previous, round, rng),
    chosen as Court[],
    round,
    plan.date,
    plan.time,
  );
  if (generated.some((g) => conflict(g, [...retained, ...generated])))
    throw Error(
      'Um dos campos já está ocupado neste horário. Escolhe outros campos ou outra hora.',
    );
  return { games: [...retained, ...generated], generated, round };
}
