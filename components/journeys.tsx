import {
  defaultJourneyMessage,
  journeyAnnouncement,
} from '../lib/journey-message';
import { useEffect, useState, useRef } from 'react';
import { api } from './whatsapp-live';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import DrawDialog from './draw-dialog';
import type { Journey } from '../lib/journey';
import {
  divisions,
  type Player,
  type Court,
  type Game,
} from '../lib/tournament';
import type { RoundCalendar } from '../lib/weekly-calendar';
export default function Journeys({
  players,
  courts,
  games,
  calendar,
}: {
  players: Player[];
  courts: Court[];
  games: Game[];
  calendar: RoundCalendar;
}) {
  const [items, setItems] = useState<Journey[]>([]),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState<Journey | null>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [division, setDivision] = useState<Journey['division']>('M1+');
  const [date, setDate] = useState(calendar['M1+'].date),
    [time, setTime] = useState(calendar['M1+'].time),
    [capacity, setCapacity] = useState(12),
    [fields, setFields] = useState<string[]>([]);
  const [message, setMessage] = useState(defaultJourneyMessage);
  const batch = useRef('');
  const scheduleEdited = useRef({date:false,time:false});
  const refresh = () => api<Journey[]>('/admin/journeys').then(setItems);
  useEffect(() => {
    let active = true;
    const load = () =>
      api<Journey[]>('/admin/journeys')
        .then((r) => {
          if (active) setItems(r);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    void load();
    const t = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);
  async function create() {
    setBusy(true);
    setError('');
    try {
      await api('/admin/journeys', 'POST', {
        id: batch.current,
        division,
        date,
        time,
        capacity,
        courtIds: fields,
        message,
      });
      setOpen(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Jornadas e inscrições</h2>
          <p>Abre as vagas no grupo e faz o sorteio com os confirmados.</p>
        </div>
        <Button
          onClick={() => {
            batch.current = crypto
              .randomUUID()
              .replaceAll('-', '')
              .slice(0, 12);
            setError('');
            scheduleEdited.current={date:false,time:false};
            setDate(calendar[division].date);
            setTime(calendar[division].time);
            setMessage(defaultJourneyMessage);
            setOpen(true);
          }}
        >
          Abrir inscrições
        </Button>
      </div>
      <div className="journey-cards">
      {items.map((j) => (
        <article key={j.id} className="journey-card">
          <header className="journey-card-heading">
            <div><h3>{j.division}</h3><p>{j.date.split('-').reverse().join('/')} <span>às {j.time}</span></p></div>
            <span className={`journey-status journey-status-${j.status}`}>
              {j.status === 'open' ? 'Inscrições abertas' : j.status === 'closed' ? 'Inscrições fechadas' : 'Sorteado'}
            </span>
          </header>
          <div className="journey-counts">
            <div><strong>{j.confirmed.length}<small>/{j.capacity}</small></strong><span>Confirmados</span></div>
            <div><strong>{Math.max(0,j.capacity-j.confirmed.length)}</strong><span>Vagas livres</span></div>
            <div><strong>{j.waiting.length}</strong><span>Em espera</span></div>
          </div>
          <div className="journey-roster">
            <h4>Jogadores confirmados <span>{j.confirmed.length}</span></h4>
            {j.confirmed.length ? <ol className="journey-player-list">
              {j.confirmed.map((id,index)=>{const player=players.find(p=>p.id===id);return <li key={id}>
                <span className="journey-player-number">{String(index+1).padStart(2,'0')}</span>
                <span className="journey-player-name">{player?.name ?? 'Jogador indisponível'}</span>
                {player && <span className="journey-player-side">{player.side}</span>}
              </li>;})}
            </ol> : <p className="journey-empty">Ainda não há jogadores confirmados.</p>}
          </div>
          <div className="journey-waiting">
            <h4>Lista de espera <span>{j.waiting.length}</span></h4>
            {j.waiting.length ? <ol className="journey-player-list">
              {j.waiting.map((id,index)=><li key={id}>
                <span className="journey-player-number">{index+1}</span>
                <span className="journey-player-name">{players.find(p=>p.id===id)?.name ?? 'Jogador indisponível'}</span>
              </li>)}
            </ol> : <p className="journey-empty">Ninguém em espera.</p>}
          </div>
          <footer className="journey-card-actions">
          {j.status === 'open' && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={async () => {
                setBusy(true);
                try {
                  await api('/admin/journeys/' + j.id + '/close', 'POST');
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Fechar inscrições
            </Button>
          )}
          {j.status === 'closed' && (
            <Button onClick={() => setSelected(j)}>Sortear confirmados</Button>
          )}
          </footer>
        </article>
      ))}
      </div>
      {!items.length && (
        <p>
          Ainda não há jornadas. A mensagem de abertura será enviada ao grupo.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="draw-dialog journey-dialog">
          <DialogTitle>Abrir inscrições no grupo</DialogTitle>
          <DialogDescription>
            Os jogadores respondem “quero entrar”. Ao esgotarem as vagas, entram
            em lista de espera.
          </DialogDescription>
          <div className="draw-dialog-body journey-form">
            <div className="journey-fields">
            <label>
              Divisão
              <select
                value={division}
                disabled={busy}
                onChange={(e) => {
                  const d = e.target.value as Journey['division'];
                  setDivision(d);
                  if(!scheduleEdited.current.date) setDate(calendar[d].date);
                  if(!scheduleEdited.current.time) setTime(calendar[d].time);
                }}
              >
                {divisions.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Dia
              <input
                type="date"
                value={date}
                disabled={busy}
                onChange={(e) => {scheduleEdited.current.date=true;setDate(e.target.value);}}
              />
            </label>
            <label>
              Hora de Angola
              <input
                type="time"
                value={time}
                disabled={busy}
                onChange={(e) => {scheduleEdited.current.time=true;setTime(e.target.value);}}
              />
            </label>
            <label>
              Vagas
              <select
                value={capacity}
                disabled={busy}
                onChange={(e) => {
                  setCapacity(Number(e.target.value));
                  setFields([]);
                }}
              >
                {Array.from(
                  {
                    length: Math.max(
                      1,
                      courts.filter((c) => c.active).length - 1,
                    ),
                  },
                  (_, i) => (i + 2) * 4,
                ).map((n) => (
                  <option key={n} value={n}>
                    {n} jogadores · {n / 4} campos
                  </option>
                ))}
              </select>
            </label>
            </div>
            <div className="draw-courts journey-courts">
              {courts
                .filter((c) => c.active)
                .map((c) => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      checked={fields.includes(c.id)}
                      disabled={busy}
                      onChange={(e) =>
                        setFields(
                          e.target.checked
                            ? [...fields, c.id]
                            : fields.filter((id) => id !== c.id),
                        )
                      }
                    />
                    {c.name}
                  </label>
                ))}
            </div>
            <p>
              Premier Padel Club · {fields.length}/{capacity / 4} campos
              selecionados
            </p>
            <label htmlFor="journey-message">Mensagem para o grupo</label>
            <textarea
              id="journey-message"
              value={message}
              disabled={busy}
              rows={5}
              maxLength={1500}
              onChange={(e) => setMessage(e.target.value)}
              className="journey-message-editor"
            />
            <p>
              Variáveis: {'{divisao}'} · {'{data}'} · {'{hora}'} · {'{vagas}'} ·{' '}
              {'{local}'}. As instruções para participar são acrescentadas
              automaticamente.
            </p>
            <details className="journey-message-preview">
              <summary>Pré-visualização da mensagem</summary>
              <p style={{ whiteSpace: 'pre-wrap' }}>
                {journeyAnnouncement(message, {
                  id: batch.current,
                  division,
                  date,
                  time,
                  capacity,
                })}
              </p>
            </details>
            {error && <p className="form-error">{error}</p>}
          </div>
          <p role="status" style={{margin:0,padding:'12px 16px',background:'#f0f6f4',borderRadius:10,color:'#173d50'}}>
            <strong>{division} · {date ? date.split('-').reverse().join('/') : 'Escolhe a data'} às {time || '—'}</strong>
            <br />{capacity} vagas · {fields.length} campos selecionados
          </p>
          <Button
            disabled={
              busy ||
              !message.trim() ||
              fields.length !== capacity / 4 ||
              !date ||
              !time
            }
            onClick={() => void create()}
          >
            {busy ? 'A abrir…' : 'Abrir e anunciar no grupo'}
          </Button>
        </DialogContent>
      </Dialog>
      {selected && (
        <DrawDialog
          initialDivision={selected.division}
          journey={selected}
          calendar={calendar}
          players={players.filter((p) => selected.confirmed.includes(p.id))}
          courts={courts.filter((c) => selected.courtIds.includes(c.id))}
          games={games}
          live
          onClose={() => setSelected(null)}
          onSave={async (next) => {
            const own = next.filter(
              (g) =>
                g.division === selected.division && g.date === selected.date,
            );
            const sides: Record<string, string> = {};
            for (const g of own)
              for (const pair of [g.a, g.b]) {
                sides[pair[0]] = 'Esquerda';
                sides[pair[1]] = 'Direita';
              }
            await api('/admin/journeys/' + selected.id + '/draw', 'POST', {
              sides,
              courtIds: [...new Set(own.map((g) => g.court))],
            });
            window.location.reload();
            return true;
          }}
        />
      )}
    </section>
  );
}
