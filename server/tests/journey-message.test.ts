import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  journeyAnnouncement,
  defaultJourneyMessage,
} from '../../lib/journey-message.ts';
const j = {
  id: 'abcdef123456',
  division: 'M1',
  date: '2026-09-15',
  time: '18:00',
  capacity: 12,
};
test('Custom announcement substitutes all values and preserves mandatory instructions', () => {
  const text = journeyAnnouncement(
    'Vamos jogar!\n{divisao}: {data} {hora}, {vagas} vagas no {local}.',
    j,
  );
  assert.equal(
    text,
    'Vamos jogar!\nM1: 15/09/2026 18:00, 12 vagas no Premier Padel Club.\n\nPara garantires a tua vaga, responde a esta mensagem com “quero entrar”.\nSe depois não puderes vir, responde com “quero sair”.',
  );
});
test('Default template and repeated placeholders render without evaluating arbitrary text', () => {
  assert.ok(
    journeyAnnouncement(defaultJourneyMessage, j).includes(
      'M1 — vamos jogar?',
    ),
  );
  assert.ok(
    journeyAnnouncement('{vagas} / {vagas} {desconhecida}', {
      ...j,
      capacity: 16,
    }).startsWith('16 / 16 {desconhecida}'),
  );
});

test('Internal identifiers never appear in the announcement',()=>{assert.ok(!journeyAnnouncement(defaultJourneyMessage,j).includes(j.id));});
