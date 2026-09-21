import {useEffect,useState} from 'react';
import {Button} from './ui/button';
import {api} from './whatsapp-live';

export default function AIResponseControl(){
  const [enabled,setEnabled]=useState<boolean|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    const refresh=()=>api<{enabled:boolean}>('/admin/bot').then(r=>{if(active){setEnabled(r.enabled);setError('');}}).catch(e=>{if(active)setError(e.message);});
    void refresh();
    const timer=setInterval(refresh,15000);
    return()=>{active=false;clearInterval(timer);};
  },[busy]);
  return <section className="wa-card" aria-label="Respostas da IA">
    <header className="wa-card-heading"><div>
      <h2>{enabled===null?'Respostas da IA':enabled?'IA a responder no grupo':'Respostas da IA pausadas'}</h2>
      <p>Ao pausar, a IA deixa de responder e de tratar inscrições pelas mensagens do grupo. Convites, códigos e publicação dos sorteios continuam disponíveis.</p>
    </div></header>
    <Button disabled={busy||enabled===null} variant={enabled?'outline':'default'} onClick={async()=>{
      setBusy(true);setError('');
      try{const r=await api<{enabled:boolean}>('/admin/bot','PUT',{enabled:!enabled});setEnabled(r.enabled);}
      catch(e){setError((e as Error).message);}
      finally{setBusy(false);}
    }}>{busy?'A guardar…':enabled===false?'Retomar respostas da IA':'Pausar respostas da IA'}</Button>
    <p className="wa-footnote">Uma resposta já em envio pode concluir. As respostas pendentes são canceladas e não voltam a sair ao retomar.</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
  </section>;
}
