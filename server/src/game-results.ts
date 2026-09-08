type ResultGame = { published: boolean; a: string[]; b: string[]; winner: string | null; date: string };
export function resultWinner(game: ResultGame | null, playerId: string, outcome: 'win' | 'loss', today: string) {
  const reject = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };
  if (!game || !game.published) return reject(404, 'Jogo não disponível.');
  const team = game.a.includes(playerId) ? 'a' : game.b.includes(playerId) ? 'b' : null;
  if (!team) return reject(403, 'Só podes registar resultados dos teus jogos.');
  if (game.winner) return reject(409, 'Este jogo já tem resultado. Para corrigir, contacta a organização.');
  if (game.date > today) return reject(409, 'O resultado só pode ser registado a partir do dia do jogo.');
  return outcome === 'win' ? team : team === 'a' ? 'b' : 'a';
}
