import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import Backoffice, { type LiveState } from '../components/backoffice';
import { api } from '../components/whatsapp-live';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../components/ui/select';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '../components/ui/input-otp';
import '../app/globals.css';
function App() {
  const [me, setMe] = useState<{ role: string; status?: string } | null>(null);
  const [state, setState] = useState<LiveState | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('form');
  const [phone, setPhone] = useState('+244');
  const [code, setCode] = useState('');
  const [side, setSide] = useState('Esquerda');
  const [division, setDivision] = useState('M1');
  const [games, setGames] = useState<{
    playerId: string;
    people: { id: string; name: string }[];
    games: {
      id: string;
      division: string;
      date: string;
      time: string;
      court: { name: string };
      a: string[];
      b: string[];
      winner: string | null;
    }[];
  } | null>(null);
  const registration = location.pathname === '/inscricao';
  const playerLogin = location.pathname === '/jogos';
  async function refresh() {
    try {
      const current = await api('/me');
      setMe(current);
      if (current.role === 'admin') setState(await api('/admin/state'));
      else if (current.status === 'Ativo') setGames(await api('/games'));
    } catch {
      setMe(null);
    } finally {
      setReady(true);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(e.currentTarget);
    try {
      if (step === 'code') {
        await api('/verify', 'POST', { phone, code });
        await refresh();
      } else if (registration) {
        await api('/register', 'POST', {
          name: data.get('name'),
          phone,
          birth: data.get('birth'),
          side,
          division,
          invite: new URLSearchParams(location.search).get('convite'),
        });
        setStep('code');
      } else if (playerLogin) {
        await api('/code', 'POST', { phone });
        setStep('code');
      } else {
        await api('/login', 'POST', {
          email: data.get('email'),
          password: data.get('password'),
        });
        await refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!ready)
    return (
      <main className="auth-page">
        <p>A carregar…</p>
      </main>
    );
  if (me?.role === 'admin' && state)
    return (
      <Backoffice
        liveState={state}
        onSave={(data) => api('/admin/state', 'PUT', data)}
      />
    );
  if (me?.role === 'player')
    return (
      <main className="player-page">
        <div className="section-heading">
          <h1>Escada · Jogos</h1>
          <Button
            variant="outline"
            onClick={async () => {
              await api('/logout', 'POST');
              location.reload();
            }}
          >
            Sair
          </Button>
        </div>
        {me.status !== 'Ativo' ? (
          <section className="panel">
            <h2>
              {me.status === 'Rejeitado'
                ? 'Inscrição não aprovada'
                : 'Inscrição em análise'}
            </h2>
            <p>
              O teu WhatsApp está validado. A organização decide a entrada no
              torneio.
            </p>
          </section>
        ) : (
          <>
            <p className="info-note">
              Nesta etapa, consulta aqui os jogos. A submissão e confirmação de
              resultados pelos jogadores será ligada na próxima etapa.
            </p>
            <div className="games-grid">
              {games?.games.map((g) => (
                <section className="panel" key={g.id}>
                  <span className="badge">{g.division}</span>
                  <h2>{g.court.name}</h2>
                  <p>
                    {g.date} · {g.time}
                  </p>
                  <p>
                    {g.a
                      .map((id) => games.people.find((p) => p.id === id)?.name)
                      .join(' / ')}{' '}
                    ×{' '}
                    {g.b
                      .map((id) => games.people.find((p) => p.id === id)?.name)
                      .join(' / ')}
                  </p>
                  <span className="badge">
                    {g.winner ? 'Concluído' : 'Agendado'}
                  </span>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    );
  return (
    <main className="auth-page">
      <section className="panel auth-card">
        <p className="eyebrow">ESCADA · PADEL</p>
        <h1>
          {step === 'code'
            ? 'Valida o teu WhatsApp'
            : registration
              ? 'Entra na escada'
              : playerLogin
                ? 'Os teus jogos'
                : 'Área da organização'}
        </h1>
        <p className="subtitle">
          {step === 'code'
            ? 'Introduz o código de 6 dígitos recebido no WhatsApp.'
            : registration
              ? 'Preenche os teus dados. A entrada depende da aprovação da organização.'
              : 'Inicia sessão para continuar.'}
        </p>
        <form onSubmit={submit}>
          <div className="form-grid">
            {step === 'code' ? (
              <InputOTP maxLength={6} value={code} onChange={setCode}>
                <InputOTPGroup>
                  {Array.from({ length: 6 }, (_, i) => (
                    <InputOTPSlot index={i} key={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            ) : registration || playerLogin ? (
              <>
                {registration && (
                  <label className="field">
                    Nome completo
                    <Input name="name" required maxLength={100} />
                  </label>
                )}
                <label className="field">
                  WhatsApp com indicativo
                  <Input
                    required
                    type="tel"
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/[\s()-]/g, ''))
                    }
                  />
                </label>
                {registration && (
                  <>
                    <label className="field">
                      Data de nascimento
                      <Input
                        required
                        name="birth"
                        type="date"
                        min="1900-01-01"
                        max={new Date().toISOString().slice(0, 10)}
                      />
                    </label>
                    <label className="field">
                      Lado
                      <Select
                        value={side}
                        onValueChange={(v) => v && setSide(v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['Esquerda', 'Direita'].map((x) => (
                            <SelectItem key={x} value={x}>
                              {x}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="field">
                      Nível pretendido
                      <Select
                        value={division}
                        onValueChange={(v) => v && setDivision(v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['M1+', 'M1', 'M2'].map((x) => (
                            <SelectItem key={x} value={x}>
                              {x}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  </>
                )}
              </>
            ) : (
              <>
                <label className="field">
                  Email
                  <Input
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                  />
                </label>
                <label className="field">
                  Password
                  <Input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
              </>
            )}
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Button
              disabled={busy || (step === 'code' && code.length !== 6)}
              type="submit"
            >
              {busy
                ? 'Aguarda…'
                : step === 'code'
                  ? 'Validar código'
                  : registration
                    ? 'Enviar inscrição'
                    : playerLogin
                      ? 'Receber código'
                      : 'Entrar'}
            </Button>
          </div>
          {step === 'code' && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api('/code', 'POST', { phone });
                  setError('Novo código solicitado.');
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Pedir novo código
            </Button>
          )}
        </form>
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
