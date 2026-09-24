import {useId} from 'react';
import {Combobox,ComboboxInput,ComboboxContent,ComboboxList,ComboboxItem,ComboboxEmpty} from './ui/combobox';

type Choice={id:string;name:string;division:string;side:string};
export default function PlayerPicker({label,players,value,onChange,disabled=false,volunteers=[]}:{label:string;players:Choice[];value:string;onChange:(id:string)=>void;disabled?:boolean;volunteers?:string[]}){
  const id=useId();
  const sorted=[...players].sort((a,b)=>a.name.localeCompare(b.name,'pt'));
  return <div className="field player-picker"><label htmlFor={id}>{label}</label>
    <Combobox items={sorted} value={players.find(p=>p.id===value)??null} onValueChange={p=>onChange(p?.id??'')} itemToStringLabel={(p:Choice)=>p.name} isItemEqualToValue={(a:Choice,b:Choice)=>a.id===b.id} disabled={disabled}>
      <ComboboxInput id={id} disabled={disabled} showClear placeholder="Pesquisar jogador pelo nome…"/>
      <ComboboxContent className="player-picker-options"><ComboboxEmpty>Nenhum jogador encontrado.</ComboboxEmpty><ComboboxList>{(p:Choice)=><ComboboxItem key={p.id} value={p}><span><strong>{p.name}</strong><small>{p.division} · {p.side}{volunteers.includes(p.id)?' · Voluntário':''}</small></span></ComboboxItem>}</ComboboxList></ComboboxContent>
    </Combobox>
    <small>{disabled?'Seleciona primeiro a ronda ou o jogador que sai.':`${players.length} jogadores disponíveis`}</small>
  </div>;
}
