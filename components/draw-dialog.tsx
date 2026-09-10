import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  divisions,
  type Division,
  type Player,
  type Court,
  type Game,
} from '../lib/tournament';
import { prepareDivisionDraw, type DrawPlan } from '../lib/division-draw';
import type { RoundCalendar } from '../lib/weekly-calendar';
export default function DrawDialog({
  initialDivision,
  calendar,
  players,
  courts,
  games,
  live,
  onClose,
  onSave,
}: {
  initialDivision: Division;
  calendar: RoundCalendar;
  players: Player[];
  courts: Court[];
  games: Game[];
  live: boolean;
  onClose: () => void;
  onSave: (games: Game[], entry: string) => Promise<boolean>;
}) {
  const [plan, setPlan] = useState<DrawPlan>({
    division: initialDivision,
    ...calendar[initialDivision],
    sides: {},
    courtIds: [],
  });
  const [step, setStep] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const pool = players.filter(
    (p) => p.division === plan.division && p.status === 'Ativo' && p.verified,
  );
  const total = Object.keys(plan.sides).length,
    required = total / 4;
  const count = (side: Player['side']) =>
    Object.values(plan.sides).filter((s) => s === side).length;
  const end = () => {
    const [h, m] = plan.time.split(':').map(Number);
    const n = h * 60 + m + 80;
    return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  };
  const available = (c: Court) => {
    const [h, m] = plan.time.split(':').map(Number);
    const start = h * 60 + m;
    return (
      c.active &&
      !games.some(
        (g) =>
          g.court === c.id &&
          g.date === plan.date &&
          !(g.division === plan.division && !g.published) &&
          Number(g.time.slice(0, 2)) * 60 + Number(g.time.slice(3)) <
            start + 80 &&
          Number(g.time.slice(0, 2)) * 60 +
            Number(g.time.slice(3)) +
            g.duration >
            start,
      )
    );
  };
  function next() {
    setError('');
    if (
      step === 0 &&
      (!plan.date ||
        !plan.time ||
        (live &&
          plan.date <
            new Intl.DateTimeFormat('sv-SE', {
              timeZone: 'Africa/Luanda',
            }).format(new Date())))
    ) {
      setError('Indica uma data atual ou futura e uma hora.');
      return;
    }
    if (
      step === 1 &&
      (total < 8 || total % 4 || count('Esquerda') !== count('Direita'))
    ) {
      setError('Seleciona 8, 12, 16… jogadores, com metade de cada lado.');
      return;
    }
    if (
      step === 2 &&
      (plan.courtIds.length !== required ||
        plan.courtIds.some(
          (id) => !courts.some((c) => c.id === id && available(c)),
        ))
    ) {
      setError(`Seleciona ${required} campos disponíveis.`);
      return;
    }
    setStep(step + 1);
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="draw-dialog" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Preparar sorteio</DialogTitle>
          <DialogDescription>
            Uma divisão de cada vez. Quatro jogos de 20 minutos, com dupla fixa.
          </DialogDescription>
        </DialogHeader>
        <ol className="draw-steps">
          {['Data e nível', 'Jogadores', 'Campos', 'Revisão'].map((s, i) => (
            <li key={s} aria-current={step === i ? 'step' : undefined}>
              {i + 1}. {s}
            </li>
          ))}
        </ol>
        <div className="draw-dialog-body">
          {step === 0 && (
            <div className="draw-fields">
              <label>
                Divisão
                <select
                  value={plan.division}
                  onChange={(e) => {
                    const d = e.target.value as Division;
                    setPlan({
                      division: d,
                      ...calendar[d],
                      sides: {},
                      courtIds: [],
                    });
                  }}
                >
                  {divisions.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label>
                Data
                <Input
                  type="date"
                  value={plan.date}
                  onChange={(e) =>
                    setPlan({ ...plan, date: e.target.value, courtIds: [] })
                  }
                />
              </label>
              <label>
                Hora de início · Angola
                <Input
                  type="time"
                  value={plan.time}
                  onChange={(e) =>
                    setPlan({ ...plan, time: e.target.value, courtIds: [] })
                  }
                />
              </label>
              <p>{pool.length} jogadores aprovados nesta divisão.</p>
            </div>
          )}
          {step === 1 && (
            <>
              <div className="draw-totals">
                <strong>{total} selecionados</strong>
                <span>
                  {count('Esquerda')} esquerda · {count('Direita')} direita
                </span>
                <Button
                  variant="outline"
                  onClick={() =>
                    setPlan({
                      ...plan,
                      sides: Object.fromEntries(
                        pool.map((p) => [p.id, p.side]),
                      ),
                      courtIds: [],
                    })
                  }
                >
                  Selecionar todos
                </Button>
              </div>
              <p>
                O lado escolhido aplica-se apenas a esta ronda. O perfil do
                jogador mantém-se.
              </p>
              <div className="draw-player-columns">
                {(['Esquerda', 'Direita'] as const).map((side) => (
                  <section key={side}>
                    <h3>{side}</h3>
                    {pool
                      .filter((p) => (plan.sides[p.id] ?? p.side) === side)
                      .map((p) => (
                        <div className="draw-player" key={p.id}>
                          <label>
                            <input
                              type="checkbox"
                              checked={!!plan.sides[p.id]}
                              onChange={(e) => {
                                const sides = { ...plan.sides };
                                if (e.target.checked) sides[p.id] = p.side;
                                else delete sides[p.id];
                                setPlan({ ...plan, sides, courtIds: [] });
                              }}
                            />
                            {p.name}
                          </label>
                          {plan.sides[p.id] && (
                            <button
                              type="button"
                              onClick={() =>
                                setPlan({
                                  ...plan,
                                  sides: {
                                    ...plan.sides,
                                    [p.id]:
                                      side === 'Esquerda'
                                        ? 'Direita'
                                        : 'Esquerda',
                                  },
                                })
                              }
                            >
                              Passar à{' '}
                              {side === 'Esquerda' ? 'direita' : 'esquerda'} →
                            </button>
                          )}
                        </div>
                      ))}
                  </section>
                ))}
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h3>
                {total} jogadores · {total / 2} duplas · {required} campos
                necessários
              </h3>
              <p>
                Escolhe exatamente {required} campos para jogar das {plan.time}{' '}
                às {end()}.
              </p>
              <div className="draw-courts">
                {courts
                  .filter((c) => c.active)
                  .map((c) => (
                    <label key={c.id}>
                      <input
                        type="checkbox"
                        disabled={!available(c)}
                        checked={plan.courtIds.includes(c.id)}
                        onChange={(e) =>
                          setPlan({
                            ...plan,
                            courtIds: e.target.checked
                              ? [...plan.courtIds, c.id]
                              : plan.courtIds.filter((id) => id !== c.id),
                          })
                        }
                      />
                      <span>
                        {c.name}
                        <small>
                          {available(c) ? c.location : 'Ocupado neste horário'}
                        </small>
                      </span>
                    </label>
                  ))}
              </div>
              <strong>
                {plan.courtIds.length} / {required} selecionados
              </strong>
            </>
          )}
          {step === 3 && (
            <div className="draw-review">
              <h3>
                {plan.division} · {plan.date}
              </h3>
              <p>
                {plan.time}–{end()} · Hora de Angola
              </p>
              <p>
                {total} jogadores · {total / 2} duplas · 4 jogos por jogador
              </p>
              <p>
                {count('Esquerda')} à esquerda · {count('Direita')} à direita
              </p>
              <p>
                Campos:{' '}
                {plan.courtIds
                  .map((id) => courts.find((c) => c.id === id)?.name)
                  .join(', ')}
              </p>
              <p>
                Dupla fixa, mudança de campo entre jogos e adversários
                diferentes sempre que possível.
              </p>
              <p>
                O sorteio fica em rascunho. Só é enviado ao grupo depois de
                publicares.
              </p>
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-actions">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => (step ? setStep(step - 1) : onClose())}
          >
            {step ? 'Anterior' : 'Cancelar'}
          </Button>
          {step < 3 ? (
            <Button onClick={next}>Continuar</Button>
          ) : (
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  const result = prepareDivisionDraw(
                    plan,
                    players,
                    courts,
                    games,
                  );
                  if (
                    await onSave(
                      result.games,
                      `${plan.division}: ronda ${result.round} sorteada com ${total} jogadores e ${required} campos.`,
                    )
                  )
                    onClose();
                  else
                    setError(
                      'Não foi possível guardar o sorteio. Verifica o aviso da página.',
                    );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'A guardar…' : 'Gerar sorteio'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
