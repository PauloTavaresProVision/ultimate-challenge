import {ArrowRight,ChevronDown,MapPin,Check} from 'lucide-react';
import {useState} from 'react';
import type {Game,Court} from '../lib/tournament';
import {api} from './whatsapp-live';
import {Button} from './ui/button';
export default function RoundCourts({games,courts}:{games:Game[];courts:Court[]}){
 const [mapping,setMapping]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const used=[...new Set(games.map(g=>g.court))];
 const changed=used.some(id=>(mapping[id]??id)!==id);
 async function save(){
  setBusy(true);setError('');setSaved(false);
  try{
   await api('/admin/round-courts','POST',{round:games[0].round,date:games[0].date,division:games[0].division,changes:games.map(g=>({id:g.id,from:g.court,to:mapping[g.court]??g.court}))});
   setMapping({});setSaved(true);window.dispatchEvent(new Event('tournament-updated'));
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const name=(id:string)=>courts.find(c=>c.id===id)?.name??id;
 const edits=used.filter(id=>(mapping[id]??id)!==id);
 return <section aria-label="Alterar campos" className="court-editor">
  <header className="court-editor-heading"><span className="court-editor-icon"><MapPin size={24}/></span><div><h3>Alterar campos</h3><p>Escolhe um novo campo para cada grupo de jogos.</p></div></header>
  <p className="court-editor-note"><Check size={17}/>As duplas e os horários mantêm-se.</p>
  <div className="court-editor-list">
   {used.map(id=><div key={id} className="court-editor-row" data-changed={(mapping[id]??id)!==id}>
    <div className="court-editor-current"><span className="court-editor-label">Campo atual</span><strong>{name(id)}</strong><small>{games.filter(g=>g.court===id).length} jogos · {[...new Set(games.filter(g=>g.court===id).map(g=>g.time))].join(' · ')}</small></div>
    <ArrowRight className="court-editor-arrow" size={22} aria-hidden="true"/>
    <label className="court-editor-choice"><span className="court-editor-label">Mudar para</span>
     <span className="court-editor-select"><select aria-label={`Novo campo para ${name(id)}`} disabled={busy} value={mapping[id]??id} onChange={e=>{setMapping({...mapping,[id]:e.target.value});setSaved(false);setError('');}}>
      {courts.filter(c=>c.active||c.id===id).map(c=><option key={c.id} value={c.id}>{c.id===id?'Manter — ':''}{c.name}</option>)}
     </select><ChevronDown size={20} aria-hidden="true"/></span>
     <small>{courts.find(c=>c.id===(mapping[id]??id))?.location}</small>
    </label>
   </div>)}
  </div>
  {changed&&<div className="court-editor-summary" aria-live="polite"><strong>Alterações por guardar</strong><ul>{edits.map(id=><li key={id}>{name(id)} <ArrowRight size={15} aria-hidden="true"/> <b>{name(mapping[id])}</b></li>)}</ul></div>}
  {error&&<p role="alert" className="form-error">{error}</p>}
  {saved&&<p role="status" className="rm-success">Campos guardados. Os novos campos já estão no link dos jogos. Para avisar o grupo, usa «Reenviar convocatória» acima.</p>}
  {games.some(g=>g.winner)&&<p>Esta jornada já tem resultados. Os campos não podem ser alterados aqui.</p>}
  <footer className="court-editor-footer"><span>{changed?`${edits.length} ${edits.length===1?'campo por alterar':'campos por alterar'}`:'Seleciona um novo campo nas caixas acima.'}</span><div>{changed&&<Button variant="outline" disabled={busy} onClick={()=>{setMapping({});setError('');}}>Descartar</Button>}<Button disabled={busy||!changed||saved||games.some(g=>!!g.winner)} onClick={save}>{busy?'A guardar…':'Guardar alterações'}</Button></div></footer>
 </section>;
}
