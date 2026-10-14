import {useEffect,useState} from 'react';
import {CalendarDays,Clock,History,Search,FilePenLine,CheckCircle2} from 'lucide-react';
import {managementRounds} from '../lib/round-management';
import type {Game,Player,Court} from '../lib/tournament';
import {Button} from './ui/button';

export default function ResultsBoard({games,players,courts,division,onEdit,today,month,readOnly=false}:{games:Game[];players:Player[];courts:Court[];division:string;onEdit:(game:Game)=>void;today:string;month?:string;readOnly?:boolean}){
 const pastMonth=!!month&&month<today.slice(0,7);
 const [tab,setTab]=useState(pastMonth?'history':'current'),[selected,setSelected]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState('all');
 useEffect(()=>{setTab(pastMonth?'history':'current');setSelected('');setSearch('');setFilter('all');},[month,pastMonth]);
 useEffect(()=>{setSelected('');setSearch('');setFilter('all');},[division]);
 const scopedGames=games.filter(g=>!month||g.date.startsWith(month+'-'));
 const published=managementRounds(scopedGames.filter(g=>g.published),today,division);
 const drafts=managementRounds(scopedGames.filter(g=>!g.published),today,division);
 const missing=published.filter(r=>r.games.some(g=>!g.winner));
 const choices=tab==='drafts'?drafts:tab==='missing'?missing:published.filter(r=>tab==='history'?r.date<today:r.date>=today);
 if(tab==='history')choices.reverse();
 const current=choices.find(r=>r.id===selected)??choices[0];
 const name=(id:string)=>players.find(p=>p.id===id)?.name??'Jogador indisponível';
 const court=(id:string)=>courts.find(c=>c.id===id)?.name??'Campo indisponível';
 const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const visible=(current?.games??[]).filter(g=>(filter==='all'||(filter==='done'?!!g.winner:!g.winner))&&normalize([...g.a,...g.b].map(name).join(' ')+' '+court(g.court)).includes(normalize(search)));
 const slots=[...new Set(visible.map(g=>g.time))];
 const choose=(id:string)=>{setSelected(id);setSearch('');setFilter('all');};
 return <div className="round-manager results-board">
  <nav className="rm-tabs" aria-label="Período dos jogos">{[
   {id:'current',label:'Hoje e próximos',icon:CalendarDays},
   {id:'missing',label:`Resultados em falta · ${missing.reduce((n,r)=>n+r.games.filter(g=>!g.winner).length,0)}`,icon:Clock},
   {id:'history',label:'Histórico',icon:History},
   {id:'drafts',label:'Rascunhos',icon:FilePenLine},
  ].map(t=><button key={t.id} aria-pressed={tab===t.id} onClick={()=>{setTab(t.id);choose('');setFilter(t.id==='missing'?'pending':'all');}}><t.icon size={17}/>{t.label}</button>)}</nav>
  <p className="rm-guidance">{tab==='missing'?'Jogos do mês selecionado ainda sem resultado, incluindo os de dias anteriores.':tab==='drafts'?'Jogos ainda por publicar. As alterações de jogadores são feitas em Rondas e sorteios.':'Escolhe a data e o nível. Os jogos aparecem por horário e campo.'}</p>
  {!current?<section className="panel rm-empty"><h2>{tab==='missing'?'Não há resultados em falta':'Sem jogos neste separador'}</h2><p>Não há jogos deste mês e nível neste separador. Escolhe outro mês, nível ou separador.</p></section>:<div className="rm-layout">
   <nav className="rm-rounds" aria-label="Escolher data e nível">{choices.map(r=><button key={r.id} aria-pressed={current.id===r.id} onClick={()=>{choose(r.id);if(tab==='missing')setFilter('pending');}}><strong>{r.division}</strong><b>{r.date===today?'Hoje · ':''}{r.date.split('-').reverse().join('/')}</b><small>Ronda {r.round} · {r.games.length} jogos</small><small>{tab==='drafts'?'Por publicar':`${r.games.filter(g=>g.winner).length}/${r.games.length} resultados registados`}</small></button>)}</nav>
   <section className="rm-detail">
    <header className="rm-heading"><div><p>RONDA {current.round} · {current.date.split('-').reverse().join('/')}</p><h2>{current.division} <span>{tab==='drafts'?'Rascunho':`${current.games.filter(g=>g.winner).length}/${current.games.length} resultados`}</span></h2></div></header>
    <div className="rb-filters"><label className="rm-search"><Search size={17}/><input aria-label="Pesquisar jogador ou campo nesta jornada" placeholder="Pesquisar jogador ou campo…" value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Mostrar<select aria-label="Filtrar resultados" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos os jogos</option><option value="pending">Sem resultado</option><option value="done">Com resultado</option></select></label></div>
    {!visible.length&&<p role="status">Nenhum jogo corresponde à pesquisa e ao filtro nesta jornada.</p>}
    {slots.map(time=><section className="rb-slot" key={time}><h3><Clock size={17}/>{time}<span>{visible.filter(g=>g.time===time).length} jogos</span></h3>{visible.filter(g=>g.time===time).sort((a,b)=>court(a.court).localeCompare(court(b.court),'pt')).map(g=><article key={g.id} className="rb-match">
     <div className="rb-court"><strong>{court(g.court)}</strong><small>{g.absentIds?.length?'Aguarda suplente':g.winner?'Resultado registado':g.published?'Sem resultado':'Rascunho'}</small></div>
     <div className="rb-teams">{(['a','b'] as const).map((team,i)=><div className={g.winner===team?'rb-winner':''} key={team}><span className="rb-team-label">Dupla {team.toUpperCase()}</span><strong>{g[team].map(id=>g.absentIds?.includes(id)?'Aguarda suplente':name(id)).join(' / ')}</strong>{g.winner===team&&<span className="rb-win-label"><CheckCircle2 size={14}/>Vencedora</span>}</div>)}</div>
     <Button variant="outline" disabled={!!g.absentIds?.length} onClick={()=>onEdit(g)}>{readOnly?'Ver resultado':g.winner?'Ver / corrigir':g.published?'Registar resultado':'Ver rascunho'}</Button>
    </article>)}</section>)}
   </section>
  </div>}
 </div>;
}
