'use client';
import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Users,
  UserRoundPlus,
  Trophy,
  Shuffle,
  CalendarDays,
  MapPin,
  MessageCircle,
  History,
  Settings,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  Check,
  ShieldCheck,
  Flag,
} from 'lucide-react';
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import WorkspaceViews from '@/components/workspace-views';
import AgentTools from '@/components/agent-tools';
import WhatsAppLive from '@/components/whatsapp-live';
import type { Player, Court, Game } from '@/lib/tournament';
export type LiveState = {
  players: Player[];
  courts: Court[];
  games: Game[];
  audit: string[];
  revision: number;
};
import {
  initialPlayers,
  initialGames,
  initialCourts,
  rankings,
  divisions,
} from '@/lib/tournament';
const menus = [
  ['Visão geral', LayoutDashboard],
  ['Inscrições', UserRoundPlus],
  ['Jogadores', Users],
  ['Classificação', Trophy],
  ['Rondas e sorteios', Shuffle],
  ['Jogos e resultados', CalendarDays],
  ['Campos', MapPin],
  ['WhatsApp', MessageCircle],
  ['Histórico', History],
  ['Configurações', Settings],
] as const;
export function Badge({
  children,
  tone = 'green',
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Avatar({ name, size = '' }: { name: string; size?: string }) {
  return (
    <span className={`avatar ${size} color-${name.length % 5}`}>
      {name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')}
    </span>
  );
}
function Nav({
  view,
  onChange,
  pending,
}: {
  view: string;
  onChange: (v: string) => void;
  pending: number;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar className="escada-sidebar">
      <SidebarHeader>
        <div className="ultimate-logo sidebar-logo"><img src="/ultimate-challenge.png" alt="Ultimate Challenge" /></div>
        <p className="brand-caption">PADEL · PAINEL DA ORGANIZAÇÃO</p>
      </SidebarHeader>
      <SidebarContent>
        <p className="nav-label">TORNEIO</p>
        <SidebarMenu>
          {menus.map(([label, Icon], i) => (
            <SidebarMenuItem key={label}>
              {i === 7 && <p className="nav-label nav-second">ORGANIZAÇÃO</p>}
              <SidebarMenuButton
                isActive={view === label}
                onClick={() => {
                  onChange(label);
                  setOpenMobile(false);
                }}
                className="nav-item"
              >
                <Icon />
                <span>{label}</span>
                {label === 'Inscrições' && pending > 0 && (
                  <b className="nav-count">{pending}</b>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <div className="admin">
          <Avatar name="Administrador" />
          <div>
            Administrador<small>Organização do torneio</small>
          </div>
          <ShieldCheck size={17} />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
export default function Backoffice({
  liveState,
  onSave,
}: {
  liveState?: LiveState;
  onSave?: (state: LiveState) => Promise<LiveState>;
} = {}) {
  const [audit, setAudit] = useState<string[]>(liveState?.audit ?? []);
  const [view, setView] = useState('Visão geral');
  const [players, setPlayers] = useState(liveState?.players ?? initialPlayers);
  const [games, setGames] = useState(liveState?.games ?? initialGames);
  const [courts, setCourts] = useState(liveState?.courts ?? initialCourts);
  const [revision, setRevision] = useState(liveState?.revision ?? 0);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  async function save(nextPlayers?: Player[], nextAudit?: string[]) {
    if (!onSave) return;
    setSaving(true);
    try {
      const saved = await onSave({ players: nextPlayers ?? players, courts, games, audit: nextAudit ?? audit, revision });
      setPlayers(saved.players);
      setCourts(saved.courts);
      setGames(saved.games);
      setAudit(saved.audit);
      setRevision(saved.revision);
      setSaveNote('Alterações guardadas na base de dados.');
    } catch (e) {
      setSaveNote((e as Error).message);
      if (nextPlayers) throw e;
    } finally {
      setSaving(false);
    }
  }
  const [division, setDivision] = useState('Todas');
  const pending = players.filter((p) => p.status === 'Pendente');
  const active = players.filter((p) => p.status === 'Ativo');
  const month = liveState ? new Date().toISOString().slice(0, 7) : '2026-09';
  const ranks = rankings(players, games, month);
  const leaders = divisions.map((d) => ranks.find((p) => p.division === d));
  return (
    <SidebarProvider>
      <AgentTools players={players} games={games} />
      <Nav view={view} onChange={setView} pending={pending.length} />
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <SidebarTrigger aria-label="Abrir menu" />
            <span>Organização</span>
            <ChevronRight size={14} />
            <strong>{view}</strong>
          </div>
          <div className="top-actions">
            {liveState && (
              <Button
                variant="ghost"
                onClick={async () => {
                  await fetch('/api/logout', { method: 'POST' });
                  location.reload();
                }}
              >
                Sair
              </Button>
            )}
            <span className="connection">
              <span className="offline-dot" />{' '}
              {liveState ? 'WhatsApp · Baileys' : 'WhatsApp desligado'}
            </span>
            <span className="top-divider" />
            <Avatar name="Administrador" />
          </div>
        </header>
        <main className="main">
          <div className="demo-strip">
            <span>
              <span className="demo-dot" />{' '}
              {liveState
                ? 'Instalação local · PostgreSQL'
                : 'Ambiente de demonstração'}
            </span>
            <span>
              {liveState
                ? 'Guarda as alterações antes de sair.'
                : 'Dados fictícios · alterações válidas durante esta sessão'}
            </span>
          </div>
          <div className="page-heading">
            <div>
              <p className="eyebrow">O TEU TORNEIO, EM JOGO</p>
              <h1>{view}</h1>
              <p className="subtitle">
                {view === 'Visão geral'
                  ? 'Tudo a postos para a próxima ronda.'
                  : 'Gere o teu torneio Ultimate Challenge.'}
              </p>
            </div>
            <div className="heading-actions">
              {liveState && (
                <Button
                  variant="outline"
                  className="primary-action"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? 'A guardar…' : 'Guardar alterações'}
                </Button>
              )}
            </div>
          </div>
          {saveNote && (
            <p role="status" className="feedback success">
              {saveNote}
            </p>
          )}
          <div className="period-row">
            <div className="period">
              <CalendarDays size={17} />
              <strong>
                {new Date(month + '-15T12:00:00').toLocaleDateString('pt-PT', {
                  month: 'long',
                  year: 'numeric',
                })}
              </strong>
              <Badge tone="neutral">Mês ativo</Badge>
            </div>
            <div className="division-filters">
              {['Todas', ...divisions].map((d) => (
                <button
                  className={division === d ? 'selected' : ''}
                  onClick={() => setDivision(d)}
                  key={d}
                >
                  {d === 'Todas' ? 'Todas as divisões' : d}
                </button>
              ))}
            </div>
          </div>
          {view === 'Visão geral' ? (
            <>
              <div className="stats-grid">
                {[
                  {
                    label: 'Jogadores ativos',
                    value: active.length,
                    detail: '3 divisões · esquerda e direita',
                    Icon: Users,
                  },
                  {
                    label: 'Jogos realizados',
                    value: games.filter((g) => g.winner).length,
                    detail: 'Resultados confirmados',
                    Icon: CalendarDays,
                  },
                  {
                    label: 'Inscrições pendentes',
                    value: pending.length,
                    detail: 'Aguardam a tua decisão',
                    Icon: UserRoundPlus,
                  },
                  {
                    label: 'Campos disponíveis',
                    value: courts.filter((c) => c.active).length,
                    detail: 'Prontos para a próxima ronda',
                    Icon: MapPin,
                  },
                ].map(({ label, value, detail, Icon }, i) => (
                  <button
                    key={label}
                    className="stat-card"
                    onClick={() =>
                      setView(
                        [
                          'Jogadores',
                          'Jogos e resultados',
                          'Inscrições',
                          'Campos',
                        ][i],
                      )
                    }
                  >
                    <div className="stat-top">
                      <span>{label}</span>
                      <Icon size={19} />
                    </div>
                    <div className="stat-value">
                      {String(value).padStart(2, '0')}
                      <ArrowUpRight size={20} />
                    </div>
                    <p>{detail}</p>
                  </button>
                ))}
              </div>
              <div className="overview-grid">
                <section className="panel next-round">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">PRÓXIMA SEMANA</span>
                      <h2>O próximo jogo começa aqui.</h2>
                    </div>
                    <span className="round-icon">
                      <Shuffle size={25} />
                    </span>
                  </div>
                  <p>
                    Novos parceiros. Novos confrontos.
                    <br />
                    Prepara o sorteio e leva a escada mais acima.
                  </p>
                  <div className="round-bottom">
                    <div>
                      <strong>
                        Ronda{' '}
                        {String(
                          Math.max(0, ...games.map((g) => g.round)) + 1,
                        ).padStart(2, '0')}
                      </strong>
                      <span>Prepara os próximos confrontos</span>
                    </div>
                    <Button onClick={() => setView('Rondas e sorteios')}>
                      Preparar sorteio <ArrowRight size={17} />
                    </Button>
                  </div>
                </section>
                <section className="panel attention">
                  <div className="section-heading">
                    <h2>Precisa de atenção</h2>
                    <span className="number-pill">{pending.length}</span>
                  </div>
                  <button
                    className="attention-item"
                    onClick={() => setView('Inscrições')}
                  >
                    <span className="attention-icon">
                      <UserRoundPlus size={21} />
                    </span>
                    <div>
                      <strong>{pending.length} novas inscrições</strong>
                      <p>Revê os jogadores que querem entrar.</p>
                    </div>
                    <ChevronRight size={17} />
                  </button>
                  <button
                    className="attention-item"
                    onClick={() => setView('WhatsApp')}
                  >
                    <span className="attention-icon gray">
                      <MessageCircle size={21} />
                    </span>
                    <div>
                      <strong>WhatsApp por configurar</strong>
                      <p>
                        {liveState
                          ? 'Abre o painel para ligar por QR.'
                          : 'Ligação disponível na próxima etapa.'}
                      </p>
                    </div>
                    <ChevronRight size={17} />
                  </button>
                </section>
              </div>
              <div className="section-heading outside">
                <div>
                  <h2>
                    Na frente da escada <Trophy size={18} />
                  </h2>
                  <p>Um líder por divisão. O mês ainda está em jogo.</p>
                </div>
                <button
                  className="text-link"
                  onClick={() => setView('Classificação')}
                >
                  Ver classificação <ArrowRight size={15} />
                </button>
              </div>
              <div className="leader-grid">
                {leaders
                  .filter(
                    (p) =>
                      p && (division === 'Todas' || p.division === division),
                  )
                  .map(
                    (p) =>
                      p && (
                        <button
                          className="panel leader-card"
                          key={p.id}
                          onClick={() => {
                            setDivision(p.division);
                            setView('Classificação');
                          }}
                        >
                          <div className="leader-top">
                            <Badge
                              tone={
                                p.division === 'M1+'
                                  ? 'purple'
                                  : p.division === 'M1'
                                    ? 'blue'
                                    : 'green'
                              }
                            >
                              {p.division}
                            </Badge>
                            <span>
                              01 <Trophy size={15} />
                            </span>
                          </div>
                          <div className="leader-person">
                            <Avatar name={p.name} size="large" />
                            <div>
                              <h3>{p.name}</h3>
                              <p>
                                {p.side} · {p.wins} vitória
                                {p.wins !== 1 ? 's' : ''}
                              </p>
                            </div>
                            <div className="points">
                              <strong>{p.points}</strong>
                              <span>pontos</span>
                            </div>
                          </div>
                          <div className="leader-footer">
                            <span className="live-dot" /> Líder provisório{' '}
                            <span>Desempate por idade</span>
                          </div>
                        </button>
                      ),
                  )}
              </div>
              <section className="panel recent">
                <div className="section-heading">
                  <div>
                    <h2>Últimos jogos</h2>
                    <p>Consulta os confrontos do torneio</p>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => setView('Jogos e resultados')}
                  >
                    Ver todos <ArrowRight size={15} />
                  </button>
                </div>
                {games
                  .filter(
                    (g) => division === 'Todas' || g.division === division,
                  )
                  .slice(0, 3)
                  .map((g) => (
                    <div className="recent-game" key={g.id}>
                      <div className="court-cell">
                        <MapPin size={17} />
                        <div>
                          <strong>
                            {courts.find((c) => c.id === g.court)?.name}
                          </strong>
                          <small>
                            {g.date.slice(8)} set · {g.time}
                          </small>
                        </div>
                      </div>
                      <Badge tone="neutral">{g.division}</Badge>
                      <div
                        className={`team ${g.winner === 'a' ? 'winning' : ''}`}
                      >
                        {g.a
                          .map((id) => players.find((p) => p.id === id)?.name)
                          .join(' / ')}
                        {g.winner === 'a' && <Check size={16} />}
                      </div>
                      <span className="versus">vs</span>
                      <div
                        className={`team ${g.winner === 'b' ? 'winning' : ''}`}
                      >
                        {g.b
                          .map((id) => players.find((p) => p.id === id)?.name)
                          .join(' / ')}
                        {g.winner === 'b' && <Check size={16} />}
                      </div>
                      <Badge>{g.winner ? 'Confirmado' : 'Agendado'}</Badge>
                    </div>
                  ))}
              </section>
            </>
          ) : view === 'WhatsApp' && liveState ? (
            <WhatsAppLive />
          ) : (
            <WorkspaceViews
              saving={saving}
              onSavePlayers={onSave ? save : undefined}
              live={!!liveState}
              audit={audit}
              setAudit={setAudit}
              key={view}
              view={view}
              division={division}
              players={players}
              setPlayers={setPlayers}
              games={games}
              setGames={setGames}
              courts={courts}
              setCourts={setCourts}
            />
          )}
          <footer className="page-footer">
            <span>
              ULTIMATE CHALLENGE <span> / </span> PADEL
            </span>
            <span>Feito para manter o jogo a andar.</span>
          </footer>
        </main>
      </div>
    </SidebarProvider>
  );
}
