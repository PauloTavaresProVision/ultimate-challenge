import RoundCourts from './round-courts';
import {useEffect,useState,type ReactNode} from 'react';
import {CalendarDays,Users,Trophy,History,MapPin} from 'lucide-react';
import {managementRounds} from '../lib/round-management';
import type {Game,Player,Court} from '../lib/tournament';
import type {RoundCalendar} from '../lib/weekly-calendar';
import {Button} from './ui/button';
import Journeys from './journeys';
import Substitutions from './substitutions';
import RoundMessage from './round-message';

export default function RoundManagement({games,players,courts,calendar,division,saving,publish,renderGame,month}:{games:Game[];players:Player[];courts:Court[];calendar:RoundCalendar;division:string;saving:boolean;publish:(games:Game[])=>Promise<void>;renderGame:(game:Game)=>ReactNode;month?:string}){
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Luanda'}).format(new Date());
  const pastMonth=!!month&&month<today.slice(0,7);
  const [tab,setTab]=useState(pastMonth?'history':'upcoming'),[selected,setSelected]=useState(''),[detail,setDetail]=useState('players');
  useEffect(()=>{setTab(pastMonth?'history':'upcoming');setSelected('');setDetail('players');},[month,pastMonth]);
  useEffect(()=>{setSelected('');setDetail('players');},[division]);
  const rounds=managementRounds(games.filter(g=>!month||g.date.startsWith(month+'-')),today,division);
  const chooseTab=(value:string)=>{setTab(value);setSelected('');setDetail('players');};
  const choices=rounds.filter(r=>tab==='history'?r.past:!r.past);
  if(tab==='history')choices.reverse();
  const current=choices.find(r=>r.id===selected)??choices[0];
  const date=(value:string)=>value.split('-').reverse().join('/');
  return <div className="round-manager">
    <nav className="rm-tabs" aria-label="Gestão de jornadas">
      <button aria-pressed={tab==='upcoming'} onClick={()=>chooseTab('upcoming')}><CalendarDays size={18}/>Hoje e próximas <span>{rounds.filter(r=>!r.past).length}</span></button>
      <button aria-pressed={tab==='registrations'} onClick={()=>chooseTab('registrations')}><Users size={18}/>Inscrições</button>
      <button aria-pressed={tab==='history'} onClick={()=>chooseTab('history')}><History size={18}/>Histórico</button>
    </nav>
    {tab==='registrations'?<Journeys players={players} courts={courts} games={games} calendar={calendar} filterDivision={division} filterMonth={month}/>:<>
      <p className="rm-guidance">{tab==='history'?'Rondas passadas ou concluídas. Consulta os jogos sem os misturar com a gestão das próximas jornadas.':'Escolhe a jornada. Gere os jogadores antes ou depois de publicar o sorteio.'}</p>
      {!choices.length?<section className="panel rm-empty"><CalendarDays size={30}/><h2>{tab==='history'?'Sem rondas no histórico':'Sem jogos preparados para hoje ou próximos dias'}</h2><p>Sem rondas deste mês e nível neste separador. Escolhe outro mês ou consulta Inscrições para jornadas ainda sem sorteio.</p><Button onClick={()=>chooseTab('registrations')}>Gerir inscrições</Button></section>:<div className="rm-layout">
        <nav className="rm-rounds" aria-label="Escolher jornada">{choices.map(r=><button key={r.id} aria-pressed={current.id===r.id} onClick={()=>{setSelected(r.id);setDetail('players');}}><strong>{r.division}<span>{r.draft?'Rascunho':r.games.every(g=>g.winner)?'Concluída':'Jogos publicados'}</span></strong><b>{r.date===today?'Hoje · ':''}{date(r.date)}</b><small>Ronda {r.round} · {r.players.length} jogadores · {r.games.length} jogos</small></button>)}</nav>
        <section className="rm-detail" key={current.id}>
          <header className="rm-heading"><div><p>RONDA {current.round} · {date(current.date)}</p><h2>{current.division} <span>{current.draft?'Rascunho':current.past?'Histórico':'Jogos publicados'}</span></h2><p>{current.past?'Consulta os jogos desta ronda. Para registar ou corrigir resultados, abre Jogos e resultados.':current.draft?'Podes alterar os jogadores antes de publicar.':'As alterações aos jogadores atualizam os quatro jogos.'}</p></div>{!current.past&&current.draft&&<Button disabled={saving||current.games.some(g=>g.absentIds?.length)} onClick={()=>publish(current.games)}>Publicar {current.division}</Button>}</header>
          {!current.draft&&!current.past&&<RoundMessage key={current.id} round={current.round} date={current.date} division={current.division} blocked={current.games.some(g=>!!g.absentIds?.length)}/>}
          {current.games.some(g=>g.absentIds?.length)&&<p className="rm-warning">Há saídas por resolver. Escolhe os suplentes antes de publicar ou registar resultados.</p>}
          {!current.past&&<nav className="rm-detail-tabs" aria-label="Detalhe da jornada"><button aria-pressed={detail==='players'} onClick={()=>setDetail('players')}><Users size={16}/>Jogadores e substituições</button><button aria-pressed={detail==='games'} onClick={()=>setDetail('games')}><Trophy size={16}/>Jogos · {current.games.length}</button><button aria-pressed={detail==='courts'} onClick={()=>setDetail('courts')}><MapPin size={16}/>Alterar campos</button></nav>}
          {!current.past&&detail==='courts'?<RoundCourts games={current.games} courts={courts}/>:!current.past&&detail==='players'?<Substitutions round={current.round} date={current.date} division={current.division}/>:<div className="games-grid">{current.games.map(renderGame)}</div>}
        </section>
      </div>}
    </>}
  </div>;
}
