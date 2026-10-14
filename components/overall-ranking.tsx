import {useState} from 'react';
import type {OverallRankingRow} from '../lib/overall-ranking';

export default function OverallRanking({rows,division='Todas',playerId}:{rows:OverallRankingRow[];division?:string;playerId?:string}){
 const [search,setSearch]=useState('');
 const visible=rows.filter(p=>(division==='Todas'||p.division===division)&&p.name.toLocaleLowerCase('pt').includes(search.toLocaleLowerCase('pt')));
 return <section className="panel data-panel ranking-panel overall-ranking">
  <div className="section-heading"><div><h2>Ranking geral · todos os meses</h2><p>Pontos acumulados dos jogos publicados, incluindo vitórias, derrotas e bónus. Não reinicia no fim do mês.</p></div></div>
  <div className="info-note">A posição é geral, entre todos os níveis. O nível mostrado é o atual. Este ranking não altera a classificação mensal nem as subidas e descidas.</div>
  <label className="rm-search" style={{margin:'16px 24px'}}><input aria-label="Pesquisar no ranking geral" placeholder="Pesquisar jogador…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
  <div className="table-scroll"><table><thead><tr><th>Posição geral</th><th>Jogador</th><th>Nível atual</th><th>Vitórias</th><th>Derrotas</th><th>Bónus</th><th>Pontos</th></tr></thead><tbody>{visible.map(p=><tr key={p.id} className={p.id===playerId?'rank-first':''}><td>{p.position}</td><td><strong>{p.name}{p.id===playerId?' · Tu':''}</strong></td><td>{p.division}</td><td>{p.wins}</td><td>{p.losses}</td><td>{p.bonus}</td><td><strong>{p.points}</strong></td></tr>)}</tbody></table></div>
  {!visible.length&&<p style={{padding:24}}>Nenhum jogador neste filtro.</p>}
 </section>;
}
