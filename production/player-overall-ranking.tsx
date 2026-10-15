import {useState} from 'react';
import type {OverallRankingRow} from '../lib/overall-ranking';

export function PlayerOverallRanking({rows,playerId,division}:{rows:OverallRankingRow[];playerId?:string;division?:string}){
  const [selected,setSelected]=useState('');
  const [search,setSearch]=useState('');
  const ownDivision=rows.find(p=>p.id===playerId)?.division??division;
  const level=selected||ownDivision||'M1+';
  const ranked=rows.filter(p=>p.division===level).map((p,i)=>({...p,position:i+1}));
  const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt').trim();
  const visible=ranked.filter(p=>normalize(p.name).includes(normalize(search)));
  const me=ranked.find(p=>p.id===playerId);
  return <section className="player-standings" aria-label="Ranking acumulado">
    <div className="player-standings-heading"><h2>Ranking geral</h2><span>Todos os meses</span></div>
    <p>Pontos acumulados de todos os meses, separados pelo nível atual dos jogadores.</p>
    <div className="standing-levels" role="group" aria-label="Nível do ranking">{['M1+','M1','M2+','M2'].map(d=><button type="button" key={d} aria-pressed={level===d} onClick={()=>{setSelected(d);setSearch('');}}>{d}{d===ownDivision?' · O teu nível':''}</button>)}</div>
    {me&&<section className="player-standing-summary"><h3>A tua posição no {level}</h3><div className="player-standing-numbers"><div><strong>{me.position}.º</strong><span>posição acumulada</span></div><div><strong>{me.points}</strong><span>pontos</span></div></div></section>}
    <h3>Ranking acumulado · {level}</h3>
    <label className="rm-search"><input aria-label="Pesquisar no ranking acumulado" placeholder="Pesquisar jogador…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <div className="player-standings-table"><table><caption className="sr-only">Ranking {level} de todos os meses</caption><thead><tr><th scope="col">#</th><th scope="col">Jogador</th><th scope="col"><abbr title="Vitórias">V</abbr></th><th scope="col"><abbr title="Derrotas">D</abbr></th><th scope="col">Pts</th></tr></thead><tbody>{visible.map(p=><tr key={p.id} className={p.id===playerId?'is-you':undefined}><td>{p.position}</td><th scope="row">{p.name}{p.id===playerId&&<span className="player-standing-you">Tu</span>}</th><td>{p.wins}</td><td>{p.losses}</td><td><strong>{p.points}</strong></td></tr>)}</tbody></table>{!visible.length&&<p>{search?'Nenhum jogador encontrado neste nível.':'Ainda não há jogadores neste ranking.'}</p>}</div>
    <p className="player-standings-note">V = Vitórias · D = Derrotas · Pts = Pontos, incluindo bónus. A pesquisa mantém a posição no nível.</p>
    <p className="player-standings-note">Os pontos não reiniciam no fim do mês. Este ranking não altera a classificação mensal nem as subidas e descidas.</p>
  </section>;
}
