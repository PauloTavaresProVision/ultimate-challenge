import {db} from './db.ts';
import {normalizeCalendar,weekdayNames} from '../../lib/weekly-calendar.ts';
import {divisions} from '../../lib/tournament.ts';
export async function publicCalendar(){
 const row=await db.setting.findUnique({where:{key:'weekly-calendar'}});
 const value=normalizeCalendar(row?JSON.parse(row.value):null);
 return {divisions:divisions.map(division=>({division,day:weekdayNames[value.divisions[division].weekday],time:value.divisions[division].time})),location:'Premier Padel Club',timezone:'Africa/Luanda'};
}
