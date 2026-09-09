'use client';
import {nextRoundCalendar,normalizeCalendar,scheduleDivisions,type WeeklyCalendar,type RoundCalendar} from '../lib/weekly-calendar';
import Substitutions from './substitutions';
import RulesEditor from './rules-editor';
import CalendarSettings from './calendar-settings';
import {api} from './whatsapp-live';
import AIBotSettings from './ai-bot-settings';
import OpenAISettings from './openai-settings';
import CompetitionLive from './competition-live';
import {
  useState,
  useEffect,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from 'react';
import {
  Search,
  Plus,
  ArrowRight,
  Check,
  UserRoundPlus,
  Users,
  MapPin,
  Shuffle,
  CalendarDays,
  Trophy,
  ShieldCheck,
  MessageCircle,
  Unplug,
  History,
  SlidersHorizontal,
  Copy,
  Pencil,
  CheckCircle2,
  AlertCircle,
  Clock,
  Link as LinkIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from '@/components/ui/empty';
import { Badge, Avatar } from '@/components/backoffice';
import {
  divisions,
  draw,
  rankings,
  conflict,
  type Player,
  type Court,
  type Game,
  type Division,
} from '@/lib/tournament';
type Props = {
  saving?: boolean;
  onSavePlayers?: (players: Player[], audit: string[]) => Promise<void>;
  onSaveChanges?: (changes: {courts?:Court[];games?:Game[];audit:string[]}) => Promise<void>;
  live?: boolean;
  audit: string[];
  setAudit: Dispatch<SetStateAction<string[]>>;
  view: string;
  division: string;
  players: Player[];
  setPlayers: Dispatch<SetStateAction<Player[]>>;
  courts: Court[];
  setCourts: Dispatch<SetStateAction<Court[]>>;
  games: Game[];
  setGames: Dispatch<SetStateAction<Game[]>>;
};
function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-label={label} className="choice">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((v) => (
          <SelectItem value={v} key={v}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Blank({ title, description }: { title: string; description: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Search />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
const formatDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: 'short',
  });
const blankPlayer: Player = {
  id: '',
  name: '',
  phone: '+244',
  birth: '',
  side: 'Esquerda',
  division: 'M1',
  status: 'Pendente',
  verified: false,
  note: '',
};
export default function WorkspaceViews({
  live = false,
  audit,
  setAudit,
  saving,
  onSavePlayers,
  onSaveChanges,
  view,
  division,
  players,
  setPlayers,
  courts,
  setCourts,
  games,
  setGames,
}: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('Todos');
  const [side, setSide] = useState('Todos os lados');
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [editCourt, setEditCourt] = useState<Court | null>(null);
  const [editGame, setEditGame] = useState<Game | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [message, setMessage] = useState('');
  const [excluded, setExcluded] = useState<string[]>([]);
  const [settingsTab,setSettingsTab]=useState('general');
  const [calendarLoading,setCalendarLoading]=useState(!!live);
  const [calendarError,setCalendarError]=useState('');
  const month = live ? new Date().toISOString().slice(0, 7) : '2026-09';
  const monthEnd = new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
  const [roundCalendar,setRoundCalendar]=useState<RoundCalendar>(()=>nextRoundCalendar(normalizeCalendar(),games,live?new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Luanda'}).format(new Date()):'2026-09-07'));
  useEffect(()=>{if(!live)return;let active=true;setCalendarLoading(true);setCalendarError('');
    api<WeeklyCalendar>('/admin/calendar').then(c=>{
      if(active)setRoundCalendar(nextRoundCalendar(c,games,new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Luanda'}).format(new Date())));
    }).catch(e=>{if(active)setCalendarError(e.message);}).finally(()=>{if(active)setCalendarLoading(false);});
    return()=>{active=false;};
  },[live,view]);
  const [reason, setReason] = useState('');
  const inform = (text: string) => {
    setNotice(
      live
        ? text
        : text,
    );
    setError('');
  };
  const log = (text: string) => setAudit((a) => [text, ...a]);
  async function persist(changes:{courts?:Court[];games?:Game[]},entry:string) {
    if(saving)return false;
    try {
      if(live && onSaveChanges) await onSaveChanges({...changes,audit:[entry,...audit]});
      else {if(changes.courts)setCourts(changes.courts);if(changes.games)setGames(changes.games);log(entry);}
      setError('');return true;
    } catch(e){setError((e as Error).message);setNotice('');return false;}
  }
  const active = players.filter((p) => p.status === 'Ativo');
  const filtered = players.filter(
    (p) =>
      (division === 'Todas' || p.division === division) &&
      (side === 'Todos os lados' || p.side === side) &&
      (status === 'Todos' || p.status === status) &&
      (view !== 'Inscrições' || ['Pendente', 'Rejeitado'].includes(p.status)) &&
      (view !== 'Jogadores' || ['Ativo', 'Inativo'].includes(p.status)) &&
      `${p.name} ${p.phone}`
        .toLocaleLowerCase('pt')
        .includes(search.toLocaleLowerCase('pt')),
  );
  const rank = rankings(players, games, month);
  const name = (id: string) =>
    players.find((p) => p.id === id)?.name ?? 'Jogador removido';
  const teams = (g: Game, team: 'a' | 'b') => g[team].map(name).join(' / ');
  const pendingRound = games.find((g) => !g.published)?.round;
  const nextRound =
    pendingRound ?? Math.max(0, ...games.map((g) => g.round)) + 1;
  const roundGames = games.filter((g) => g.round === nextRound);
  const relevantGames = games.filter(
    (g) =>
      (division === 'Todas' || g.division === division) &&
      (status === 'Todos' ||
        (status === 'Confirmados' ? !!g.winner : !g.winner)),
  );
  async function playerAction(action: 'save' | 'approve' | 'reject') {
    if (saving) return;
    if (!editPlayer) return;
    const p = {
      ...editPlayer,
      name: editPlayer.name.trim(),
      phone: editPlayer.phone.replace(/[\s()-]/g, ''),
    };
    if (
      !p.name ||
      !/^\+[1-9]\d{7,14}$/.test(p.phone) ||
      !p.birth ||
      p.birth > new Date().toISOString().slice(0, 10)
    ) {
      setError(
        'Preenche o nome, um WhatsApp com indicativo válido e uma data de nascimento válida.',
      );
      return;
    }
    if (players.some((x) => x.id !== p.id && x.phone === p.phone)) {
      setError('Já existe um jogador com este número de WhatsApp.');
      return;
    }
    if (action === 'approve' && !p.verified) {
      setError(
        'O WhatsApp ainda não está validado. Este candidato não pode ser aprovado.',
      );
      return;
    }
    if (action === 'reject' && !p.note.trim()) {
      setError('Indica o motivo da rejeição na nota interna.');
      return;
    }
    const original = players.find((x) => x.id === p.id);
    if (original && p.phone !== original.phone) {
      p.verified = false;
      p.status = 'Pendente';
    }
    if (action === 'approve') p.status = 'Ativo';
    if (action === 'reject') p.status = 'Rejeitado';
    if (!p.id) p.id = crypto.randomUUID();
    if (live && onSavePlayers) {
      const next = players.some(x => x.id === p.id) ? players.map(x => x.id === p.id ? p : x) : [...players,p];
      const entry = `${p.name}: ${action === 'approve' ? 'inscrição aprovada' : action === 'reject' ? 'inscrição rejeitada' : 'dados guardados'}.`;
      try {
        await onSavePlayers(next,[entry,...audit]);
        setEditPlayer(null);
        setNotice(action === 'approve' ? 'Inscrição aprovada. Pedido de entrada no grupo colocado na fila do WhatsApp.' : action === 'reject' ? 'Inscrição rejeitada e guardada.' : 'Dados do jogador guardados.');
      } catch(e) { setError((e as Error).message); }
      return;
    }
    setPlayers((list) =>
      list.some((x) => x.id === p.id)
        ? list.map((x) => (x.id === p.id ? p : x))
        : [...list, p],
    );
    log(
      `${p.name}: ${action === 'approve' ? 'inscrição aprovada' : action === 'reject' ? 'inscrição rejeitada' : 'dados guardados'}.`,
    );
    setEditPlayer(null);
    inform(
      action === 'approve'
        ? 'Inscrição aprovada na demonstração. Não foi enviado convite WhatsApp.'
        : 'Dados atualizados nesta sessão.',
    );
  }
  async function saveCourt() {
    if (saving || !editCourt) return;
    if (!editCourt.name.trim() || !editCourt.location.trim()) {
      setError('Indica o nome e o local do campo.');
      return;
    }
    if (
      courts.some(
        (c) =>
          c.id !== editCourt.id &&
          c.name.toLowerCase() === editCourt.name.trim().toLowerCase(),
      )
    ) {
      setError('Já existe um campo com esse nome.');
      return;
    }
    if (
      !editCourt.active &&
      games.some((g) => g.court === editCourt.id && !g.winner)
    ) {
      setError(
        'Este campo tem jogos por realizar. Reagenda-os antes de o desativar.',
      );
      return;
    }
    const c = {
      ...editCourt,
      id: editCourt.id || crypto.randomUUID(),
      name: editCourt.name.trim(),
    };
    if(!await persist({courts:courts.some(x=>x.id===c.id)?courts.map(x=>x.id===c.id?c:x):[...courts,c]},`Campo ${c.name} atualizado.`))return;
    setEditCourt(null);
    inform('Campo guardado.');
  }
  async function generate() {
    try {
      const available = courts.filter((c) => c.active);
      if (!available.length)
        throw new Error('Adiciona pelo menos um campo ativo.');
      if (games.some((g) => g.round !== nextRound && !g.winner))
        throw new Error(
          'Conclui os resultados da ronda anterior antes de preparar outra.',
        );
      const prior = games.filter((g) => g.round < nextRound);
      for(const division of divisions){
        if(!players.some(p=>p.status==='Ativo'&&p.verified&&p.division===division&&!excluded.includes(p.id)))continue;
        const slot=roundCalendar[division];
        if(!slot.date||!slot.time)throw new Error('Indica a data e a hora de '+division+'.');
        const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Luanda'}).format(new Date());
        if(live&&slot.date<today)throw new Error('A data de '+division+' já passou.');
        const latest=prior.filter(g=>g.division===division).map(g=>g.date).sort().at(-1);
        if(latest&&(Date.parse(slot.date)-Date.parse(latest))/86400000<7)throw new Error('A divisão '+division+' deve jogar pelo menos uma semana depois da ronda anterior.');
      }      const pairs = draw(
        players.filter((p) => !excluded.includes(p.id)),
        prior,
        nextRound,
      );
      if(calendarLoading||calendarError)throw new Error(calendarError||'A carregar o calendário.');
      const generated = scheduleDivisions(pairs, available, nextRound, roundCalendar);
      if (generated.some((g) => conflict(g, [...prior, ...generated])))
        throw new Error(
          'Existe conflito de campo ou jogador no horário proposto.',
        );
      const encounters = generated.map(g=>[...g.a,...g.b].sort().join('|'));
      const repeated = encounters.length - new Set(encounters).size;
      if(!await persist({games:[...prior,...generated]},`Ronda ${nextRound} sorteada.`))return;
      inform(
        `Ronda ${nextRound} sorteada: ${generated.length} jogos de 20 minutos, dupla fixa. ${repeated ? repeated + " confrontos repetidos por limitação de duplas/campos." : "Sem repetir adversários."}`,
      );
    } catch (e) {
      setError((e as Error).message);
      setNotice('');
    }
  }
  async function saveGame() {
    if (saving || !editGame) return;
    if (
      !editGame.date.startsWith(month) ||
      !editGame.time ||
      editGame.duration < 15 ||
      editGame.duration > 240
    ) {
      setError(
        'Indica data no mês ativo, hora e duração entre 15 e 240 minutos.',
      );
      return;
    }
    if (!courts.some((c) => c.id === editGame.court && c.active)) {
      setError('Seleciona um campo ativo.');
      return;
    }
    if (conflict(editGame, games)) {
      setError('O campo ou um dos jogadores já está ocupado nesse período.');
      return;
    }
    const sameRound = games.find(
      (g) => g.round === editGame.round && g.id !== editGame.id,
    );
    if (sameRound && editGame.date !== sameRound.date) {
      setError(
        'Nesta versão, todos os jogos da ronda devem manter a mesma data.',
      );
      return;
    }
    const old = games.find((g) => g.id === editGame.id);
    if (old?.winner && old.winner !== editGame.winner && !reason.trim()) {
      setError('Indica o motivo da correção do resultado.');
      return;
    }
    if(!await persist({games:games.map(g=>g.id===editGame.id?editGame:g)},`Jogo ${editGame.id.slice(0,6)} atualizado${reason?`: ${reason}`:'.'}`))return;
    setEditGame(null);
    inform('Jogo atualizado. A classificação foi recalculada.');
  }
  function previewMessage() {
    const sections = divisions
      .map((d) => {
        const rows = games.filter(
          (g) => g.round === nextRound && g.division === d,
        );
        if (!rows.length) return '';
        return `${d}\n${rows.map((g) => `${formatDate(g.date)} · ${g.time} · ${courts.find((c) => c.id === g.court)?.name}\n${teams(g, 'a')}\ncontra ${teams(g, 'b')}`).join('\n\n')}`;
      })
      .filter(Boolean);
    setMessage(
      `🎾 Ultimate Challenge · Ronda ${nextRound}\n\n${sections.join('\n\n──────────\n\n')}\n\nO link de resultados das quatro divisões será incluído quando a integração estiver ativa.\n\nPré-visualização — nenhuma mensagem foi enviada.`,
    );
  }
  return (
    <>
      {notice && (
        <div className="feedback success" role="status">
          <CheckCircle2 size={18} />
          {notice}
          <button aria-label="Fechar aviso" onClick={() => setNotice('')}>
            ×
          </button>
        </div>
      )}
      {error && !editPlayer && !editCourt && !editGame && (
        <div className="feedback error" role="alert">
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      {(view === 'Inscrições' || view === 'Jogadores') && (
        <section className="panel data-panel">
          <div className="section-heading">
            <div>
              <h2>
                {view === 'Inscrições'
                  ? 'Novas caras na escada'
                  : 'Os teus jogadores'}{' '}
                <Badge tone="neutral">{filtered.length}</Badge>
              </h2>
              <p>
                {view === 'Inscrições'
                  ? 'Valida os dados e decide quem entra no torneio.'
                  : 'Todos os perfis, organizados por divisão e lado.'}
              </p>
            </div>
            <Button
              onClick={() => {
                setError('');
                setEditPlayer({ ...blankPlayer });
              }}
            >
              <Plus size={16} /> Nova inscrição
            </Button>
          </div>
          <div className="table-toolbar">
            <div className="search-input">
              <Search size={16} />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar nome ou WhatsApp…"
                aria-label="Pesquisar jogadores"
              />
            </div>
            <Choice
              label="Lado"
              value={side}
              onChange={setSide}
              options={['Todos os lados', 'Esquerda', 'Direita']}
            />
            <Choice
              label="Estado"
              value={status}
              onChange={setStatus}
              options={
                view === 'Inscrições'
                  ? ['Todos', 'Pendente', 'Rejeitado']
                  : ['Todos', 'Ativo', 'Inativo']
              }
            />
          </div>
          {filtered.length ? (
            <>
              <div className="desktop-table">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        'Jogador',
                        'Divisão',
                        'Lado',
                        'WhatsApp',
                        'Estado',
                        '',
                      ].map((h, i) => (
                        <TableHead key={i}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="person-cell">
                            <Avatar name={p.name} />
                            <div>
                              <strong>{p.name}</strong>
                              <small>
                                {new Date(
                                  p.birth + 'T12:00:00',
                                ).toLocaleDateString('pt-PT')}
                              </small>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
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
                        </TableCell>
                        <TableCell>{p.side}</TableCell>
                        <TableCell>
                          <span className="phone">{p.phone}</span>
                          <small
                            className={p.verified ? 'verified' : 'unverified'}
                          >
                            {p.verified ? '✓ Validado' : 'Por validar'}
                          </small>
                        </TableCell>
                        <TableCell>
                          <Badge
                            tone={
                              p.status === 'Ativo'
                                ? 'green'
                                : p.status === 'Rejeitado'
                                  ? 'red'
                                  : 'amber'
                            }
                          >
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setError('');
                              setEditPlayer({ ...p });
                            }}
                          >
                            {view === 'Inscrições' ? 'Rever' : 'Ver perfil'}
                            <ArrowRight size={15} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mobile-records">
                {filtered.map((p) => (
                  <button
                    className="mobile-record"
                    key={p.id}
                    onClick={() => {
                      setError('');
                      setEditPlayer({ ...p });
                    }}
                  >
                    <div className="person-cell">
                      <Avatar name={p.name} />
                      <div>
                        <strong>{p.name}</strong>
                        <small>
                          {p.side} · {p.division}
                        </small>
                      </div>
                      <ArrowRight size={16} />
                    </div>
                    <div>
                      <Badge tone={p.status === 'Ativo' ? 'green' : 'amber'}>
                        {p.status}
                      </Badge>
                      <span>
                        {p.verified
                          ? 'WhatsApp validado'
                          : 'WhatsApp por validar'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <Blank
              title="Nenhum jogador encontrado"
              description="Experimenta outra pesquisa ou altera os filtros."
            />
          )}
          <div className="table-bottom">
            <span>{filtered.length} registos</span>
            <span>
              {live
                ? 'Dados dos jogadores registados.'
                : 'Os números e nomes são fictícios nesta demonstração.'}
            </span>
          </div>
        </section>
      )}
      {view === 'Classificação' && (
        <>
          <div className="info-note">
            <Trophy size={20} />
            <span>
              <strong>4 divisões. 4 vencedores.</strong> O jogador com mais
              pontos vence, independentemente do lado. Em caso de empate, vence
              o mais velho.
            </span>
          </div>
          {divisions
            .filter((d) => division === 'Todas' || d === division)
            .map((d) => (
              <section className="panel data-panel ranking-panel" key={d}>
                <div className="section-heading">
                  <h2>
                    <Badge
                      tone={
                        d === 'M1+' ? 'purple' : d === 'M1' ? 'blue' : 'green'
                      }
                    >
                      {d}
                    </Badge>{' '}
                    Classificação individual
                  </h2>
                  <span className="muted">{month} · provisória</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        '#',
                        'Jogador',
                        'Lado',
                        'V',
                        'D',
                        'Bónus',
                        'Pontos',
                      ].map((h) => (
                        <TableHead key={h}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rank
                      .filter((p) => p.division === d)
                      .map((p, i) => (
                        <TableRow
                          key={p.id}
                          className={i === 0 ? 'rank-first' : ''}
                        >
                          <TableCell>
                            {i === 0 ? (
                              <Trophy size={17} />
                            ) : (
                              String(i + 1).padStart(2, '0')
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="person-cell">
                              <Avatar name={p.name} />
                              <strong>{p.name}</strong>
                            </div>
                          </TableCell>
                          <TableCell>{p.side}</TableCell>
                          <TableCell>{p.wins}</TableCell>
                          <TableCell>{p.losses}</TableCell>
                          <TableCell>+{p.bonus}</TableCell>
                          <TableCell>
                            <strong className="rank-points">{p.points}</strong>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </section>
            ))}
        </>
      )}
      {view === 'Campos' && (
        <>
          <div className="section-heading">
            <div>
              <h2>Onde o jogo acontece</h2>
              <p>{courts.filter((c) => c.active).length} campos ativos</p>
            </div>
            <Button
              onClick={() => {
                setError('');
                setEditCourt({
                  id: '',
                  name: '',
                  location: 'Premier Padel Club',
                  active: true,
                });
              }}
            >
              <Plus size={16} /> Adicionar campo
            </Button>
          </div>
          <div className="court-grid">
            {courts.map((c) => (
              <section className="panel court-card" key={c.id}>
                <div className="court-visual" aria-hidden="true">
                  <span className="court-net" />
                  <span className="court-service one" />
                  <span className="court-service two" />
                  <span className="court-middle" />
                  <span className="court-number">{c.name}</span>
                </div>
                <div className="section-heading">
                  <h2>{c.name}</h2>
                  <Badge tone={c.active ? 'green' : 'neutral'}>
                    {c.active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                <p className="court-location">
                  <MapPin size={15} />
                  {c.location}
                </p>
                <div className="court-footer">
                  <span>
                    {games.filter((g) => g.court === c.id && !g.winner).length}{' '}
                    jogos agendados
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setError('');
                      setEditCourt({ ...c });
                    }}
                  >
                    <Pencil size={14} /> Editar
                  </Button>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      {view === 'Rondas e sorteios' && (
        <>
          {live && <Substitutions />}
          <div className="round-workflow">
            <span className="step active">
              1 <b>Participantes</b>
            </span>
            <span className={`step ${roundGames.length ? 'active' : ''}`}>
              2 <b>Sorteio e horários</b>
            </span>
            <span className="step">
              3 <b>Revisão</b>
            </span>
          </div>
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Preparar a ronda {String(nextRound).padStart(2, '0')}</h2>
                <p>
                  O sorteio abrange as quatro divisões. Cada jogador faz quatro jogos de 20 minutos, com dupla fixa e rotação de campos.
                </p>
              </div>
              <Badge tone="neutral">Rascunho</Badge>
            </div>
            <div className="round-controls">
              <div className="division-calendar">{divisions.map(d=><div className="division-calendar-row" key={d}><strong>{d}</strong><label>Data dos jogos<Input type="date" value={roundCalendar[d].date} disabled={saving||calendarLoading} onChange={e=>setRoundCalendar({...roundCalendar,[d]:{...roundCalendar[d],date:e.target.value}})}/></label><label>Hora (Angola)<Input type="time" value={roundCalendar[d].time} disabled={saving||calendarLoading} onChange={e=>setRoundCalendar({...roundCalendar,[d]:{...roundCalendar[d],time:e.target.value}})}/></label></div>)}</div>
              <div className="round-summary">                {calendarError&&<p role="alert" className="form-error">{calendarError}</p>}
                <Users size={18} />
                <strong>
                  {active.filter((p) => !excluded.includes(p.id)).length}
                </strong>{' '}
                participantes <span>·</span>
                <MapPin size={18} />
                {courts.filter((c) => c.active).length} campos
              </div>
              <Button disabled={saving||calendarLoading||!!calendarError} onClick={generate}>
                <Shuffle size={17} />
                {roundGames.length ? 'Refazer sorteio' : 'Gerar sorteio'}
              </Button>
            </div>
            <details className="participants">
              <summary>Escolher participantes e gerir ausências</summary>
              <div className="participants-grid">
                {active.map((p) => (
                  <label key={p.id}>
                    <Checkbox
                      checked={!excluded.includes(p.id)}
                      onCheckedChange={(v) =>
                        setExcluded((ids) =>
                          v ? ids.filter((id) => id !== p.id) : [...ids, p.id],
                        )
                      }
                    />
                    <span>
                      {p.name}
                      <small>
                        {p.division} · {p.side}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </details>
            <div className="info-note compact">
              <ShieldCheck size={17} />
              <span>
                Um esquerda + um direita. Sem repetir parceiros da semana
                anterior.
              </span>
            </div>
          </section>
          {roundGames.length > 0 && (
            <>
              <div className="section-heading outside round-results-heading">
                <div>
                  <h2>Sorteio pronto para revisão</h2>
                  <p>Confere os campos e horários antes de finalizar.</p>
                </div>
                <Button
                  variant="outline"
                  disabled={saving || roundGames.every(g=>g.published)}
                  onClick={async () => {
                    if(await persist({games:games.map(g=>g.round===nextRound?{...g,published:true}:g)},`Ronda ${nextRound} publicada.`)) inform('Ronda publicada. O envio ao grupo segue o agendamento configurado.');                  }}
                >
                  <Check size={16} />{' '}
                  {live
                    ? 'Publicar no grupo'
                    : 'Finalizar demonstração'}
                </Button>
              </div>
              <div className="games-grid">
                {roundGames
                  .filter(
                    (g) => division === 'Todas' || g.division === division,
                  )
                  .map((g) => (
                    <GameCard
                      key={g.id}
                      game={g}
                      players={players}
                      courts={courts}
                      onEdit={() => {
                        setError('');
                        setReason('');
                        setEditGame({ ...g });
                      }}
                    />
                  ))}
              </div>
              <section className="panel message-preview">
                <MessageCircle size={22} />
                <div>
                  <h2>Mensagem para o grupo Ultimate Challenge</h2>
                  <p>
                    Uma mensagem com os jogos de M1+, M1, M2+ e M2. O envio ainda não
                    está ligado.
                  </p>
                </div>
                <Button variant="outline" onClick={previewMessage}>
                  Ver mensagem completa
                </Button>
              </section>
            </>
          )}
          {!roundGames.length && (
            <div className="draw-empty">
              <Shuffle size={32} />
              <h2>Uma nova semana, novas duplas.</h2>
              <p>
                Confirma os participantes e gera o sorteio para ver os
                confrontos.
              </p>
            </div>
          )}
        </>
      )}
      {view === 'Jogos e resultados' && (
        <>
          <div className="section-heading">
            <div>
              <h2>Todos os confrontos</h2>
              <p>
                Consulta horários e regista os resultados como administrador.
              </p>
            </div>
            <Choice
              label="Estado do jogo"
              value={status}
              onChange={setStatus}
              options={['Todos', 'Confirmados', 'Por realizar']}
            />
          </div>
          <div className="games-grid">
            {relevantGames.map((g) => (
              <GameCard
                key={g.id}
                game={g}
                players={players}
                courts={courts}
                onEdit={() => {
                  setError('');
                  setReason('');
                  setEditGame({ ...g });
                }}
              />
            ))}
          </div>
          {!relevantGames.length && (
            <Blank
              title="Sem jogos neste filtro"
              description="Escolhe outra divisão ou estado."
            />
          )}
        </>
      )}
      {view === 'WhatsApp' && (
        <>
          <section className="panel integration-panel">
            <span className="integration-icon">
              <MessageCircle size={32} />
            </span>
            <div>
              <Badge tone="amber">Não ligado</Badge>
              <h2>O torneio, dentro da conversa.</h2>
              <p>
                A ligação não oficial por QR será implementada na próxima etapa.
                Nesta versão, não são enviados códigos, convites nem mensagens.
              </p>
            </div>
            <Unplug size={25} />
          </section>
          <section className="panel group-card">
            <Badge tone="neutral">M1+ · M1 · M2+ · M2</Badge>
            <h2>Grupo Ultimate Challenge</h2>
            <p>Um único grupo para todos os jogadores · por associar</p>
            <div className="info-note compact">
              <LinkIcon size={16} /> Convite disponível após configuração
            </div>
          </section>
          <section className="panel next-phase">
            <h2>Cada número, um jogador</h2>
            <p>
              O bot vai associar o número de WhatsApp validado ao perfil na
              plataforma e consultar o nome, a divisão atual, o lado e o jogo da
              semana. Uma mudança de nível não exige mudar de grupo.
            </p>
            <p>
              Números não registados não podem submeter resultados como
              jogadores. No link dos jogos, a identificação depende da sessão
              autenticada na plataforma.
            </p>
          </section>
          <section className="panel next-phase">
            <h2>Fluxo previsto</h2>
            <ol>
              <li>Inscrição com nome, WhatsApp, nascimento, nível e lado.</li>
              <li>Validação do número por código WhatsApp.</li>
              <li>
                Aprovação no backoffice e envio do convite para o grupo único
                Escada.
              </li>
              <li>
                Publicação semanal dos jogos das quatro divisões, com campo, hora
                e link de resultados.
              </li>
            </ol>
          </section>
        </>
      )}
      {view === 'Histórico' && (
        <>
          {live ? <CompetitionLive history /> : <>
          <section className="panel">
            <div className="section-heading">
              <h2>Histórico mensal</h2>
              <Badge tone="neutral">{month} em curso</Badge>
            </div>
            <Blank
              title="Ainda não há meses concluídos"
              description="Os três vencedores e a classificação final ficam guardados aqui após o fecho mensal."
            />
          </section>
          </>}
          <section className="panel audit-panel">
            <h2>Atividade nesta sessão</h2>
            {audit.length ? (
              <ul>
                {audit.map((item, i) => (
                  <li key={i}>
                    <CheckCircle2 size={15} />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">As alterações registadas aparecem aqui.</p>
            )}
          </section>
        </>
      )}
      {view === 'Configurações' && (
        <>
          {live && <div className="message-filters" role="group" aria-label="Separadores das configurações"><Button variant={settingsTab==='general'?'default':'outline'} onClick={()=>setSettingsTab('general')}>Geral</Button><Button variant={settingsTab==='calendar'?'default':'outline'} onClick={()=>setSettingsTab('calendar')}>Calendário</Button><Button variant={settingsTab==='rules'?'default':'outline'} onClick={()=>setSettingsTab('rules')}>Regras</Button></div>}
          {live && settingsTab==='rules' && <RulesEditor />}
          {live && settingsTab==='calendar' && <CalendarSettings />}
          <div hidden={live && settingsTab!=='general'}>
          {live && <OpenAISettings />}
          {live && <AIBotSettings />}
          <section className="panel">
            <div className="section-heading">
              <h2>Regulamento definido</h2>
              <Badge>Escada individual</Badge>
            </div>
            <div className="rules-grid">
              {[
                ['Divisões', 'M1+, M1, M2+ e M2'],
                ['Frequência', '4 jogos de 20 minutos por semana'],
                ['Vitória', '3 pontos'],
                ['Derrota', '1 ponto'],
                [
                  'Bónus de sequência',
                  '+1 em cada vitória consecutiva; reinicia em cada semana',
                ],
                ['Duplas', 'Não repetir na semana seguinte'],
                ['Vencedores mensais', '1 por divisão · 3 no total'],
                ['Desempate', 'Vence o jogador mais velho'],
                ['M1+', 'Não sobe para outra divisão'],
                ['M2', 'Não desce para outra divisão'],
                ['Trocas', 'A cada 14 dias · 1 esquerda + 1 direita'],
                ['Pontos nas trocas', 'Mantém os pontos acumulados'],
                ['Pontos mensais', 'Começam a zero em cada mês'],
              ].map(([a, b]) => (
                <div key={a}>
                  <span>{a}</span>
                  <strong>{b}</strong>
                </div>
              ))}
            </div>
          </section>
          {live && <CompetitionLive />}
          </div>
        </>
      )}
      <Dialog
        open={!!editPlayer}
        onOpenChange={(open) => {
          if (saving) return;
          if (!open) {
            setEditPlayer(null);
            setError('');
          }
        }}
      >
        <DialogContent className="edit-dialog">
          <DialogHeader>
            <DialogTitle>
              {editPlayer?.id ? 'Ficha do jogador' : 'Nova inscrição'}
            </DialogTitle>
            <DialogDescription>
              {live
                ? 'Confirma nesta janela para guardar os dados do jogador.'
                : 'Dados de demonstração. Nenhum contacto será efetuado.'}
            </DialogDescription>
          </DialogHeader>
          {editPlayer && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                playerAction('save');
              }}
            >
              <div className="form-grid">
                <Field label="Nome completo">
                  <Input
                    required
                    value={editPlayer.name}
                    onChange={(e) =>
                      setEditPlayer({ ...editPlayer, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="WhatsApp">
                  <Input
                    required
                    type="tel"
                    value={editPlayer.phone}
                    onChange={(e) =>
                      setEditPlayer({ ...editPlayer, phone: e.target.value })
                    }
                  />
                </Field>
                <Field label="Data de nascimento">
                  <Input
                    type="date"
                    required
                    max={new Date().toISOString().slice(0, 10)}
                    value={editPlayer.birth}
                    onChange={(e) =>
                      setEditPlayer({ ...editPlayer, birth: e.target.value })
                    }
                  />
                </Field>
                <Field label="Divisão">
                  <Choice
                    label="Divisão do jogador"
                    options={[...divisions]}
                    value={editPlayer.division}
                    onChange={(v) =>
                      setEditPlayer({ ...editPlayer, division: v as Division })
                    }
                  />
                </Field>
                <Field label="Lado de jogo">
                  <Choice
                    label="Lado de jogo"
                    options={['Esquerda', 'Direita']}
                    value={editPlayer.side}
                    onChange={(v) =>
                      setEditPlayer({
                        ...editPlayer,
                        side: v as Player['side'],
                      })
                    }
                  />
                </Field>
                <Field label="Validação do WhatsApp">
                  <Badge tone={editPlayer.verified ? 'green' : 'amber'}>
                    {editPlayer.verified ? 'Validado' : 'Por validar'}
                  </Badge>
                </Field>
                <Field label="Nota interna / motivo da rejeição">
                  <Input
                    value={editPlayer.note}
                    onChange={(e) =>
                      setEditPlayer({ ...editPlayer, note: e.target.value })
                    }
                  />
                </Field>
                {['Ativo', 'Inativo'].includes(editPlayer.status) && (
                  <Field label="Participação">
                    <Choice
                      label="Participação"
                      value={editPlayer.status}
                      options={['Ativo', 'Inativo']}
                      onChange={(v) =>
                        setEditPlayer({
                          ...editPlayer,
                          status: v as Player['status'],
                        })
                      }
                    />
                  </Field>
                )}
              </div>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <div className="dialog-actions">
                {editPlayer.id && editPlayer.status === 'Pendente' && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() => playerAction('reject')}
                    >
                      Rejeitar
                    </Button>
                    <Button
                      type="button"
                      disabled={saving || !editPlayer.verified}
                      onClick={() => playerAction('approve')}
                    >
                      <Check size={16} /> {saving ? 'A guardar…' : 'Aprovar entrada'}
                    </Button>
                  </>
                )}
                <Button type="submit" variant="outline" disabled={saving}>
                  Guardar dados
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editCourt}
        onOpenChange={(open) => {
          if (!open) {
            setEditCourt(null);
            setError('');
          }
        }}
      >
        <DialogContent className="edit-dialog">
          <DialogHeader>
            <DialogTitle>
              {editCourt?.id ? 'Editar campo' : 'Adicionar campo'}
            </DialogTitle>
            <DialogDescription>
              Define onde os jogos podem ser agendados.
            </DialogDescription>
          </DialogHeader>
          {editCourt && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveCourt();
              }}
            >
              <div className="form-grid">
                <Field label="Nome do campo">
                  <Input
                    required
                    value={editCourt.name}
                    onChange={(e) =>
                      setEditCourt({ ...editCourt, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Local / clube">
                  <Input
                    required
                    value={editCourt.location}
                    onChange={(e) =>
                      setEditCourt({ ...editCourt, location: e.target.value })
                    }
                  />
                </Field>
                <label className="switch-label">
                  <Switch
                    checked={editCourt.active}
                    onCheckedChange={(v) =>
                      setEditCourt({ ...editCourt, active: v })
                    }
                  />{' '}
                  Disponível para jogos
                </label>
              </div>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <div className="dialog-actions">
                <Button type="submit" disabled={saving}>{saving ? "A guardar…" : "Guardar campo"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editGame}
        onOpenChange={(open) => {
          if (!open) {
            setEditGame(null);
            setError('');
          }
        }}
      >
        <DialogContent className="edit-dialog">
          <DialogHeader>
            <DialogTitle>Gerir jogo · {editGame?.division}</DialogTitle>
            <DialogDescription>
              Alterações administrativas recalculam os pontos nesta
              demonstração.
            </DialogDescription>
          </DialogHeader>
          {editGame && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveGame();
              }}
            >
              <div className="form-grid">
                <Field label="Campo">
                  <Select
                    value={editGame.court}
                    onValueChange={(v) =>
                      v && setEditGame({ ...editGame, court: v })
                    }
                  >
                    <SelectTrigger
                      className="choice"
                      aria-label="Campo do jogo"
                    >
                      <SelectValue>
                        {courts.find((c) => c.id === editGame.court)?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {courts
                        .filter((c) => c.active)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Data">
                  <Input
                    required
                    type="date"
                    value={editGame.date}
                    min={month + '-01'}
                    max={month + '-' + monthEnd}
                    onChange={(e) =>
                      setEditGame({ ...editGame, date: e.target.value })
                    }
                  />
                </Field>
                <Field label="Hora">
                  <Input
                    required
                    type="time"
                    value={editGame.time}
                    onChange={(e) =>
                      setEditGame({ ...editGame, time: e.target.value })
                    }
                  />
                </Field>
                <Field label="Duração (minutos)">
                  <Input
                    required
                    type="number"
                    min={15}
                    max={240}
                    value={editGame.duration}
                    onChange={(e) =>
                      setEditGame({
                        ...editGame,
                        duration: Number(e.target.value),
                      })
                    }
                  />
                </Field>
              </div>
              <div className="result-options">
                <p>Resultado confirmado pelo administrador</p>
                {(['a', 'b'] as const).map((team) => (
                  <Button
                    key={team}
                    type="button"
                    variant={editGame.winner === team ? 'default' : 'outline'}
                    onClick={() => setEditGame({ ...editGame, winner: team })}
                  >
                    {editGame.winner === team && <Check size={15} />}Vitória:{' '}
                    {teams(editGame, team)}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditGame({ ...editGame, winner: null })}
                >
                  Sem resultado
                </Button>
              </div>
              {games.find((g) => g.id === editGame.id)?.winner && (
                <Field label="Motivo da correção (obrigatório ao alterar resultado)">
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
              )}
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <div className="dialog-actions">
                <Button type="submit" disabled={saving}>{saving ? "A guardar…" : "Guardar jogo"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!message}
        onOpenChange={(open) => {
          if (!open) setMessage('');
        }}
      >
        <DialogContent className="edit-dialog">
          <DialogHeader>
            <DialogTitle>Pré-visualização da mensagem</DialogTitle>
            <DialogDescription>
              Texto de demonstração. Não será enviado ao grupo.
            </DialogDescription>
          </DialogHeader>
          <pre className="message-text">{message}</pre>
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(message);
                inform('Texto copiado.');
              } catch {
                inform(
                  'Não foi possível copiar automaticamente. Seleciona o texto para o copiar.',
                );
              }
            }}
          >
            <Copy size={16} /> Copiar texto
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
function GameCard({
  game: g,
  players,
  courts,
  onEdit,
}: {
  game: Game;
  players: Player[];
  courts: Court[];
  onEdit: () => void;
}) {
  return (
    <section className="panel game-card">
      <div className="game-card-top">
        <Badge
          tone={
            g.division === 'M1+'
              ? 'purple'
              : g.division === 'M1'
                ? 'blue'
                : 'green'
          }
        >
          {g.division}
        </Badge>
        <span>Ronda {String(g.round).padStart(2, '0')}</span>
        <Badge tone={g.winner ? 'green' : 'neutral'}>
          {g.absentIds?.length ? 'Aguarda suplente' : g.winner ? 'Confirmado' : g.published ? 'Agendado' : 'Rascunho'}
        </Badge>
      </div>
      <div className="game-schedule">
        <MapPin size={16} />
        <strong>{courts.find((c) => c.id === g.court)?.name}</strong>
        <span>·</span>
        {formatDate(g.date)}
        <span>·</span>
        {g.time}
      </div>
      {(['a', 'b'] as const).map((team, i) => (
        <div key={team}>
          {i === 1 && (
            <div className="game-vs">
              <span />
              VS
              <span />
            </div>
          )}
          <div className={`game-team ${g.winner === team ? 'winner' : ''}`}>
            {g[team].map((id) => {
              const p = players.find((p) => p.id === id);
              return (
                <div className="person-cell" key={id}>
                  <Avatar name={p?.name ?? 'Jogador'} />
                  <div>
                    <strong>{g.absentIds?.includes(id) ? 'Aguarda suplente' : p?.name}</strong>
                    <small>{p?.side}</small>
                  </div>
                </div>
              );
            })}
            {g.winner === team && <CheckCircle2 size={17} />}
          </div>
        </div>
      ))}
      <div className="game-card-footer">
        <span>
          <Clock size={14} />
          {g.duration} min
        </span>
        <Button variant="ghost" onClick={onEdit}>
          {g.winner ? 'Ver resultado' : 'Gerir jogo'}
          <ArrowRight size={15} />
        </Button>
      </div>
    </section>
  );
}
