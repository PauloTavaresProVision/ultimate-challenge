import PlayerPicker from './player-picker';
import {useEffect,useState} from 'react';
import {Search,UserRoundMinus,ArrowRightLeft} from 'lucide-react';
import {api} from './whatsapp-live';
import {Button} from './ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';

type Player={id:string;name:string;side:string;division:string};
type Vacancy={id:string;round:number;date:string;playerId:string;name:string;side:string;division:string;candidates:string[];status:string};
type Data={players:Player[];vacancies:Vacancy[];games:{round:number;date:string;division:string;published:boolean;winner:string|null;a:string[];b:string[]}[]};
export default function Substitutions({round,date,division}:{round:number;date:string;division:string}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[search,setSearch]=useState('');
 const [action,setAction]=useState<{player:Player;mode:'remove'|'replace';vacancy?:Vacancy}|null>(null),[incoming,setIncoming]=useState('');
 async function refresh(){setData(await api<Data>('/admin/substitutions'));}
 useEffect(()=>{let active=true;const poll=()=>api<Data>('/admin/substitutions').then(d=>{if(active){setData(d);setError('');}}).catch(e=>{if(active)setError(e.message);});void poll();const timer=setInterval(poll,10000);return()=>{active=false;clearInterval(timer);};},[]);
 async function act(path:string,body:unknown){setBusy(true);setError('');try{await api('/admin/substitutions'+path,'POST',body);setAction(null);setIncoming('');setNotice('Alteração guardada. Os jogos e a lista de jogadores foram atualizados.');window.dispatchEvent(new Event('tournament-updated'));await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const own=data?.games.filter(g=>g.round===round&&g.date===date&&g.division===division)??[];
 const pending=data?.vacancies.filter(v=>v.status==='pending'&&v.round===round&&v.date===date&&v.division===division)??[];
 const ids=new Set(own.flatMap(g=>[...g.a,...g.b]));
 const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const roster=(data?.players??[]).filter(p=>ids.has(p.id)).sort((a,b)=>a.name.localeCompare(b.name,'pt'));
 const outgoing=action?.player;
 const pair=outgoing?own.flatMap(g=>[g.a,g.b]).find(pair=>pair.includes(outgoing.id)):undefined;
 const side=pair?.indexOf(outgoing?.id??'')===0?'Esquerda':'Direita';
 const eligible=(data?.players??[]).filter(p=>p.id!==outgoing?.id&&p.division===division&&(!own.some(g=>g.published)||p.side===side)&&!data?.games.some(g=>(g.round===round||g.date===date)&&[...g.a,...g.b].includes(p.id)));
 return <div className="rm-roster">
  <div className="rm-roster-top"><div><h3>{roster.length-pending.length} jogadores presentes {pending.length>0&&<span>· {pending.length} por substituir</span>}</h3><p>Retira quem falta ou troca diretamente por outro jogador.</p></div><label className="rm-search"><Search size={17}/><input aria-label="Pesquisar nesta jornada" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar jogador…"/></label></div>
  {error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className="rm-success" role="status">{notice}</p>}
  {!data&&!error&&<p role="status">A carregar jogadores…</p>}
  {data&&<ul className="rm-player-list">{roster.filter(p=>normalize(p.name).includes(normalize(search))).map(p=>{
   const vacancy=pending.find(v=>v.playerId===p.id), games=own.filter(g=>[...g.a,...g.b].includes(p.id)),canChange=games.length===4&&games.every(g=>!g.winner);
   return <li key={p.id}><div><strong>{p.name}</strong><small>{vacancy?'Saiu · lugar à espera de suplente':p.side}{!canChange?' · Já tem resultados':''}</small></div><div className="rm-player-actions">
    {vacancy?<><Button variant="outline" disabled={busy} onClick={()=>act('/'+vacancy.id+'/cancel',{})}>Anular saída</Button><Button disabled={busy||!canChange} onClick={()=>{setIncoming('');setAction({player:p,mode:'replace',vacancy});}}>Escolher suplente</Button></>:<><Button variant="outline" disabled={busy||!canChange} onClick={()=>{setIncoming('');setAction({player:p,mode:'replace'});}}><ArrowRightLeft size={15}/>Substituir</Button><Button variant="ghost" disabled={busy||!canChange} onClick={()=>setAction({player:p,mode:'remove'})}><UserRoundMinus size={15}/>Retirar</Button></>}
   </div></li>;
  })}</ul>}
  {data&&!roster.filter(p=>normalize(p.name).includes(normalize(search))).length&&<p>Nenhum jogador encontrado nesta jornada.</p>}
  <Dialog open={!!action} onOpenChange={open=>{if(!open&&!busy){setAction(null);setError('');}}}><DialogContent className="rm-change-dialog"><DialogTitle>{action?.mode==='remove'?'Retirar jogador':'Substituir jogador'}</DialogTitle><DialogDescription>{division} · {date.split('-').reverse().join('/')} · Ronda {round}</DialogDescription>
   <div className="rm-outgoing"><small>SAI</small><strong>{outgoing?.name}</strong></div>
   {action?.mode==='replace'?<><PlayerPicker label="Entra no lugar dele" players={eligible} value={incoming} onChange={setIncoming} disabled={busy} volunteers={action.vacancy?.candidates}/>{incoming&&eligible.find(p=>p.id===incoming)?.side!==side&&<p className="rm-warning">Nesta ronda, o suplente jogará à {side.toLowerCase()}, embora a ficha indique outro lado.</p>}<p>O suplente ocupa o lugar nos quatro jogos, mantendo a dupla, os horários e os campos. A lista de confirmados também é atualizada.</p>{!eligible.length&&<p className="rm-warning">Não há jogadores livres do mesmo nível e lado. Verifica a ficha do suplente antes de continuar.</p>}</>:<p>Fica assinalado como ausente. Os quatro jogos ficam à espera de suplente, que podes escolher mais tarde. Não são apagados jogos nem promovidos jogadores automaticamente.</p>}
   <p>{own.some(g=>g.published)?'A alteração será anunciada no grupo.':'O sorteio continua em rascunho. Esta alteração não envia mensagens ao grupo.'}</p>
   {error&&<p className="form-error" role="alert">{error}</p>}
   <div className="dialog-actions"><Button variant="outline" disabled={busy} onClick={()=>setAction(null)}>Voltar</Button><Button disabled={busy||(action?.mode==='replace'&&!eligible.some(p=>p.id===incoming))} onClick={()=>{if(!action)return;void act(action.mode==='remove'?'':action.vacancy?'/'+action.vacancy.id+'/approve':'/replace',action.mode==='remove'?{round,playerId:action.player.id}:action.vacancy?{playerId:incoming}:{round,playerId:action.player.id,substituteId:incoming});}}>{busy?'A guardar…':action?.mode==='remove'?'Confirmar saída':'Confirmar substituição'}</Button></div>
  </DialogContent></Dialog>
 </div>;
}
