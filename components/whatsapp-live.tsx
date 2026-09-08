import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
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
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(data.error ?? 'Não foi possível concluir.');
  return data;
}
export default function WhatsAppLive() {
  const [state, setState] = useState<{
    status: string;
    qr: string | null;
    groupId: string | null;
  }>({ status: 'disconnected', qr: null, groupId: null });
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = () =>
      api('/admin/whatsapp')
        .then((d) => {
          if (active) setState(d);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function action(path: string, body?: unknown) {
    setBusy(true);
    setError('');
    try {
      await api(path, 'POST', body);
      setState(await api('/admin/whatsapp'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>WhatsApp · Baileys</h2>
            <p>Um único grupo Escada para M1+, M1 e M2.</p>
          </div>
          <span className="badge">
            {{
              connected: 'Ligado',
              connecting: 'A ligar',
              qr: 'Lê o QR',
              disconnected: 'Desligado',
              logged_out: 'Sessão terminada',
              error: 'Erro de ligação',
            }[state.status] ?? state.status}
          </span>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {state.qr && (
          <div className="qr-area">
            <img
              src={state.qr}
              alt="QR para associar o WhatsApp do torneio"
              width={256}
              height={256}
            />
            <p>
              No WhatsApp do número dedicado, abre Dispositivos associados →
              Associar dispositivo.
            </p>
          </div>
        )}
        <div className="dialog-actions">
          <Button
            disabled={
              busy || ['connected', 'connecting', 'qr'].includes(state.status)
            }
            onClick={() => action('/admin/whatsapp/connect')}
          >
            Ligar por QR
          </Button>
          <Button
            variant="outline"
            disabled={busy || state.status === 'disconnected'}
            onClick={() => action('/admin/whatsapp/disconnect')}
          >
            Desligar
          </Button>
        </div>
      </section>
      <section className="panel next-phase">
        <h2>Grupo do torneio</h2>
        <p>
          Escolhe o grupo existente depois de ligar o número. Para obter o
          convite de entrada, o número deve ser administrador do grupo.
        </p>
        <div className="dialog-actions">
          <Button
            variant="outline"
            disabled={state.status !== 'connected' || busy}
            onClick={async () => {
              try {
                setGroups(await api('/admin/whatsapp/groups'));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Carregar grupos
          </Button>
          {groups.length > 0 && (
            <Select
              value={state.groupId ?? ''}
              onValueChange={(id) =>
                id && action('/admin/whatsapp/group', { id })
              }
            >
              <SelectTrigger aria-label="Grupo Escada">
                <SelectValue placeholder="Selecionar grupo" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <p>
          {state.groupId ? 'Grupo associado.' : 'Ainda não há grupo associado.'}
        </p>
      </section>
      <section className="panel next-phase">
        <h2>Inscrições por convite</h2>
        <p>
          O convite é individual, expira em 7 dias e só pode ser usado uma vez.
        </p>
        <Button
          onClick={async () => {
            try {
              const result = await api('/admin/invites', 'POST');
              setNote(result.url);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Criar convite de inscrição
        </Button>
        {note && (
          <div className="info-note">
            <a href={note}>{note}</a>
            <Button
              variant="outline"
              onClick={() =>
                navigator.clipboard
                  .writeText(note)
                  .catch(() =>
                    setError('Seleciona e copia o link manualmente.'),
                  )
              }
            >
              Copiar
            </Button>
          </div>
        )}
      </section>
      <section className="panel next-phase">
        <h2>Assistente sem IA nesta etapa</h2>
        <p>
          O comando /escada no grupo consulta o nome, divisão e próximo jogo do
          remetente. Números desconhecidos ou identificadores sem
          correspondência segura não recebem um perfil de jogador.
        </p>
      </section>
    </>
  );
}
