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
 return <section aria-label="Alterar campos" className="panel">
  <h3>Campos desta jornada</h3>
  <p>Escolhe onde se joga. A alteração aplica-se a todos os jogos do campo escolhido, mantendo as duplas e os horários.</p>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:20,margin:'24px 0'}}>
   {used.map(id=><label key={id} style={{display:'grid',gap:8}}>
    <strong>{courts.find(c=>c.id===id)?.name??id}</strong>
    <span>{games.filter(g=>g.court===id).map(g=>g.time).join(' · ')}</span>
    <select aria-label={`Novo campo para ${courts.find(c=>c.id===id)?.name??id}`} disabled={busy} value={mapping[id]??id} onChange={e=>{setMapping({...mapping,[id]:e.target.value});setSaved(false);}}>
     {courts.filter(c=>c.active||c.id===id).map(c=><option key={c.id} value={c.id}>{c.name}{c.location?' · '+c.location:''}</option>)}
    </select>
   </label>)}
  </div>
  {error&&<p role="alert" className="form-error">{error}</p>}
  {saved&&<p role="status">Campos guardados. Os jogadores já podem consultar os novos campos no link dos jogos. Para avisar o grupo, usa «Reenviar convocatória» acima.</p>}
  {games.some(g=>g.winner)&&<p>Esta jornada já tem resultados. Os campos não podem ser alterados aqui.</p>}
  <Button disabled={busy||!changed||saved||games.some(g=>!!g.winner)} onClick={save}>{busy?'A guardar…':'Guardar campos'}</Button>
 </section>;
}
