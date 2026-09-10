import { useEffect, useRef, useState } from 'react';
import { api } from './whatsapp-live';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
type Recipient = { id: string; phone: string; delivery: string };
export default function InviteReminderDialog({
  open,
  connected,
  onClose,
  onSent,
}: {
  open: boolean;
  connected: boolean;
  onClose: () => void;
  onSent: (text: string) => void;
}) {
  const [items, setItems] = useState<Recipient[]>([]),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false);
  const request = useRef<{
    batchId: string;
    invitationIds: string[];
    message: string;
  } | null>(null);
  useEffect(() => {
    if (!open || request.current) return;
    let active = true;
    setLoading(true);
    setError('');
    api<{ items: Recipient[] }>('/admin/invite-reminders')
      .then((r) => {
        if (active) setItems(r.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);
  async function send() {
    setBusy(true);
    setError('');
    request.current ??= {
      batchId: crypto.randomUUID(),
      invitationIds: items.map((i) => i.id),
      message: message.trim(),
    };
    setAttempted(true);
    try {
      const result = await api<{ queued: number; excluded: number }>(
        '/admin/invite-reminders',
        'POST',
        request.current,
      );
      onSent(
        `${result.queued} lembretes colocados na fila.${result.excluded ? ` ${result.excluded} contactos excluídos porque deixaram de reunir as condições.` : ''}`,
      );
      request.current = null;
      setAttempted(false);
      setMessage('');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="invite-reminder-dialog" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Lembrar quem não se inscreveu</DialogTitle>
          <DialogDescription>
            Apenas convites entregues ou lidos. Exclui cancelados, contactos com
            inscrição e lembretes em fila.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p>A verificar destinatários…</p>
        ) : (
          <>
            <details>
              <summary>{items.length} destinatários · Ver números</summary>
              <ul className="invite-reminder-recipients">
                {items.map((i) => (
                  <li key={i.id}>
                    {i.phone} · {i.delivery === 'read' ? 'Lido' : 'Entregue'}
                  </li>
                ))}
              </ul>
            </details>
            {!items.length && (
              <p>Não há contactos elegíveis para este lembrete.</p>
            )}
            <label htmlFor="reminder-message">Mensagem</label>
            <textarea
              id="reminder-message"
              rows={5}
              maxLength={1500}
              value={message}
              disabled={busy || attempted}
              placeholder="Escreve a mensagem que queres enviar…"
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="invite-list-note">
              Envia exatamente este texto, com 30 segundos de intervalo. Quem
              entretanto se inscrever será excluído antes do envio.
            </p>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Fechar
          </Button>
          <Button
            disabled={
              loading ||
              busy ||
              !connected ||
              !items.length ||
              !message.trim() ||
              (!attempted && !!error)
            }
            onClick={() => void send()}
          >
            {busy
              ? 'A confirmar…'
              : attempted
                ? 'Confirmar estado do pedido'
                : `Enviar para ${items.length} contactos`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
