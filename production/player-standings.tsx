import {useState} from 'react';
import type {PlayerStandingMonth} from '../lib/player-standings';
import {Button} from '@/components/ui/button';
export function PlayerStandings({months,onGames}:{months:PlayerStandingMonth[];onGames:()=>void}){
  const [selected,setSelected]=useState('');
  const [level,setLevel]=useState('');
  const data=months.find(m=>m.month===selected)??months[0];
  if(!data)return <section className="panel"><p>A classificação ainda não está disponível. Usa Atualizar para tentar novamente.</p></section>;
  const division=level||data.division;
  const rows=(data.divisions??[{division:data.division,rows:data.rows}]).find(d=>d.division===division)?.rows??[];
  const me=rows.find(p=>p.isYou);
  const label=(month:string)=>new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'));
  return <section className="player-standings" aria-label="Classificação">
    <div className="player-standings-heading"><h2>Classificação</h2><label><span className="sr-only">Mês da classificação</span><select value={data.month} onChange={e=>setSelected(e.target.value)}>{months.map(m=><option key={m.month} value={m.month}>{label(m.month)}</option>)}</select></label></div>
    <div className="standing-levels" aria-label="Nível da classificação">{(data.divisions??[{division:data.division}]).map(d=><button type="button" key={d.division} aria-pressed={division===d.division} onClick={()=>setLevel(d.division)}>{d.division}{d.division===data.division?' · O teu nível':''}</button>)}</div>
    <p><span className="player-division-pill">{data.archived?'Divisão neste mês':'A tua divisão'} · {data.division}</span></p>
    {me?<section className="player-standing-summary"><h3>A tua posição</h3><div className="player-standing-numbers"><div><strong>{me.position}.º</strong><span>posição</span></div><div><strong>{me.points}</strong><span>pontos</span></div></div><p><span><b>{me.wins}</b> {me.wins===1?'vitória':'vitórias'}</span><span><b>{me.losses}</b> {me.losses===1?'derrota':'derrotas'}</span></p></section>:division===data.division?<p>Não tens uma posição registada neste mês.</p>:null}
    <h3>Classificação {division}</h3>
    <div className="player-standings-table"><table><caption className="sr-only">Classificação {division}, {label(data.month)}</caption><thead><tr><th scope="col">#</th><th scope="col">Jogador</th><th scope="col"><abbr title="Vitórias">V</abbr></th><th scope="col"><abbr title="Derrotas">D</abbr></th><th scope="col">Pts</th></tr></thead><tbody>{rows.map(p=><tr key={p.id} className={p.isYou?'is-you':undefined}><td>{p.position}</td><th scope="row">{p.name}{p.isYou&&<span className="player-standing-you">Tu</span>}</th><td>{p.wins}</td><td>{p.losses}</td><td><strong>{p.points}</strong></td></tr>)}</tbody></table>{!rows.length&&<p>Ainda não há jogadores nesta classificação.</p>}</div>
    <p className="player-standings-note">V = Vitórias · D = Derrotas · Pts = Pontos</p>
    <p className="player-standings-note">{data.archived?'Classificação final do mês encerrado.':'A classificação atualiza com os resultados guardados. Os pontos incluem os bónus previstos nas regras.'}</p>
    <Button variant="outline" onClick={onGames}>Ver os meus jogos →</Button>
  </section>;
}
