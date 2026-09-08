import {useEffect,useState} from 'react';
import {api} from './whatsapp-live';
import {Button} from './ui/button';
import {Input} from './ui/input';
export default function CalendarSettings(){
 const [data,setData]=useState<{weekday:number|null;time:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
 useEffect(()=>{api<{weekday:number|null;time:string}>('/admin/calendar').then(setData).catch(e=>setError(e.message));},[]);
 return <section className="panel"><h2>Calendário semanal</h2><p>Define o dia habitual e a hora de início dos jogos, na hora de Angola. Aplica-se às próximas rondas; os jogos já criados mantêm o horário.</p>{data&&<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');setNote('');try{await api('/admin/calendar','PUT',data);setNote('Calendário guardado.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><label className="field">Dia da semana<select required disabled={busy} value={data.weekday??''} onChange={e=>setData({...data,weekday:Number(e.target.value)})}><option value="" disabled>Selecionar dia</option>{['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'].map((day,i)=><option key={day} value={i}>{day}</option>)}</select></label><label className="field">Hora de início<Input type="time" required disabled={busy} value={data.time} onChange={e=>setData({...data,time:e.target.value})}/></label><p>Quatro jogos de 20 minutos por dupla. Podes ajustar a data e a hora antes de sortear cada ronda.</p><Button disabled={busy||data.weekday===null}>{busy?'A guardar…':'Guardar calendário'}</Button></form>}{error&&<p className="form-error" role="alert">{error}</p>}{note&&<p role="status">{note}</p>}</section>;
}
