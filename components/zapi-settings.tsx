import {useEffect,useState} from 'react';
import {api} from './whatsapp-live';
import {Button} from './ui/button';
import {Input} from './ui/input';
export default function ZApiSettings(){
 const [instanceId,setInstance]=useState(''),[token,setToken]=useState(''),[clientToken,setClientToken]=useState('');
 const [configured,setConfigured]=useState(false),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let active=true;void api<{configured:boolean;instanceId:string}>('/admin/whatsapp/zapi').then(r=>{if(active){setConfigured(r.configured);setInstance(r.instanceId);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 return <section className="wa-card"><header className="wa-card-heading"><div><h2>Conta Z-API</h2><p>{configured?'Credenciais guardadas. Os tokens não são apresentados.':'Liga a instância que criaste no painel Z-API.'}</p></div></header>
 <form className="wa-test-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');setNote('');try{await api('/admin/whatsapp/zapi','POST',{instanceId,token,clientToken});setToken('');setClientToken('');setConfigured(true);setNote('Credenciais guardadas. Testa o acesso antes de ligar.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
 <label>ID da instância<Input value={instanceId} onChange={e=>setInstance(e.target.value)} required autoComplete="off"/></label>
 <label>Token da instância<Input type="password" value={token} onChange={e=>setToken(e.target.value)} required autoComplete="new-password"/></label>
 <label>Client-Token · segurança da conta<Input type="password" value={clientToken} onChange={e=>setClientToken(e.target.value)} required autoComplete="new-password"/></label>
 <div className="wa-test-footer"><Button disabled={busy} type="submit">Guardar credenciais</Button><Button type="button" variant="outline" disabled={busy||!configured} onClick={async()=>{setBusy(true);setError('');try{const r=await api<{connected:boolean}>('/admin/whatsapp/zapi/test','POST');setNote(r.connected?'Acesso confirmado. A instância já tem WhatsApp associado.':'Acesso confirmado. A instância aguarda associação.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Testar acesso</Button></div>
 <p className="wa-footnote">Ao ligar, a plataforma configura os webhooks desta instância. Usa uma instância dedicada ao torneio. O teste de acesso não envia mensagens.</p>
 {note&&<p role="status">{note}</p>}{error&&<p className="form-error" role="alert">{error}</p>}
 </form></section>;
}
