import {Component,useEffect,useState,type ReactNode} from 'react';
import {Maximize,Minimize} from 'lucide-react';
import {wallName,wallSlot,type WallData} from '../lib/wallboard';
import {api} from '../components/whatsapp-live';
import './wallboard.css';
class WallboardRecovery extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:Error){console.error('TV: falha ao apresentar os jogos',error);}
  render(){
    if(this.state.failed)return <main className="wallboard"><div className="wall-empty" role="alert"><h1>Não foi possível apresentar os jogos</h1><p>Volta a carregar o painel para tentar novamente.</p><button onClick={()=>window.location.reload()}>Voltar a carregar</button></div></main>;
    return this.props.children;
  }
}
export default function Wallboard(){return <WallboardRecovery><WallboardContent/></WallboardRecovery>;}
function WallboardContent(){
  const [date,setDate]=useState(''),[data,setData]=useState<WallData|null>(null),[error,setError]=useState('');
  const [manual,setManual]=useState(''),[tick,setTick]=useState(Date.now()),[offset,setOffset]=useState(0),[full,setFull]=useState(false),[fullError,setFullError]=useState('');
  useEffect(()=>{const timer=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{const update=()=>setFull(!!document.fullscreenElement);document.addEventListener('fullscreenchange',update);return()=>document.removeEventListener('fullscreenchange',update);},[]);
  useEffect(()=>{
    let active=true,inFlight=false;
    const refresh=async()=>{if(inFlight)return;inFlight=true;try{const next=await api<WallData>('/wallboard'+(date?'?date='+encodeURIComponent(date):''));if(active){setData(next);setOffset(Date.parse(next.serverTime)-Date.now());setError('');}}catch{if(active)setError('Sem ligação. A tentar atualizar…');}finally{inFlight=false;}};
    void refresh();const timer=setInterval(refresh,15000);return()=>{active=false;clearInterval(timer);};
  },[date]);
  const now=new Date(tick+offset),times=[...new Set(data?.games.map(g=>g.time)??[])].sort();
  const slot=manual&&times.includes(manual)?manual:wallSlot(times,data?.date??'',now);
  const games=data?.games.filter(g=>g.time===slot)??[];
  const levels=['M1+','M1','M2+','M2'].filter(d=>games.some(g=>g.division===d));
  const next=times[times.indexOf(slot)+1];
  const day=(value:string)=>new Intl.DateTimeFormat('pt-PT',{day:'numeric',month:'long',year:'numeric',timeZone:'Africa/Luanda'}).format(new Date(value+'T12:00:00+01:00'));
  const clock=new Intl.DateTimeFormat('pt-PT',{hour:'2-digit',minute:'2-digit',timeZone:'Africa/Luanda'}).format(now);
  return <main className="wallboard">
    <header className="wall-header"><img src="/ultimate-challenge.png" alt="Ultimate Challenge"/><img className="wall-club-logo" src="/premier-padel-club.png" alt="Premier Padel Club · Standard Bank"/><div><h1>{[...new Set(data?.games.map(g=>g.location)??[])].join(' · ')||'Ultimate Challenge'}</h1><p>{data?day(data.date):'A carregar jogos…'}</p></div><div className="wall-clock"><strong>{clock}</strong><span>Hora de Luanda</span></div></header>
    <div className="wall-summary"><span>{data?.games.length??0} jogos no dia · {new Set(data?.games.map(g=>g.court)).size} campos · {new Set(data?.games.map(g=>g.division)).size} níveis</span><span>{next?`Próximo horário ${next}`:'Último horário do dia'}</span></div>
    {error&&<p className="wall-error" role="alert">{error} {data?'A mostrar a última atualização.':''}</p>}
    <div className="wall-levels" style={{'--levels':Math.max(1,levels.length)} as React.CSSProperties}>
      {!games.length&&<div className="wall-empty"><h2>{data?'Sem jogos publicados neste dia':'A carregar…'}</h2><p>Seleciona outra data no rodapé para consultar os próximos jogos.</p></div>}
      {levels.map(level=><section className="wall-level" key={level}><div className="wall-level-label"><strong>{level}</strong><span>{slot}</span></div><div className="wall-courts" style={{'--courts':games.filter(g=>g.division===level).length} as React.CSSProperties}>{games.filter(g=>g.division===level).map(g=>{
        const start=Date.parse(`${data!.date}T${g.time}:00+01:00`),end=start+g.duration*60000;
        const status=g.winner?'Concluído':now.getTime()<start?'Agendado':now.getTime()<end?'Horário previsto':'Aguarda resultado';
        return <article className={'wall-match '+(level==='M1+'?'wall-lime':'')} key={g.id}><h2>{g.court}</h2><div className={'wall-team '+(g.winner==='a'?'wall-winner':'')}>{g.a.map((n,i)=><strong key={i} title={n}>{wallName(n)}</strong>)}</div><div className="wall-versus"><span/>vs<span/></div><div className={'wall-team '+(g.winner==='b'?'wall-winner':'')}>{g.b.map((n,i)=><strong key={i} title={n}>{wallName(n)}</strong>)}</div><small>{status}{g.winner?` · Vitória da dupla ${g.winner.toUpperCase()}`:''}</small></article>;
      })}</div></section>)}
    </div>
    <footer className="wall-footer"><label><span className="sr-only">Data dos jogos</span><select value={data?.date??''} onChange={e=>{setDate(e.target.value);setManual('');setData(null);}}>{data?.dates.map(d=><option key={d} value={d}>{d.split('-').reverse().join('/')}</option>)}</select></label><div className="wall-times" aria-label="Horários">{times.map(t=><button key={t} className={slot===t?'selected':''} aria-pressed={slot===t} onClick={()=>setManual(t)}>{t}</button>)}</div><button className={manual?'':'selected'} onClick={()=>setManual('')}>{manual?'Retomar automático':'Automático'}</button><button className="wall-fullscreen" onClick={async()=>{setFullError('');try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else setFullError('Usa o modo de ecrã inteiro do navegador.');}catch{setFullError('Não foi possível abrir em ecrã inteiro. Usa a opção do navegador.');}}}>{full?<Minimize size={19}/>:<Maximize size={19}/>} {full?'Sair de ecrã inteiro':'Ecrã inteiro'}</button></footer>
    {fullError&&<p className="wall-error" role="alert">{fullError}</p>}
  </main>;
}
