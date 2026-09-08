import { useState } from 'react';
import { CalendarDays, MapPin, Trophy, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { api } from '@/components/whatsapp-live';
export type PlayerGamesData = { playerId: string; people: { id: string; name: string; side: string }[]; games: { id: string; duration?: number; division: string; date: string; time: string; court: { name: string; location: string }; a: string[]; b: string[]; winner: string | null }[] };
export function PlayerGames({ data, refresh }: { data: PlayerGamesData | null; refresh: () => Promise<void> }) {
  const [filter, setFilter] = useState('mine');
  const [pending, setPending] = useState<{ id: string; outcome: 'win' | 'loss' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const name = (id: string) => data?.people.find(p => p.id === id)?.name ?? 'Jogador';
  const mine = (g: PlayerGamesData['games'][number]) => [...g.a, ...g.b].includes(data?.playerId ?? '');
  const games = (data?.games ?? []).filter(g => filter === 'all' || mine(g)).sort((a,b) => Number(!!a.winner) - Number(!!b.winner) || (a.winner ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) || a.time.localeCompare(b.time));
  const selected = data?.games.find(g => g.id === pending?.id);
  const winningTeam = selected && pending ? (selected.a.includes(data!.playerId) === (pending.outcome === 'win') ? selected.a : selected.b) : [];
  return <div className="player-games-workspace">
    <div className="player-games-intro"><p>Consulta os encontros e regista o resultado da tua dupla depois de jogar.</p><Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await refresh(); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }}><RefreshCw size={15} />Atualizar</Button></div>
    <div className="player-games-tabs" role="group" aria-label="Jogos a mostrar">{[['mine', 'Os meus jogos'], ['all', 'Todos os jogos']].map(([value,label]) => <Button key={value} variant={filter === value ? 'default' : 'ghost'} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</Button>)}</div>
    {notice && <p className="wa-success" role="status"><Check size={17} />{notice}</p>}
    {error && !pending && <p className="form-error" role="alert">{error}</p>}
    {!data ? <section className="panel"><h2>Não foi possível carregar os jogos</h2><p>Usa Atualizar para tentar novamente.</p></section> : !games.length ? <section className="player-games-empty"><CalendarDays size={30} /><h2>{filter === 'mine' ? 'Ainda não tens jogos publicados' : 'A próxima ronda está a ser preparada'}</h2><p>Os encontros ficam disponíveis aqui quando a organização os publicar.</p></section> : <div className="player-match-grid">{games.map(g => <article className="player-match" key={g.id}>
      <header><span className="badge">{g.division}</span><span className={g.winner ? 'player-match-done' : ''}>{g.winner ? 'Concluído' : 'Por jogar'}</span></header>
      <h2>{g.court.name}</h2><p className="player-game-stage">Jogo {data.games.filter(x=>x.date===g.date && [...x.a,...x.b].includes(g.a[0])).sort((a,b)=>a.time.localeCompare(b.time)).findIndex(x=>x.id===g.id)+1} de {data.games.filter(x=>x.date===g.date && [...x.a,...x.b].includes(g.a[0])).length}{g.duration ? ' · '+g.duration+' min' : ''}</p><div className="player-match-meta"><span><CalendarDays size={15} />{g.date.split('-').reverse().join('/')} · {g.time}</span><span><MapPin size={15} />{g.court.location}</span></div>
      <div className="player-match-teams">{(['a','b'] as const).map(team => <div key={team} className={`player-match-team ${g.winner === team ? 'is-winner' : ''}`}><span className="player-team-label">Dupla {team.toUpperCase()}{g.winner === team && <Trophy size={15} />}</span>{g[team].map(id => <div key={id}><strong>{name(id)}{id === data.playerId && <small>Tu</small>}</strong><span>{data.people.find(p => p.id === id)?.side}</span></div>)}</div>)}</div>
      {g.winner ? <p className="player-match-result"><Check size={15} />Vitória: {g[g.winner as 'a'|'b'].map(name).join(' / ')}</p> : mine(g) ? <footer><Button disabled={busy || g.date > new Date().toISOString().slice(0,10)} onClick={() => { setError(''); setPending({id:g.id,outcome:'win'}); }}>Ganhámos</Button><Button variant="outline" disabled={busy || g.date > new Date().toISOString().slice(0,10)} onClick={() => { setError(''); setPending({id:g.id,outcome:'loss'}); }}>Perdemos</Button><small>{g.date > new Date().toISOString().slice(0,10) ? 'Disponível no dia do jogo' : 'Regista apenas depois de terminar o jogo'}</small></footer> : <p className="player-match-result">O resultado será registado pelos participantes.</p>}
    </article>)}</div>}
    <Dialog open={!!pending} onOpenChange={open => { if (!open && !busy) { setPending(null); setError(''); } }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>Confirmar resultado</DialogTitle><DialogDescription>Venceu a dupla {winningTeam.map(name).join(' / ')}. O resultado contará para a classificação. Depois de guardar, só a organização poderá corrigi-lo.</DialogDescription></DialogHeader>{error && <p className="form-error" role="alert">{error}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => { setPending(null); setError(''); }}>Voltar</Button><Button disabled={busy} onClick={async () => {
      if (!pending) return; setBusy(true); setError('');
      try { await api(`/games/${encodeURIComponent(pending.id)}/result`, 'POST', { outcome: pending.outcome }); setPending(null); setNotice('Resultado guardado. A pontuação será apresentada na classificação da organização.'); try { await refresh(); } catch { setError('O resultado foi guardado, mas a lista não atualizou. Usa Atualizar.'); } }
      catch(e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>{busy ? 'A guardar…' : 'Confirmar resultado'}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
