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
            setDate(calendar[division].date);
            setTime(calendar[division].time);
            setMessage(defaultJourneyMessage);
            setOpen(true);
          }}
        >
          Abrir inscrições
        </Button>
      </div>
      {items.map((j) => (
        <article
          key={j.id}
          style={{ padding: '16px 0', borderTop: '1px solid #dde5e2' }}
        >
          <strong>
            {j.division} · {j.date} · {j.time}
          </strong>
          <p>
            {j.confirmed.length}/{j.capacity} confirmados · {j.waiting.length}{' '}
            em espera ·{' '}
            {j.status === 'open'
              ? 'Inscrições abertas'
              : j.status === 'closed'
                ? 'Inscrições fechadas'
                : 'Sorteado'}
          </p>
          <details>
            <summary>Ver participantes</summary>
            <p>
              Confirmados:{' '}
              {j.confirmed
                .map(
                  (id) => players.find((p) => p.id === id)?.name ?? 'Jogador',
                )
                .join(', ') || 'Ainda sem participantes'}
            </p>
            <p>
              Em espera:{' '}
              {j.waiting
                .map(
                  (id) => players.find((p) => p.id === id)?.name ?? 'Jogador',
                )
                .join(', ') || 'Ninguém'}
            </p>
          </details>
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
        </article>
      ))}
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
        <DialogContent className="draw-dialog">
          <DialogTitle>Abrir inscrições no grupo</DialogTitle>
          <DialogDescription>
            Os jogadores respondem “quero entrar”. Ao esgotarem as vagas, entram
            em lista de espera.
          </DialogDescription>
          <div className="draw-dialog-body draw-fields">
            <label>
              Divisão
              <select
                value={division}
                disabled={busy}
                onChange={(e) => {
                  const d = e.target.value as Journey['division'];
                  setDivision(d);
                  setDate(calendar[d].date);
                  setTime(calendar[d].time);
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
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              Hora de Angola
              <input
                type="time"
                value={time}
                disabled={busy}
                onChange={(e) => setTime(e.target.value)}
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
            <div className="draw-courts">
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
              style={{
                width: '100%',
                border: '1px solid #d8e2df',
                borderRadius: 12,
                padding: 12,
                resize: 'vertical',
              }}
            />
            <p>
              Variáveis: {'{divisao}'} · {'{data}'} · {'{hora}'} · {'{vagas}'} ·{' '}
              {'{local}'}. As instruções e o código são acrescentados
              automaticamente.
            </p>
            <details open>
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
