import {useEffect,useState} from 'react';
import {api} from './whatsapp-live';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {divisions} from '../lib/tournament';
import {weekdayNames,type WeeklyCalendar} from '../lib/weekly-calendar';
export default function CalendarSettings(){
 const [data,setData]=useState<WeeklyCalendar|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
 useEffect(()=>{api<WeeklyCalendar>('/admin/calendar').then(setData).catch(e=>setError(e.message));},[]);
 return <section className="panel"><h2>Calendário por divisão</h2><p>Ativa as divisões que vão jogar e escolhe o dia e a hora de Angola. Uma divisão desativada não aparece no calendário das regras. Local: Premier Padel Club.</p>{data&&<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');setNote('');try{setData(await api<WeeklyCalendar>('/admin/calendar','PUT',data));setNote('Calendário guardado. Será usado nas próximas rondas.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
 <div className="division-calendar">{divisions.map(d=><div className="division-calendar-row" key={d}><div className="division-calendar-toggle"><strong>{d}</strong><label><input type="checkbox" checked={data.divisions[d].enabled!==false} disabled={busy} onChange={e=>{setData({...data,divisions:{...data.divisions,[d]:{...data.divisions[d],enabled:e.target.checked}}});setNote('');}}/>Ativar ronda</label></div><label>Dia da semana<select disabled={busy||data.divisions[d].enabled===false} value={data.divisions[d].weekday} onChange={e=>{setData({...data,divisions:{...data.divisions,[d]:{...data.divisions[d],weekday:Number(e.target.value)}}});setNote('');}}>{[1,2,3,4,5,6,0].map(day=><option key={day} value={day}>{weekdayNames[day]}</option>)}</select></label><label>Hora de início<Input type="time" required disabled={busy||data.divisions[d].enabled===false} value={data.divisions[d].time} onChange={e=>{setData({...data,divisions:{...data.divisions,[d]:{...data.divisions[d],time:e.target.value}}});setNote('');}}/></label></div>)}</div>
 <p>Os jogos já criados mantêm a data e a hora. Divisões com o mesmo início partilham os campos em sessões sucessivas; confirma os horários no sorteio.</p><Button type="submit" disabled={busy}>{busy?'A guardar…':'Guardar calendário'}</Button></form>}{error&&<p className="form-error" role="alert">{error}</p>}{note&&<p role="status">{note}</p>}</section>;
}
