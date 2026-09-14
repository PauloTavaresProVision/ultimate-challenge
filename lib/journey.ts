export type Journey = {
  id: string;
  division: 'M1+' | 'M1' | 'M2+' | 'M2';
  date: string;
  time: string;
  capacity: number;
  courtIds: string[];
  group: string;
  status: 'open' | 'closed' | 'drawn';
  confirmed: string[];
  waiting: string[];
  announcementId: string;
};
export function journeyIntent(text: string) {
  const s = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (/\?|\b(talvez|se|ele|ela)\b/.test(s)) return null;
  if (
    /^(?:eu )?(?:nao posso ir|quero sair|cancela a minha inscricao|desisto)(?:\s+jornada\s+[a-f0-9]+)?[.!]?$/.test(
      s,
    )
  )
    return 'leave';
  if (
    /^(?:eu )?(?:quero entrar|quero participar|quero jogar|inscreve-me|inscreve me|conta comigo)(?:\s+jornada\s+[a-f0-9]+)?[.!]?$/.test(
      s,
    )
  )
    return 'join';
  return null;
}
export function enrol(j: Journey, id: string, action: 'join' | 'leave') {
  if (action === 'join') {
    if (j.confirmed.includes(id)) return 'Já estás confirmado.';
    if (j.waiting.includes(id))
      return `Já estás na lista de espera, posição ${j.waiting.indexOf(id) + 1}.`;
    if (j.confirmed.length < j.capacity) {
      j.confirmed.push(id);
      return `Estás confirmado! ${j.confirmed.length}/${j.capacity} vagas preenchidas.`;
    }
    j.waiting.push(id);
    return `Ficaste em lista de espera, posição ${j.waiting.length}.`;
  }
  if (!j.confirmed.includes(id) && !j.waiting.includes(id))
    return 'Não estavas inscrito nesta jornada.';
  j.confirmed = j.confirmed.filter((p) => p !== id);
  j.waiting = j.waiting.filter((p) => p !== id);
  return 'A tua participação foi cancelada.';
}
