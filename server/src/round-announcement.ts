type Game = { division: string; date: string; time: string; court: string; a: string[]; b: string[] };
type Player = { id: string; phone: string };
type Court = { id: string; location: string };

export function roundAnnouncement(games: Game[], players: Player[], courts: Court[], origin: string) {
  if (!games.length) throw new Error('Não há jogos para anunciar.');
  const sections = new Map<string, Game[]>();
  const mentions = new Set<string>();
  for (const game of [...games].sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))) {
    const key = `${game.division}:${game.date}`;
    sections.set(key, [...(sections.get(key) ?? []), game]);
  }
  const texts = [...sections.values()].map(group => {
    const first = group[0];
    const ids = [...new Set(group.flatMap(g => [...g.a, ...g.b]))];
    const tags = ids.map(id => {
      const player = players.find(p => p.id === id);
      if (!player || !/^\+[1-9]\d{7,14}$/.test(player.phone)) throw new Error('Jogador sem contacto válido para a convocatória.');
      const digits = player.phone.slice(1);
      mentions.add(`${digits}@s.whatsapp.net`);
      return `@${digits}`;
    });
    const locations = [...new Set(group.map(g => {
      const court = courts.find(c => c.id === g.court);
      if (!court?.location) throw new Error('Campo sem local para a convocatória.');
      return court.location;
    }))];
    return `🎾 *Ultimate Challenge · ${first.division}*\n\nO sorteio está feito! 🎾\n\n📅 *${first.date.split('-').reverse().join('/')}*\n🕗 *${first.time}*\n📍 *${locations.join(' · ')}*\n\n📣 *Jogadores convocados:*\n${tags.join('\n')}`;
  });
  return {
    format: 'mentioned-reply-v1',
    text: `${texts.join('\n\n')}\n\n🔎 *Consulta a tua dupla, os horários e os campos:*\n${origin.replace(/\/$/, '')}/jogos`,
    mentions: [...mentions],
  };
}
