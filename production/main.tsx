import RulesPage from './rules';
import { PlayerGames, type PlayerGamesData } from './player-games';
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
import './fonts.css';
const phoneCountries = [
  {id:'ao',name:'Angola',dial:'+244'}, {id:'pt',name:'Portugal',dial:'+351'},
  {id:'br',name:'Brasil',dial:'+55'}, {id:'mx',name:'México',dial:'+52'},
  {id:'ae',name:'Emirados Árabes Unidos · Dubai',dial:'+971'},
  {id:'mz',name:'Moçambique',dial:'+258'}, {id:'cv',name:'Cabo Verde',dial:'+238'},
  {id:'za',name:'África do Sul',dial:'+27'}, {id:'es',name:'Espanha',dial:'+34'},
  {id:'fr',name:'França',dial:'+33'}, {id:'gb',name:'Reino Unido',dial:'+44'},
  {id:'us',name:'Estados Unidos',dial:'+1'},
];
function App() {
  const [me, setMe] = useState<{ role: string; status?: string } | null>(null);
  const [state, setState] = useState<LiveState | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('form');
  const [countryId, setCountryId] = useState('ao');
  const [nationalPhone, setNationalPhone] = useState('');
  const country = phoneCountries.find(c => c.id === countryId)!;
  const phone = country.dial + nationalPhone;
  function updatePhone(value: string) {
    const clean = value.replace(/[\s()-]/g, '');
    if (clean.startsWith('+') || clean.startsWith('00')) {
      const international = clean.startsWith('00') ? '+' + clean.slice(2) : clean;
      const match = [...phoneCountries].sort((a,b) => b.dial.length-a.dial.length).find(c => international.startsWith(c.dial));
      if (match) { setCountryId(match.id); setNationalPhone(international.slice(match.dial.length).replace(/\D/g,'')); return; }
    }
    setNationalPhone(clean.replace(/\D/g,''));
  }
  const [code, setCode] = useState('');
  const [side, setSide] = useState('Esquerda');
  const [division, setDivision] = useState('M1');
  const [games, setGames] = useState<PlayerGamesData | null>(null);
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
          <div><div className="ultimate-logo player-logo"><img src="/ultimate-challenge.png" alt="Ultimate Challenge" /></div><h1>Os teus jogos</h1></div>
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
          <PlayerGames data={games} refresh={async () => setGames(await api<PlayerGamesData>('/games'))} />
        )}
      </main>
    );
  return (
    <main className="auth-page auth-redesign">
      <header className="auth-brand-header"><div className="ultimate-logo"><img src="/ultimate-challenge.png" alt="Ultimate Challenge" /></div></header>
      <aside className="auth-brand" aria-label="Ultimate Challenge">
        <div className="auth-court" aria-hidden="true"><i /><b /></div>
        <div className="auth-brand-caption"><span>PREMIER PADEL CLUB</span><strong>O teu próximo<br />desafio começa aqui.</strong><p>M1+ <span>·</span> M1 <span>·</span> M2</p></div>
      </aside>
      <section className="panel auth-card">
        <div className="ultimate-logo auth-logo"><img src="/ultimate-challenge.png" alt="Ultimate Challenge" /></div>
        <span className="auth-eyebrow">ULTIMATE CHALLENGE</span>
        <h1>
          {step === 'code'
            ? 'Valida o teu WhatsApp'
            : registration
              ? 'Entra no Ultimate Challenge'
              : playerLogin
                ? 'Os teus jogos'
                : 'Bem-vindo de volta'}
        </h1>
        <p className="subtitle">
          {step === 'code'
            ? 'Introduz o código de 6 dígitos recebido no WhatsApp.'
            : registration
              ? 'Preenche os teus dados. A entrada depende da aprovação da organização.'
              : 'Acede à tua área para acompanhar o torneio.'}
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
                <div className="field">
                  <label htmlFor="registration-phone">WhatsApp</label>
                  <div className="phone-with-country">
                    <Select value={countryId} onValueChange={v => v && setCountryId(v)}>
                      <SelectTrigger className="phone-country-trigger" aria-label={`País e indicativo: ${country.name}, ${country.dial}`}>
                        <img src={`/flags/${country.id}.png`} width={24} height={16} alt="" /><span>{country.dial}</span>
                      </SelectTrigger>
                      <SelectContent className="phone-country-menu" align="start" alignItemWithTrigger={false}>
                        {phoneCountries.map(c => <SelectItem key={c.id} value={c.id} className="phone-country-option"><img src={`/flags/${c.id}.png`} width={24} height={16} alt="" /><span>{c.name}</span><small>{c.dial}</small></SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input id="registration-phone" required type="tel" inputMode="tel" autoComplete="tel-national" placeholder="Número de telemóvel" value={nationalPhone} maxLength={22} pattern="[0-9]{6,14}" onChange={e => updatePhone(e.target.value)} />
                  </div>
                  <small className="phone-country-help">{country.name} · Introduz o número sem o indicativo.</small>
                </div>
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
createRoot(document.getElementById('root')!).render(location.pathname.replace(/\/$/,'') === '/regras' ? <RulesPage /> : <App />);
