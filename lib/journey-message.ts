export const defaultJourneyMessage =
  '🎾 {divisao} — inscrições abertas\n{data} às {hora} · {local}\n{vagas} vagas';
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
    '\n\nResponde a esta mensagem com “quero entrar”. Para desistir: “quero sair”.\nJornada ' +
    j.id
  );
}
