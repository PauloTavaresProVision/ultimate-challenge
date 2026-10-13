import {useEffect,useRef,useState} from 'react';
import {Send,Smile,Search,Bold,Italic,List,Users,X} from 'lucide-react';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import {Input} from './ui/input';
import {api} from './whatsapp-live';
type Player={id:string;name:string;division:string};
type Journey={id:string;division:string;date:string;time:string;confirmed:string[];waiting:string[]};
type Entry={id:string;text:string;names:string[];createdAt:string;status:string;reason?:string};
type Data={group:string|null;players:Player[];journeys:Journey[];history:Entry[]};
type Draft={text:string;playerIds:string[];request?:string};
const empty:Draft={text:'',playerIds:[]};
const statuses:Record<string,string>={pending:'Na fila',sending:'A enviar',sent:'Enviada · entrega não confirmada',provider_queued:'Em fila na Z-API',accepted:'Aceite pelo WhatsApp',delivered:'Entregue',read:'Lida',failed:'Falhou',uncertain:'Sem confirmação de envio',expired:'Expirada',cancelled:'Cancelada'};
const emojis=[['🎾','Ténis'],['🏆','Troféu'],['🥇','Medalha'],['📅','Calendário'],['🕗','Hora'],['📍','Local'],['👥','Jogadores'],['📣','Anúncio'],['✅','Confirmado'],['⏳','Espera'],['👏','Palmas'],['💪','Força'],['👍','Aprovação'],['🙏','Obrigado'],['😄','Sorriso'],['😂','Riso'],['🍻','Cervejas'],['🦑','Choco']];
function Preview({text}:{text:string}){
 return <>{text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part,i)=>part.startsWith('*')&&part.endsWith('*')?<strong key={i}>{part.slice(1,-1)}</strong>:part.startsWith('_')&&part.endsWith('_')?<em key={i}>{part.slice(1,-1)}</em>:<span key={i}>{part}</span>)}</>;
}
export default function GroupComposer({group,groupName,connected,paused}:{group:string;groupName:string;connected:boolean;paused:boolean}){
 const storage='wa-compose:'+group;
 const [draft,setDraft]=useState<Draft>(empty),[loaded,setLoaded]=useState(false);
 const [data,setData]=useState<Data|null>(null),[search,setSearch]=useState(''),[emojiOpen,setEmojiOpen]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
 const editor=useRef<HTMLTextAreaElement>(null),sending=useRef(false);
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(storage)??'null');if(saved&&typeof saved.text==='string'&&Array.isArray(saved.playerIds))setDraft(saved);}catch{}setLoaded(true);},[storage]);
 useEffect(()=>{if(loaded)try{localStorage.setItem(storage,JSON.stringify(draft));}catch{setError('Não foi possível guardar o rascunho neste navegador.');}},[draft,loaded,storage]);
 async function refresh(){setData(await api<Data>('/admin/group-compose'));}
 useEffect(()=>{let active=true;const poll=async()=>{try{const result=await api<Data>('/admin/group-compose');if(active)setData(result);}catch(e){if(active)setError((e as Error).message);}};void poll();const timer=setInterval(poll,5000);return()=>{active=false;clearInterval(timer);};},[]);
 const locked=busy||!!draft.request;
 const selected=data?.players.filter(p=>draft.playerIds.includes(p.id))??[];
 const searchKey=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const visible=data?.players.filter(p=>searchKey(p.name+' '+p.division).includes(searchKey(search)))??[];
 function add(ids:string[]){const available=ids.filter(id=>data?.players.some(p=>p.id===id));if(new Set([...draft.playerIds,...available]).size>100)setNote('Foram selecionados os primeiros 100 jogadores. Podes ajustar a seleção.');setDraft(d=>({...d,playerIds:[...new Set([...d.playerIds,...available])].slice(0,100)}));}
 function insert(value:string,wrap=false){const el=editor.current;if(!el)return;const start=el.selectionStart,end=el.selectionEnd;const chunk=wrap?value+draft.text.slice(start,end)+value:value;setDraft(d=>({...d,text:(d.text.slice(0,start)+chunk+d.text.slice(end)).slice(0,4000)}));requestAnimationFrame(()=>{el.focus();el.setSelectionRange(start+chunk.length,start+chunk.length);});}
 async function send(){
  if(sending.current)return;sending.current=true;setBusy(true);setError('');setNote('');
  const pending={...draft,request:draft.request??crypto.randomUUID()};setDraft(pending);
  try{
   localStorage.setItem(storage,JSON.stringify(pending));
   const result=await api<{id:string;status:string}>('/admin/group-compose','POST',{id:pending.request,group,text:pending.text,playerIds:pending.playerIds});
   setDraft(empty);localStorage.removeItem(storage);setNote(result.status==='pending'?'Mensagem colocada na fila. Acompanha o envio no histórico.':'Envio já registado: '+(statuses[result.status]??result.status));await refresh();
  }catch(e){setError((e as Error).message+' Usa “Verificar envio” para repetir a consulta com o mesmo identificador, sem duplicar a mensagem.');}
  finally{sending.current=false;setBusy(false);}
 }
 return <div className="group-compose">
 <section className="wa-card"><header className="wa-card-heading"><div className="wa-icon"><Send size={20}/></div><div><h2>Enviar ao grupo</h2><p>Escreve um recado para os jogadores.</p></div></header>
 <div className="gc-destination"><Users size={20}/><div><small>DESTINATÁRIO</small><strong>{groupName}</strong></div><span>{paused?'Envios pausados':connected?'WhatsApp ligado':'WhatsApp desligado'}</span></div>
 {(paused||!connected)&&<p role="status" className="gc-notice">Podes colocar a mensagem na fila. Será enviada quando a ligação e os envios estiverem ativos. Expira ao fim de 24 horas.</p>}
 <div className="gc-layout"><div className="gc-editor"><label htmlFor="group-message">Mensagem</label>
 <div className="gc-toolbar"><Button type="button" variant="ghost" size="sm" disabled={locked} onClick={()=>insert('*',true)} aria-label="Negrito"><Bold size={16}/></Button><Button type="button" variant="ghost" size="sm" disabled={locked} onClick={()=>insert('_',true)} aria-label="Itálico"><Italic size={16}/></Button><Button type="button" variant="ghost" size="sm" disabled={locked} onClick={()=>insert('\n- ')} aria-label="Adicionar lista"><List size={16}/></Button><Button type="button" variant="ghost" size="sm" disabled={locked} onClick={()=>setEmojiOpen(!emojiOpen)} aria-expanded={emojiOpen}><Smile size={16}/>Emojis</Button></div>
 {emojiOpen&&<div className="gc-emojis" aria-label="Escolher emoji">{emojis.map(([emoji,label])=><button type="button" key={emoji} aria-label={label} title={label} disabled={locked} onClick={()=>insert(emoji)}>{emoji}</button>)}</div>}
 <Textarea ref={editor} id="group-message" rows={9} maxLength={4000} value={draft.text} disabled={locked} placeholder="Escreve aqui a mensagem para o grupo…" onChange={e=>setDraft(d=>({...d,text:e.target.value}))}/><div className="gc-caption"><span>Rascunho guardado neste navegador</span><span>{draft.text.length}/4000</span></div>
 <details className="gc-mentions"><summary>Mencionar jogadores <span>{draft.playerIds.length} selecionados</span></summary>
 <label htmlFor="gc-search">Pesquisar jogador</label><div className="gc-search"><Search size={16}/><Input id="gc-search" placeholder="Nome ou nível…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
 <div className="gc-shortcuts">{['M1+','M1','M2+','M2'].map(division=><Button type="button" key={division} size="sm" variant="outline" disabled={locked||!data} onClick={()=>add(data!.players.filter(p=>p.division===division).map(p=>p.id))}>{division}</Button>)}<Button type="button" variant="ghost" size="sm" disabled={locked} onClick={()=>setDraft(d=>({...d,playerIds:[]}))}>Limpar seleção</Button></div>
 {!!data?.journeys.length&&<select aria-label="Selecionar inscritos de uma jornada" disabled={locked} value="" onChange={e=>{const [id,kind]=e.target.value.split('|');const j=data.journeys.find(j=>j.id===id);if(j)add(kind==='waiting'?j.waiting:j.confirmed);}}><option value="">Selecionar por jornada…</option>{data.journeys.flatMap(j=>['confirmed','waiting'].map(kind=><option key={j.id+kind} value={j.id+'|'+kind}>{j.division} · {j.date.split('-').reverse().join('/')} · {j.time} · {kind==='waiting'?'Suplentes':'Confirmados'}</option>))}</select>}
 <div className="gc-player-list">{visible.map(p=><label key={p.id}><input type="checkbox" disabled={locked||(!draft.playerIds.includes(p.id)&&draft.playerIds.length>=100)} checked={draft.playerIds.includes(p.id)} onChange={e=>e.target.checked?add([p.id]):setDraft(d=>({...d,playerIds:d.playerIds.filter(id=>id!==p.id)}))}/><span>{p.name}</span><small>{p.division}</small></label>)}{!visible.length&&<p>Nenhum jogador encontrado.</p>}</div><small>Até 100 menções por mensagem. Só aparecem jogadores ativos com WhatsApp validado.</small></details>
 <div className="gc-selected">{selected.map(p=><button type="button" key={p.id} disabled={locked} onClick={()=>setDraft(d=>({...d,playerIds:d.playerIds.filter(id=>id!==p.id)}))} aria-label={'Remover menção de '+p.name}>@{p.name}<X size={12}/></button>)}</div>
 </div><aside className="gc-preview"><h3>Pré-visualização</h3><div className="gc-bubble">{!!selected.length&&<p className="gc-preview-mentions">{selected.map(p=>'@'+p.name).join(' ')}</p>}<Preview text={draft.text||'A tua mensagem aparece aqui.'}/></div><p>As menções identificam os contactos no WhatsApp. O aspeto dos emojis pode variar consoante o telemóvel.</p></aside></div>
 {error&&<p role="alert" className="form-error">{error}</p>}{note&&<p role="status" className="wa-success">{note}</p>}
 <footer className="gc-actions"><span>Envios manuais com intervalo mínimo de 5 segundos.</span><Button disabled={!loaded||!data||data.group!==group||!draft.text.trim()||busy} onClick={send}><Send size={16}/>{busy?'A registar…':draft.request?'Verificar envio':'Enviar para o grupo'}</Button></footer>
 {draft.request&&<Button variant="ghost" disabled={busy} onClick={()=>{setDraft(d=>({...d,request:undefined}));setError('Antes de enviar novamente, verifica no histórico se a mensagem anterior foi registada.');}}>Voltar à edição</Button>}
 </section>
 <section className="wa-card"><header className="wa-card-heading"><div><h2>Histórico de envios</h2><p>Últimas 30 mensagens manuais para este grupo</p></div></header>
 {!data?.history.length?<p>Ainda não há mensagens manuais neste grupo.</p>:<div className="gc-history">{data.history.map(m=><article key={m.id}><header><time>{new Date(m.createdAt).toLocaleString('pt-PT',{timeZone:'Africa/Luanda'})}</time><strong>{statuses[m.status]??m.status}</strong></header>{!!m.names.length&&<p className="gc-preview-mentions">{m.names.map(n=>'@'+n).join(' ')}</p>}<p className="gc-history-text">{m.text}</p>{['uncertain','failed'].includes(m.status)&&<p>{m.reason??'Não há confirmação de entrega. Verifica no WhatsApp antes de criar outro envio.'}</p>}<div className="gc-shortcuts"><Button size="sm" variant="outline" disabled={locked||!!draft.text} onClick={()=>setDraft({text:m.text,playerIds:[]})}>Usar como rascunho</Button>{m.status==='pending'&&<Button size="sm" variant="ghost" onClick={async()=>{try{await api('/admin/group-compose/'+m.id+'/cancel','POST');await refresh();}catch(e){setError((e as Error).message);}}}>Cancelar envio</Button>}</div></article>)}</div>}
 </section></div>;
}
