import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
  type WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { mkdir } from 'node:fs/promises';
import { config } from './config.ts';
import { db } from './db.ts';
import { decrypt, phoneFromJid } from './security.ts';
const logger = pino({ level: 'silent' });
export class WhatsApp {
  private socket: WASocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private enabled = false;
  private generation = 0;
  private failures = 0;
  private sending = false;
  status:
    | 'disconnected'
    | 'connecting'
    | 'qr'
    | 'connected'
    | 'logged_out'
    | 'error' = 'disconnected';
  qr: string | null = null;
  private seen = new Map<string, number>();
  async connect() {
    if (this.enabled) return;
    this.enabled = true;
    this.failures = 0;
    await this.open();
  }
  private async open() {
    const generation = ++this.generation;
    this.status = 'connecting';
    try {
      await mkdir(config.WA_AUTH_DIR, { recursive: true, mode: 0o700 });
      const { state, saveCreds } = await useMultiFileAuthState(
        config.WA_AUTH_DIR,
      );
      if (!this.enabled || generation !== this.generation) return;
      const sock = makeWASocket({
        auth: state,
        logger,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
      });
      this.socket = sock;
      sock.ev.on('creds.update', () => {
        void saveCreds().catch(() => {
          this.status = 'error';
        });
      });
      sock.ev.on('connection.update', async (update) => {
        if (generation !== this.generation) return;
        if (update.qr) {
          this.qr = await QRCode.toDataURL(update.qr);
          this.status = 'qr';
        }
        if (update.connection === 'open') {
          this.status = 'connected';
          this.qr = null;
          this.failures = 0;
        }
        if (update.connection === 'close') {
          this.qr = null;
          this.socket = null;
          const code = (
            update.lastDisconnect?.error as { output?: { statusCode?: number } }
          )?.output?.statusCode;
          const terminal = [
            DisconnectReason.loggedOut,
            DisconnectReason.badSession,
            DisconnectReason.connectionReplaced,
            DisconnectReason.forbidden,
          ].includes(code ?? 0);
          if (terminal) {
            this.status = 'logged_out';
            this.enabled = false;
            return;
          }
          this.status = 'disconnected';
          if (this.enabled && this.failures++ < 8)
            this.timer = setTimeout(
              () => void this.open(),
              Math.min(60000, 2000 * 2 ** this.failures),
            );
          else {
            this.enabled = false;
            this.status = 'error';
          }
        }
      });
      sock.ev.on('messages.upsert', ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const message of messages) {
          if (message.key.fromMe) continue;
          const text =
            message.message?.conversation ??
            message.message?.extendedTextMessage?.text ??
            '';
          if (!/^\/escada(?:\s|$)/i.test(text)) continue;
          const id = message.key.id;
          if (!id || this.seen.has(id)) continue;
          this.seen.set(id, Date.now());
          if (this.seen.size > 1000) {
            const first = this.seen.keys().next().value;
            if (first) this.seen.delete(first);
          }
          void this.onCommand(
            message.key.remoteJid ?? '',
            message.key.participant ?? message.key.remoteJid ?? '',
            message.key.participantAlt ?? message.key.remoteJidAlt ?? null,
          ).catch(() => {});
        }
      });
    } catch {
      this.status = 'error';
      this.enabled = false;
      this.socket = null;
    }
  }
  async disconnect() {
    this.enabled = false;
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const sock = this.socket;
    this.socket = null;
    this.qr = null;
    this.status = 'disconnected';
    sock?.end(undefined);
  }
  async groups() {
    if (!this.socket || this.status !== 'connected')
      throw new Error('WhatsApp desligado.');
    const groups = await this.socket.groupFetchAllParticipating();
    return Object.values(groups).map((g) => ({ id: g.id, name: g.subject }));
  }
  async selectGroup(id: string) {
    const groups = await this.groups();
    if (!groups.some((g) => g.id === id))
      throw new Error('O grupo não pertence a esta sessão.');
    await db.setting.upsert({
      where: { key: 'whatsapp_group' },
      create: { key: 'whatsapp_group', value: id },
      update: { value: id },
    });
  }
  async groupInvite() {
    const group = await db.setting.findUnique({
      where: { key: 'whatsapp_group' },
    });
    if (!group || !this.socket || this.status !== 'connected')
      throw new Error('Liga o WhatsApp e associa o grupo Escada.');
    const code = await this.socket.groupInviteCode(group.value);
    if (!code)
      throw new Error(
        'Não foi possível obter o convite. Confirma que o número é administrador do grupo.',
      );
    return `https://chat.whatsapp.com/${code}`;
  }
  private async onCommand(
    chat: string,
    sender: string,
    alternate: string | null,
  ) {
    const group = await db.setting.findUnique({
      where: { key: 'whatsapp_group' },
    });
    if (!group || chat !== group.value || !this.socket) return;
    let phone =
      phoneFromJid(jidNormalizedUser(sender)) ?? phoneFromJid(alternate);
    if (!phone && sender.endsWith('@lid')) {
      const mapped =
        await this.socket.signalRepository.lidMapping.getPNForLID(sender);
      phone = phoneFromJid(mapped);
    }
    if (!phone) return;
    const player = await db.player.findUnique({ where: { phone } });
    if (!player?.verified || player.status !== 'Ativo') return;
    const recent = await db.setting.findUnique({
      where: { key: `reply:${player.id}` },
    });
    if (recent && Number(recent.value) > Date.now() - 60000) return;
    await db.setting.upsert({
      where: { key: `reply:${player.id}` },
      create: { key: `reply:${player.id}`, value: String(Date.now()) },
      update: { value: String(Date.now()) },
    });
    const game = await db.game.findFirst({
      where: {
        OR: [{ a: { has: player.id } }, { b: { has: player.id } }],
        winner: null,
        published: true,
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      include: { court: true },
    });
    await this.socket.sendMessage(chat, {
      text: `${player.name} · ${player.division} · ${player.side}\n${game ? `Próximo jogo: ${game.date}, ${game.time}, ${game.court.name}.` : 'Ainda não tens um jogo publicado.'}\n${config.APP_ORIGIN}/jogos`,
    });
  }
  async deliver() {
    if (this.sending || this.status !== 'connected' || !this.socket) return;
    this.sending = true;
    try {
      const row = await db.outbox.findFirst({
        where: {
          status: 'pending',
          expiresAt: { gt: new Date() },
          nextAttemptAt: { lte: new Date() },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (!row) return;
      const claim = await db.outbox.updateMany({
        where: { id: row.id, status: 'pending' },
        data: { status: 'sending', attempts: { increment: 1 } },
      });
      if (!claim.count) return;
      try {
        await this.socket.sendMessage(row.recipient, {
          text: decrypt(row.encryptedBody, config.MESSAGE_KEY),
        });
        await db.outbox.update({
          where: { id: row.id },
          data: { status: 'sent', sentAt: new Date(), encryptedBody: '' },
        });
      } catch {
        await db.outbox.update({
          where: { id: row.id },
          data: { status: 'uncertain' },
        });
      }
    } finally {
      this.sending = false;
    }
  }
}
