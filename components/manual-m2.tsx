import {useState} from 'react';
import {api} from './whatsapp-live';
import {Button} from './ui/button';
type Plan={month:string;revision:number;changes:{id:string;name:string;position:number;points:number}[]};
export default function ManualM2(){
 const [plan,setPlan]=useState<Plan|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
 return <section className="panel"><h2>Descida manual · 20 últimos do M2+</h2><p>Revê os 20 últimos da classificação mensal, independentemente do lado. Os pontos mantêm-se. Esta exceção só é aplicada uma vez, após a tua confirmação.</p><p>Esta ação altera apenas estes jogadores de M2+ para M2. As restantes trocas continuam sujeitas ao calendário automático. Não envia mensagens ao WhatsApp.</p>
 {error&&<p className="form-error" role="alert">{error}</p>}
 {done?<p role="status">Os 20 jogadores passaram para M2. Alteração registada no histórico.</p>:<>
 <Button disabled={busy} variant="outline" onClick={async()=>{setBusy(true);setError('');setPlan(null);try{setPlan(await api<Plan>('/admin/competition/manual-m2'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'A processar…':'Rever os 20 jogadores'}</Button>
 {plan&&<><h3>Classificação de {plan.month} · M2+ → M2</h3><div className="table-scroll"><table><thead><tr><th>Posição M2+</th><th>Jogador</th><th>Pontos</th></tr></thead><tbody>{plan.changes.map(p=><tr key={p.id}><td>{p.position}</td><td>{p.name}</td><td>{p.points}</td></tr>)}</tbody></table></div><Button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await api('/admin/competition/manual-m2','POST',{revision:plan.revision,ids:plan.changes.map(p=>p.id)});setDone(true);setPlan(null);window.dispatchEvent(new Event('tournament-updated'));}catch(e){setError((e as Error).message);setPlan(null);}finally{setBusy(false);}}}>Confirmar descida destes 20 jogadores</Button></>}
 </>}
 </section>;
}
