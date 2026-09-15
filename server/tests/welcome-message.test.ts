import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activeWelcomeJourneys,welcomeText} from '../src/welcome-message.ts';
import type {Journey} from '../../lib/journey.ts';
const player={name:'Carlos',division:'M1',side:'Direita'};
const base:Journey={id:'one',group:'group',division:'M1',date:'2026-09-22',time:'20:00',capacity:16,confirmed:['a','b'],waiting:[],courtIds:[],status:'open',announcementId:'out'};
test('Welcome lists only future open journeys for the player division and selected group',()=>{
 const all=[base,{...base,id:'other-division',division:'M2' as const},{...base,id:'other-group',group:'other'},{...base,id:'closed',status:'closed' as const},{...base,id:'past',date:'2026-09-01'},{...base,id:'later',date:'2026-09-29'}];
 const active=activeWelcomeJourneys(all,'group','M1',Date.parse('2026-09-15T12:00:00Z'));
 assert.deepEqual(active.map(j=>j.id),['one','later']);
 const text=welcomeText(player,'https://example.com/',active);
 assert.match(text,/22\/09\/2026 às 20:00/);assert.match(text,/29\/09\/2026/);assert.match(text,/14 vagas livres/);assert.match(text,/https:\/\/example.com\/regras/);assert.doesNotMatch(text,/mostrar serviço/);
});
test('Full journeys offer a waiting list and never negative vacancies',()=>{
 const text=welcomeText(player,'https://example.com',[{...base,capacity:1}]);
 assert.match(text,/lista de espera aberta/);assert.doesNotMatch(text,/-1/);
});
test('No open journeys gives an honest message without a fabricated date',()=>{
 const text=welcomeText(player,'https://example.com');
 assert.match(text,/não há inscrições abertas/);assert.doesNotMatch(text,/📅/);assert.match(text,/direita/);
});
