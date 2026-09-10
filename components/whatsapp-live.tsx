import InviteDialog from './invite-dialog';
import ZApiSettings from './zapi-settings';
import InviteHistory from './invite-history';
import MessageCenter from './message-center';
import { useEffect, useState } from 'react';
import { MessageCircle, Smartphone, Users, RefreshCw, Send, Link2, Copy, Check, ArrowUpRight, Unplug, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from '@/components/ui/combobox';
export async function api<T = any>(
  path: string,
  method = 'GET',
  body?: unknown,
) {
  const r = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw=await r.text();
  let data:T & {error?:string};
  try{data=JSON.parse(raw);}catch{
    throw new Error(method==='GET'
      ? 'O servidor não devolveu uma resposta válida. Tenta atualizar o estado dentro de momentos.'
      : 'Não foi possível confirmar a resposta do servidor. A operação pode ter sido concluída; verifica o estado antes de repetir.');
  }
  if (!r.ok) throw new Error(data.error ?? 'Não foi possível concluir.');
  return data;
}
type Group = { id: string; name: string };
type Connection = { warning?: string | null; automaticPaused?: boolean; engine?: "baileys" | "webjs" | "zapi"; lastError?: string | null; status: string; qr: string | null; groupId: string | null; groupName?: string | null; account?: { name: string | null; phone: string | null } | null; connectedAt?: string | null };
export default function WhatsAppLive() {
  const [state, setState] = useState<Connection>({ status: 'loading', qr: null, groupId: null });
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<Group | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [groupError,setGroupError]=useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('Olá! Esta é uma mensagem de teste do Ultimate Challenge. A ligação ao WhatsApp está a funcionar.');
  const [testResult, setTestResult] = useState('');
  const [testError, setTestError] = useState('');
  const [testId,setTestId]=useState<string|null>(null);
  useEffect(()=>{setTestId(localStorage.getItem('wa-last-test'));},[]);
  useEffect(()=>{
    if(!testId)return;
    let active=true;
    const poll=async()=>{
      try{
        const result=await api<{status:string;recipient?:string;hasMessageId?:boolean}>(`/admin/whatsapp/test/${testId}`);
        if(!active)return;
        const labels:Record<string,string>={sending:'A enviar…',provider_queued:'Em fila na Z-API',sent:'Enviado ao WhatsApp. A aguardar confirmação de entrega.',accepted:'Aceite pelo WhatsApp. A aguardar entrega.',delivered:'Entregue ao destinatário.',read:'Lido pelo destinatário.',failed:'O WhatsApp rejeitou o envio.',uncertain:'O envio ficou sem confirmação. Continuamos a consultar os recibos; não será repetido automaticamente.',not_found:'O servidor ainda não registou este teste. Podes tentar novamente: será usado o mesmo identificador.'};
        if(result.status==='uncertain'&&!result.hasMessageId)labels.uncertain='O WhatsApp não devolveu o identificador da mensagem. Não conseguimos verificar a entrega deste teste; não foi reenviado.';
        setTestError('');setTestResult(`${result.recipient?'+'+result.recipient+' · ':''}${labels[result.status]??'A consultar envio…'}`);
      }catch{if(active)setTestError('Sem ligação ao servidor. A recuperar o estado deste envio automaticamente.');}
    };
    void poll();const timer=setInterval(poll,3000);
    return()=>{active=false;clearInterval(timer);};
  },[testId]);
  const connected = state.status === 'connected';
  const engineLabel = state.engine === 'zapi' ? 'Z-API' : state.engine === 'webjs' ? 'WhatsApp Web' : state.engine === 'baileys' ? 'Baileys' : 'A verificar';
  const statusLabel = ({ loading: 'A verificar', connected: 'Ligado', connecting: 'A ligar', syncing: 'Associado. A concluir ligação…', qr: 'Aguardar leitura do QR', disconnected: 'Desligado', logged_out: 'Sessão terminada', error: 'Erro de ligação' } as Record<string, string>)[state.status] ?? state.status;
  async function refresh() { setState(await api<Connection>('/admin/whatsapp')); }
  useEffect(() => {
    let active = true;
    const poll = () => api<Connection>('/admin/whatsapp').then(d => { if (active) setState(d); }).catch(e => { if (active) setError(e.message); });
    void poll(); const timer = setInterval(poll, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  async function loadGroups() {
    setLoadingGroups(true); setGroupError('');
    try { setGroups((await api<Group[]>('/admin/whatsapp/groups')).sort((a, b) => a.name.localeCompare(b.name))); setGroupsLoaded(true); }
    catch (e) { setGroupError('Não foi possível carregar os grupos. A ligação pode continuar ativa; tenta carregar os grupos novamente.'); }
    finally { setLoadingGroups(false); }
  }
  useEffect(() => { if (connected) void loadGroups(); }, [connected]);
  async function action(path: string, body?: unknown) {
    setBusy(path); setError('');
    try { await api(path, 'POST', body); await refresh(); return true; }
    catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(''); }
  }
  const groupName = groups.find(g => g.id === state.groupId)?.name ?? state.groupName;
  return <div className="wa-workspace">
    {error && <div className="form-error" role="alert">{error}</div>}
    {state.lastError && <p className="form-error" role="status">{state.lastError}</p>}
    {state.warning && <p role="status">{state.warning}</p>}
    <section className="wa-card" aria-label="Envios automáticos">
      <header className="wa-card-heading"><div className="wa-icon"><Send size={20}/></div><div>
        <h2>{state.automaticPaused ? 'Envios automáticos pausados' : 'Envios automáticos ativos'}</h2>
        <p>{state.automaticPaused ? 'A fila está em espera. Podes ligar um número e usar Enviar teste.' : 'Pausa antes de ligar um número apenas para testes.'}</p>
      </div></header>
      <Button variant={state.automaticPaused ? 'default' : 'outline'} disabled={!!busy || state.status==='loading'} onClick={()=>action('/admin/whatsapp/pause',{paused:!state.automaticPaused})}>
        {state.automaticPaused ? 'Retomar envios automáticos' : 'Pausar envios automáticos'}
      </Button>
      <p className="wa-footnote">Inclui convites, códigos, mensagens do bot e entradas no grupo. Um envio já iniciado pode concluir. Ao retomar, os convites mantêm o intervalo de 30 segundos.</p>
    </section>
    <section className="wa-card">
      <div className="wa-field"><label htmlFor="wa-engine">Método de ligação</label>
        <select id="wa-engine" className="wa-group-input" value={state.engine ?? 'baileys'} disabled={!!busy || state.status==='loading'} onChange={async e=>{
          if(await action('/admin/whatsapp/engine',{engine:e.target.value})){setGroups([]);setSelected(null);setGroupsLoaded(false);setTestResult('');}
        }} style={{width:'100%',padding:'12px 14px',border:'1px solid #dce4e8',borderRadius:10,background:'white',font:'inherit'}}>
          <option value="baileys">Baileys</option><option value="webjs">WhatsApp Web · whatsapp-web.js</option><option value="zapi">Z-API</option>
        </select>
        <small>Ao mudar, a ligação atual é encerrada e a fila fica em espera. Depois carrega em Ligar por QR.</small>
      </div>
    </section>
    {state.engine==='zapi'&&<ZApiSettings/>}
    <section className="wa-connection">
      <div className="wa-account">
        <div className="wa-account-icon"><MessageCircle size={27} /></div>
        <div><span className="wa-eyebrow">CONTA DO TORNEIO</span><h2>{connected ? state.account?.phone ?? 'Número indisponível' : 'Liga o WhatsApp do Ultimate Challenge'}</h2><p>{connected ? state.account?.name || 'WhatsApp associado' : 'Associa o número que vai comunicar com os jogadores.'}</p></div>
      </div>
      <div className="wa-connection-actions"><span className={`wa-status ${connected ? 'is-connected' : ''}`}><span />{statusLabel}</span>
        {['connected','connecting','syncing','qr'].includes(state.status) ? <Button variant="outline" disabled={!!busy} onClick={() => action('/admin/whatsapp/disconnect')}><Unplug size={15} /> Desligar</Button> : <Button disabled={!!busy || ['loading', 'connecting', 'syncing', 'qr'].includes(state.status)} onClick={() => action('/admin/whatsapp/connect')}><QrCode size={16} /> Ligar por QR</Button>}
      </div>
      <div className="wa-connection-meta"><span><Smartphone size={14} /> {connected ? 'Ligado por' : 'Método selecionado:'} {engineLabel}</span><span>{connected && state.connectedAt ? `Ligado desde ${new Date(state.connectedAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}` : 'Estado atualizado automaticamente'}</span></div>
      {state.qr && <div className="wa-qr"><img src={state.qr} alt="QR para associar o WhatsApp" width={220} height={220} /><div><h3>Associa o teu telemóvel</h3><p>No WhatsApp, abre <strong>Dispositivos associados</strong> e escolhe <strong>Associar dispositivo</strong>. Depois lê este código.</p></div></div>}
    </section>
    <div className="wa-grid">
      <section className="wa-card">
        <header className="wa-card-heading"><div className="wa-icon"><Users size={20} /></div><div><h2>Grupo do torneio</h2><p>Um grupo. As quatro divisões.</p></div><Button variant="ghost" size="icon" aria-label="Atualizar grupos" title="Atualizar grupos" disabled={!connected || loadingGroups} onClick={loadGroups}><RefreshCw size={16} className={loadingGroups ? 'animate-spin' : ''} /></Button></header>
        <div className={`wa-group-summary ${state.groupId ? 'is-selected' : ''}`}><Users size={22} /><div><strong>{state.groupId ? groupName || 'Grupo associado' : 'Escolhe o grupo do Ultimate Challenge'}</strong><p>{state.groupId ? 'Jogos e convites ligados a este grupo' : 'As comunicações de M1+, M1, M2+ e M2 ficam aqui.'}</p></div>{state.groupId && <Check size={18} />}</div>
        <div className="wa-field"><label htmlFor="wa-group">{state.groupId ? 'Alterar grupo' : 'Associar grupo'}</label>
          <Combobox items={groups} value={selected} onValueChange={setSelected} itemToStringLabel={(g: Group) => g.name} isItemEqualToValue={(a: Group, b: Group) => a.id === b.id}>
            <ComboboxInput id="wa-group" className="wa-group-input" disabled={!connected || loadingGroups} placeholder={!connected ? 'Liga o WhatsApp primeiro' : loadingGroups ? 'A procurar grupos…' : 'Pesquisar grupo por nome…'} />
            <ComboboxContent className="wa-group-popup"><ComboboxEmpty>Nenhum grupo encontrado.</ComboboxEmpty><ComboboxList>{(g: Group) => <ComboboxItem key={g.id} value={g} className="wa-group-option"><Users size={16} /><span>{g.name}</span></ComboboxItem>}</ComboboxList></ComboboxContent>
          </Combobox>
        </div>
        <div className="wa-group-footer"><span>{loadingGroups ? 'A atualizar…' : groupsLoaded ? `${groups.length} grupos disponíveis` : 'Grupos carregados após a ligação'}</span><Button disabled={!connected || !selected || selected.id === state.groupId || !!busy} onClick={async () => { if (selected && await action('/admin/whatsapp/group', { id: selected.id })) setSelected(null); }}>Associar grupo <ArrowUpRight size={15} /></Button></div>
        {groupError && <p className="form-error" role="alert">{groupError}</p>}
        <p className="wa-footnote">Para enviar convites de entrada, o número ligado deve ser administrador do grupo.</p>
      </section>
      <section className="wa-card">
        <header className="wa-card-heading"><div className="wa-icon"><Send size={19} /></div><div><h2>Testar envio</h2><p>Confirma a ligação com uma mensagem privada.</p></div></header>
        <form className="wa-test-form" onSubmit={async e => {
          e.preventDefault(); setBusy('test'); setTestError(''); setTestResult('');
          const id=testId??crypto.randomUUID();localStorage.setItem('wa-last-test',id);setTestId(id);setTestResult('A registar o teste…');
          try { await api('/admin/whatsapp/test', 'POST', {id, phone: phone.replace(/[\s()-]/g, ''), message }); }
          catch { setTestError('A recuperar o estado deste teste automaticamente. O envio não será repetido.'); } finally { setBusy(''); }
        }}>
          <div className="wa-field"><div className="wa-label-row"><label htmlFor="wa-phone">Destinatário</label>{state.account?.phone && <button type="button" onClick={() => setPhone(state.account!.phone!)}>Usar número ligado</button>}</div><Input id="wa-phone" type="tel" autoComplete="tel" placeholder="+244 9XX XXX XXX" required pattern="[+][0-9 ()-]{8,20}" value={phone} onChange={e => setPhone(e.target.value)} /><small>Inclui o indicativo do país.</small></div>
          <div className="wa-field"><label htmlFor="wa-message">Mensagem de teste</label><Textarea id="wa-message" required maxLength={1000} rows={3} value={message} onChange={e => setMessage(e.target.value)} /></div>
          <div className="wa-test-footer"><span>Envio apenas para este número</span><Button type="submit" disabled={!connected || !!busy || !phone || !message.trim()}><Send size={15} />{busy === 'test' ? 'A enviar…' : 'Enviar teste'}</Button></div>
          {testResult && <p role="status">{testResult}</p>}{testError && <p className="form-error" role="alert">{testError}</p>}
          {testId && <Button type="button" variant="outline" disabled={!!busy} onClick={()=>{localStorage.removeItem('wa-last-test');setTestId(null);setTestResult('');setTestError('');}}>Preparar outro teste</Button>}
        </form>
      </section>
    </div>
    <section className="wa-invite"><div className="wa-icon"><Link2 size={20} /></div><div className="wa-invite-copy"><h2>Inscrições por convite</h2><p>Um link por jogador, válido durante 7 dias. A entrada continua sujeita à tua aprovação.</p></div><InviteDialog connected={connected}/>
      {note && <div className="wa-invite-link"><a href={note}>{note}</a><Button variant="outline" onClick={() => navigator.clipboard.writeText(note).then(() => setCopied(true)).catch(() => setError('Seleciona e copia o link manualmente.'))}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copiado' : 'Copiar link'}</Button></div>}
    </section>
    <InviteHistory connected={connected}/>
    <MessageCenter />
    <div className="wa-command"><MessageCircle size={17} /><p>Os jogadores podem escrever <code>/escada</code> no grupo para consultar a divisão e o próximo jogo. São identificados pelo número validado no registo.</p></div>
  </div>;
}
