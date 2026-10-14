import {useState} from 'react';
import type {OverallRankingRow} from '../lib/overall-ranking';

export default function OverallRanking({rows,division='Todas',playerId}:{rows:OverallRankingRow[];division?:string;playerId?:string}){
 const [search,setSearch]=useState('');
 const scoped=rows.filter(p=>division==='Todas'||p.division===division).map((p,i)=>({...p,position:division==='Todas'?p.position:i+1}));
 const visible=scoped.filter(p=>p.name.toLocaleLowerCase('pt').includes(search.toLocaleLowerCase('pt')));
 return <section className="panel data-panel ranking-panel overall-ranking">
  <div className="section-heading"><div><h2>{division==='Todas'?'Ranking geral':`Ranking acumulado · ${division}`} · todos os meses</h2><p>Pontos acumulados dos jogos publicados, incluindo vitórias, derrotas e bónus. Não reinicia no fim do mês.</p></div></div>
  <div className="info-note">{division==='Todas'?'Posição entre todos os níveis. O nível mostrado é o atual.':`Posição dentro do ${division}, com os pontos acumulados de todos os meses.`} Este ranking não altera a classificação mensal nem as subidas e descidas.</div>
  <label className="rm-search" style={{margin:'16px 24px'}}><input aria-label="Pesquisar no ranking geral" placeholder="Pesquisar jogador…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
  <div className="table-scroll"><table><thead><tr><th>{division==='Todas'?'Posição geral':`Posição ${division}`}</th><th>Jogador</th><th>Nível atual</th><th>Vitórias</th><th>Derrotas</th><th>Bónus</th><th>Pontos</th></tr></thead><tbody>{visible.map(p=><tr key={p.id} className={p.id===playerId?'rank-first':''}><td>{p.position}</td><td><strong>{p.name}{p.id===playerId?' · Tu':''}</strong></td><td>{p.division}</td><td>{p.wins}</td><td>{p.losses}</td><td>{p.bonus}</td><td><strong>{p.points}</strong></td></tr>)}</tbody></table></div>
  {!visible.length&&<p style={{padding:24}}>Nenhum jogador neste filtro.</p>}
 </section>;
}
