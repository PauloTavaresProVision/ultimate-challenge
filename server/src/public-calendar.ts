import {db} from './db.ts';
export async function publicCalendar(){
 const row=await db.setting.findUnique({where:{key:'weekly-calendar'}});
 const value=row?JSON.parse(row.value):{weekday:null,time:null};
 const days=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
 return {day:Number.isInteger(value.weekday)&&value.weekday>=0&&value.weekday<7?days[value.weekday]:null,time:value.time??null,location:'Premier Padel Club',timezone:'Africa/Luanda'};
}
