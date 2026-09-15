import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCalendar,activeCalendarDivisions,nextRoundCalendar} from '../../lib/weekly-calendar.ts';
test('Legacy calendars keep every division; disabling M2 excludes it from public dates',()=>{
 const calendar=normalizeCalendar();assert.equal(activeCalendarDivisions(calendar).length,4);
 calendar.divisions.M2={weekday:1,time:'20:00',enabled:false};
 const saved=normalizeCalendar(JSON.parse(JSON.stringify(calendar)));
 assert.deepEqual(activeCalendarDivisions(saved),['M1+','M1','M2+']);
 const next=nextRoundCalendar(saved,[],'2026-09-15');
 assert.equal(next.M1.date,'2026-09-15');assert.equal(next.M2.enabled,false);
 saved.divisions.M2.enabled=true;assert.equal(activeCalendarDivisions(saved).length,4);
});
