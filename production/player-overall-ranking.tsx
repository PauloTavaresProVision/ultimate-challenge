import {useState} from 'react';
import type {OverallRankingRow} from '../lib/overall-ranking';

export function PlayerOverallRanking({rows,playerId,division,months,currentMonth}:{months?:{month:string;rows:OverallRankingRow[]}[];currentMonth?:string;rows:OverallRankingRow[];playerId?:string;division?:string}){
  const [month,setMonth]=useState('');
  const period=months?.find(m=>m.month===(month||currentMonth))??months?.[0];
  const displayed=period?.rows??rows;
  const label=(value:string)=>new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T12:00:00Z'));
  const [selected,setSelected]=useState('');
  const [search,setSearch]=useState('');
  const ownDivision=displayed.find(p=>p.id===playerId)?.division??division;
  const level=selected||ownDivision||'M1+';
  const ranked=displayed.filter(p=>p.division===level).map((p,i)=>({...p,position:i+1}));
  const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt').trim();
  const visible=ranked.filter(p=>normalize(p.name).includes(normalize(search)));
  const me=ranked.find(p=>p.id===playerId);
  return <section className="player-standings" aria-label="Ranking acumulado">
    <div className="player-standings-heading"><h2>Ranking geral</h2><label><span className="sr-only">Mês do ranking geral</span><select aria-label="Mês do ranking geral" value={period?.month??currentMonth??''} onChange={e=>{setMonth(e.target.value);setSearch('');}}>{(months??[]).map(m=><option key={m.month} value={m.month}>{label(m.month)}</option>)}</select></label></div>
    <p>Pontos acumulados no mês selecionado, separados pelo nível atual dos jogadores.</p>
    <div className="standing-levels" role="group" aria-label="Nível do ranking">{['M1+','M1','M2+','M2'].map(d=><button type="button" key={d} aria-pressed={level===d} onClick={()=>{setSelected(d);setSearch('');}}>{d}{d===ownDivision?' · O teu nível':''}</button>)}</div>
    {me&&<section className="player-standing-summary"><h3>A tua posição no {level}</h3><div className="player-standing-numbers"><div><strong>{me.position}.º</strong><span>posição acumulada</span></div><div><strong>{me.points}</strong><span>pontos</span></div></div></section>}
    <h3>Ranking acumulado · {level}</h3>
    <label className="rm-search"><input aria-label="Pesquisar no ranking acumulado" placeholder="Pesquisar jogador…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <div className="player-standings-table"><table><caption className="sr-only">Ranking {level} do mês {period?.month??currentMonth}</caption><thead><tr><th scope="col">#</th><th scope="col">Jogador</th><th scope="col"><abbr title="Vitórias">V</abbr></th><th scope="col"><abbr title="Derrotas">D</abbr></th><th scope="col">Pts</th></tr></thead><tbody>{visible.map(p=><tr key={p.id} className={p.id===playerId?'is-you':undefined}><td>{p.position}</td><th scope="row">{p.name}{p.id===playerId&&<span className="player-standing-you">Tu</span>}</th><td>{p.wins}</td><td>{p.losses}</td><td><strong>{p.points}</strong></td></tr>)}</tbody></table>{!visible.length&&<p>{search?'Nenhum jogador encontrado neste nível.':'Ainda não há jogadores neste ranking.'}</p>}</div>
    <p className="player-standings-note">V = Vitórias · D = Derrotas · Pts = Pontos, incluindo bónus. A pesquisa mantém a posição no nível.</p>
    <p className="player-standings-note">Os pontos acumulam durante o mês e recomeçam a zero no mês seguinte. As trocas quinzenais usam a classificação do ciclo; não apagam estes pontos.</p>
  </section>;
}
