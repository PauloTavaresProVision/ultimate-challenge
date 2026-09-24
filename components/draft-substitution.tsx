import PlayerPicker from './player-picker';
import {useState} from 'react';
import type {Game,Player} from '../lib/tournament';
import {replaceDraftPlayer} from '../lib/draft-substitution';
import {Button} from './ui/button';

export default function DraftSubstitution({games,players,visible,disabled,onSave}:{games:Game[];players:Player[];visible:Game[];disabled:boolean;onSave:(games:Game[],entry:string)=>Promise<boolean>}){
  const [outgoing,setOutgoing]=useState(''),[incoming,setIncoming]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const draft=visible.filter(g=>!g.published&&!g.winner);
  const choices=players.filter(p=>draft.some(g=>[...g.a,...g.b].includes(p.id)));
  const game=draft.find(g=>[...g.a,...g.b].includes(outgoing));
  const pair=game&&(game.a.includes(outgoing)?game.a:game.b);
  const side=pair?.indexOf(outgoing)===0?'Esquerda':'Direita';
  const candidates=game?players.filter(p=>p.id!==outgoing&&p.division===game.division&&p.status==='Ativo'&&p.verified&&!games.some(g=>(g.round===game.round||g.date===game.date)&&[...g.a,...g.b].includes(p.id))):[];
  if(!draft.length)return null;
  return <section className="panel"><h3>Substituir jogador no rascunho</h3><p>O suplente ocupa o mesmo lugar nos quatro jogos. Mantém o parceiro, os campos e os horários. A alteração só é anunciada quando publicares o sorteio.</p>
    <form className="substitution-form" onSubmit={async e=>{e.preventDefault();if(!game)return;setBusy(true);setError('');try{
      const next=replaceDraftPlayer(games,players,game.round,game.division,outgoing,incoming);
      if(await onSave(next,`${players.find(p=>p.id===incoming)?.name} substitui ${players.find(p=>p.id===outgoing)?.name} no rascunho ${game.division}, ronda ${game.round}.`)){setOutgoing('');setIncoming('');}
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
      <PlayerPicker label="Jogador que sai" disabled={disabled||busy} value={outgoing} onChange={id=>{setOutgoing(id);setIncoming('');setError('');}} players={choices}/>
      <PlayerPicker label="Suplente que entra" disabled={!game||disabled||busy} value={incoming} onChange={setIncoming} players={candidates}/>
      <Button type="submit" disabled={!game||!candidates.some(p=>p.id===incoming)||disabled||busy}>{busy?'A guardar…':'Guardar substituição'}</Button>
    </form>
    {game&&<p>O suplente jogará à {side.toLowerCase()}{incoming&&players.find(p=>p.id===incoming)?.side!==side?' nesta ronda, mesmo tendo outro lado habitual':''}.</p>}
    {game&&!candidates.length&&<p>Não há suplentes aprovados e disponíveis nesta divisão.</p>}
    {error&&<p className="form-error" role="alert">{error}</p>}
  </section>;
}
