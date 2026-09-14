export const defaultJourneyMessage =
  '🎾 Ultimate Challenge • {divisao}\n\nEstão abertas as inscrições para os próximos jogos!\n\n📅 {data}\n🕗 {hora}\n📍 {local}\n👥 {vagas} vagas disponíveis';
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
    '\n\nPara participar, responde a esta mensagem com «quero entrar». Recebes a confirmação da tua vaga ou da entrada na lista de espera.\n\nSe não puderes comparecer, responde «quero sair» para libertar a vaga.\n\n📣 Os jogos e os campos serão anunciados após o sorteio.'
  );
}
