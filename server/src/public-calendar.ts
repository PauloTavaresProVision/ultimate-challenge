import {db} from './db.ts';
import {normalizeCalendar,weekdayNames,activeCalendarDivisions} from '../../lib/weekly-calendar.ts';
export async function publicCalendar(){
 const row=await db.setting.findUnique({where:{key:'weekly-calendar'}});
 const value=normalizeCalendar(row?JSON.parse(row.value):null);
 return {divisions:activeCalendarDivisions(value).map(division=>({division,day:weekdayNames[value.divisions[division].weekday],time:value.divisions[division].time})),location:'Premier Padel Club',timezone:'Africa/Luanda'};
}
