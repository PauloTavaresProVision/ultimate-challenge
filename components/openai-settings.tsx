import {useEffect,useState} from 'react';
import {KeyRound,Check,PlugZap,Trash2} from 'lucide-react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {api} from './whatsapp-live';
type Test={ok:boolean;message:string;checkedAt:string};
type Status={configured:boolean;test:Test|null};
export default function OpenAISettings(){
 const [state,setState]=useState<Status|null>(null);const [key,setKey]=useState('');const [busy,setBusy]=useState('');const [error,setError]=useState('');const [note,setNote]=useState('');
 useEffect(()=>{let active=true;api<Status>('/admin/openai').then(s=>{if(active)setState(s);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 return <section className="wa-card"><header className="wa-card-heading"><div className="wa-icon"><KeyRound size={20}/></div><div><h2>OpenAI</h2><p>Guarda a tua chave e verifica a ligação.</p></div><span className="badge">{state?.configured?'Chave guardada':'Por configurar'}</span></header>
 <form onSubmit={async e=>{e.preventDefault();setBusy('save');setError('');setNote('');try{setState(await api<Status>('/admin/openai','PUT',{key}));setKey('');setNote('Chave guardada. Já podes testar a ligação.');}catch(e){setError((e as Error).message);}finally{setBusy('');}}}>
 <label className="wa-field" htmlFor="openai-secret">{state?.configured?'Substituir chave API':'Chave API'}<Input id="openai-secret" type="password" autoComplete="new-password" spellCheck={false} value={key} onChange={e=>setKey(e.target.value)} placeholder={state?.configured?'Introduz uma nova chave para substituir a atual':'Cola aqui a tua chave sk-…'} minLength={20} maxLength={512} required disabled={!!busy}/></label>
 <p className="wa-footnote">A chave fica cifrada no servidor e não volta a ser mostrada. Este teste verifica o acesso à OpenAI; não ativa respostas automáticas no WhatsApp nem confirma o saldo disponível.</p>
 <div className="wa-group-footer"><Button type="submit" disabled={!state||!!busy||!key.trim()}>{busy==='save'?'A guardar…':'Guardar chave'}</Button><div className="message-modes"><Button type="button" variant="outline" disabled={!state?.configured||!!busy||!!key} onClick={async()=>{setBusy('test');setError('');setNote('');try{const test=await api<Test>('/admin/openai/test','POST');setState(s=>s?{...s,test}:s);}catch(e){setError((e as Error).message);}finally{setBusy('');}}}><PlugZap size={15}/>{busy==='test'?'A testar…':'Testar ligação'}</Button><Button type="button" variant="ghost" disabled={!state?.configured||!!busy} onClick={async()=>{setBusy('delete');setError('');setNote('');try{setState(await api<Status>('/admin/openai','DELETE'));setKey('');setNote('Chave removida desta plataforma.');}catch(e){setError((e as Error).message);}finally{setBusy('');}}}><Trash2 size={15}/>Remover</Button></div></div></form>
 {note&&<p className="wa-success" role="status"><Check size={15}/>{note}</p>}{error&&<p className="form-error" role="alert">{error}</p>}{state?.test&&<p className={state.test.ok?'wa-success':'form-error'} role="status">{state.test.message} · {new Date(state.test.checkedAt).toLocaleString('pt-PT')}</p>}
 </section>;
}
