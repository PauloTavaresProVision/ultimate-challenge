export const defaultJourneyMessage =
  '🎾 {divisao} — vamos jogar?\n\n📅 {data}, às {hora}\n📍 {local}\n👥 Temos {vagas} vagas!';
export function journeyAnnouncement(
  template: string,
  j: {
    id: string;
    division: string;
    date: string;
    time: string;
    capacity: number;
  },
) {
  const values: Record<string, string> = {
    divisao: j.division,
    data: j.date.split('-').reverse().join('/'),
    hora: j.time,
    vagas: String(j.capacity),
    local: 'Premier Padel Club',
  };
  const text = template
    .trim()
    .replace(
      /\{(divisao|data|hora|vagas|local)\}/g,
      (_, key: string) => values[key],
    );
  return (
    text +
    '\n\nPara garantires a tua vaga, responde a esta mensagem com “quero entrar”.\nSe depois não puderes vir, responde com “quero sair”.'
  );
}
