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
  assert.ok(text.startsWith('Vamos jogar!\nM1: 15/09/2026 18:00, 12 vagas no Premier Padel Club.'));
  assert.ok(text.includes('«quero entrar»'));
  assert.ok(text.includes('«quero sair»'));
  assert.ok(text.includes('Os jogos e os campos serão anunciados após o sorteio.'));

});
test('Default template and repeated placeholders render without evaluating arbitrary text', () => {
  assert.ok(
    journeyAnnouncement(defaultJourneyMessage, j).includes(
      'Ultimate Challenge • M1',
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
