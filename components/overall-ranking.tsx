import {Button} from './ui/button';
import {useManualM2,ManualM2Controls} from './manual-m2';
import {useState} from 'react';
import type {OverallRankingRow} from '../lib/overall-ranking';

export default function OverallRanking({rows,division='Todas',playerId,manageRelegation=false,month}:{rows:OverallRankingRow[];division?:string;playerId?:string;manageRelegation?:boolean;month?:string}){
 const managing=manageRelegation&&division!=='Todas';
 const manual=useManualM2(managing,division);
 const [onlySelected,setOnlySelected]=useState(false);
 const [search,setSearch]=useState('');
 const scoped=rows.filter(p=>division==='Todas'||p.division===division).map((p,i)=>({...p,position:division==='Todas'?p.position:i+1}));
 const visible=scoped.filter(p=>!managing||!onlySelected||manual.selected.includes(p.id)).filter(p=>p.name.toLocaleLowerCase('pt').includes(search.toLocaleLowerCase('pt')));
 return <section className="panel data-panel ranking-panel overall-ranking">
  <div className="section-heading"><div><h2>{division==='Todas'?'Ranking geral':`Ranking acumulado · ${division}`} · {month}</h2><p>Pontos acumulados dos jogos publicados, incluindo vitórias, derrotas e bónus. Recomeça a zero no início de cada mês.</p></div></div>
  <div className="info-note">{division==='Todas'?'Posição entre todos os níveis. O nível mostrado é o atual.':`Posição dentro do ${division}, com os pontos acumulados neste mês.`} Este ranking soma o mês completo. A classificação quinzenal recomeça a cada ciclo.</div>
  {manageRelegation&&division==='Todas'&&<p className="info-note">Escolhe um nível acima para selecionar jogadores e alterar o nível de destino.</p>}
  {managing&&<ManualM2Controls state={manual}/>}
  {managing&&manual.plan&&<label className="ranking-selection-filter"><input type="checkbox" checked={onlySelected} onChange={e=>setOnlySelected(e.target.checked)}/>Mostrar apenas selecionados ({manual.selected.length})</label>}
  <label className="rm-search" style={{margin:'16px 24px'}}><input aria-label="Pesquisar no ranking geral" placeholder="Pesquisar jogador…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
  <div className="table-scroll"><table><thead><tr>{managing&&<th scope="col">Selecionar</th>}<th>{division==='Todas'?'Posição geral':`Posição ${division}`}</th><th>Jogador</th><th>Nível atual</th><th>Vitórias</th><th>Derrotas</th><th>Bónus</th><th>Pontos</th></tr></thead><tbody>{visible.map(p=><tr key={p.id} className={managing&&manual.selected.includes(p.id)?'ranking-descent-selected':p.id===playerId?'rank-first':''}><>{managing&&<td><input type="checkbox" aria-label={`Selecionar ${p.name} para alterar nível`} checked={manual.selected.includes(p.id)} disabled={manual.busy||!manual.plan?.candidates.some(c=>c.id===p.id)} onChange={()=>manual.toggle(p.id)}/></td>}</><td>{p.position}</td><td><strong>{p.name}{p.id===playerId?' · Tu':''}</strong></td><td>{p.division}</td><td>{p.wins}</td><td>{p.losses}</td><td>{p.bonus}</td><td><strong>{p.points}</strong></td></tr>)}</tbody></table></div>
  {managing&&manual.plan&&<div className="ranking-descent-footer"><strong>{manual.selected.length} selecionados</strong><Button disabled={manual.busy||!manual.selected.length||manual.target===division} onClick={()=>manual.setConfirm(true)}>Rever alteração</Button></div>}
  {!visible.length&&<p style={{padding:24}}>Nenhum jogador neste filtro.</p>}
 </section>;
}
