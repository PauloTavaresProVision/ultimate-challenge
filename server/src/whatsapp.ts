import { handleAI, botEnabled } from './ai-bot.ts';
import { handleParticipation, participationIntent } from './substitutions.ts';
import { queueWelcome } from './welcome.ts';
import { disconnectPolicy } from './whatsapp-disconnect.ts';
import { joinApprovedPlayer } from './group-join.ts';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  jidNormalizedUser,
  type WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { mkdir, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
  lastError: string | null = null;
  private seen = new Map<string, number>();
  connectedAt: string | null = null;
  get account() {
    const user = this.socket?.user;
    return this.status === 'connected' && user
      ? { name: user.name || null, phone: phoneFromJid(jidNormalizedUser(user.id)) }
      : null;
  }
  async sendTest(phone: string, text: string) {
    if (!this.socket || this.status !== 'connected')
      throw new Error('Liga o WhatsApp antes de enviar o teste.');
    const row=await db.outbox.create({data:{recipient:`${phone.slice(1)}@s.whatsapp.net`,kind:'test',status:'sending',attempts:1,encryptedBody:'',expiresAt:new Date(Date.now()+86400000)}});
    try {
      const result = await this.socket.sendMessage(row.recipient, { text });
      if (!result?.key.id) throw new Error('Envio sem confirmação.');
      const sentAt=new Date();
      await db.outbox.update({where:{id:row.id},data:{status:'sent',sentAt}});
      return { sentAt: sentAt.toISOString() };
    } catch(e) {
      await db.outbox.update({where:{id:row.id},data:{status:'uncertain'}});
      throw e;
    }
  }
  async connect() {
    if (this.enabled) return;
    await mkdir(config.WA_AUTH_DIR, { recursive: true, mode: 0o700 });
    const files = await readdir(config.WA_AUTH_DIR);
    if (this.status === 'logged_out' || files.includes('.requires-qr')) await this.archiveSession();
    this.enabled = true;
    this.failures = 0;
    await this.open();
  }
  private async archiveSession() {
    await mkdir(config.WA_AUTH_DIR, { recursive: true, mode: 0o700 });
    const entries = await readdir(config.WA_AUTH_DIR, { withFileTypes: true });
    const files = entries.filter(entry => entry.isFile() && (entry.name.endsWith('.json') || entry.name === '.requires-qr'));
    if (!files.length) return;
    const backup = join(config.WA_AUTH_DIR, 'backups', `${Date.now()}`);
    await mkdir(backup, { recursive: true, mode: 0o700 });
    for (const file of files) await rename(join(config.WA_AUTH_DIR, file.name), join(backup, file.name));
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
      sock.ev.on('messages.update', updates => {
        if (generation !== this.generation) return;
        for (const {key, update} of updates) {
          if (!key.fromMe || !key.id || !key.remoteJid?.endsWith('@s.whatsapp.net') && !key.remoteJid?.endsWith('@lid')) continue;
          const status = update.status;
          if (status == null || ![0, 2, 3, 4, 5].includes(status)) continue;
          void db.$transaction(async tx => {
            const receiptKey = `wa-receipt:${key.id}`;
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${receiptKey}))`;
            const previous = await tx.setting.findUnique({where:{key:receiptKey}});
            if (previous && Number(previous.value) >= status) return;
            await tx.setting.upsert({where:{key:receiptKey},create:{key:receiptKey,value:String(status)},update:{value:String(status)}});
          }).catch(() => console.error('Não foi possível guardar a confirmação WhatsApp.'));
        }
      });
      sock.ev.on('creds.update', () => {
        if (generation !== this.generation) return;
        void saveCreds().catch(() => {
          this.status = 'error';
          this.lastError = 'Não foi possível guardar a sessão WhatsApp. Verifica as permissões e o espaço em disco.';
          console.error('WhatsApp: falha ao guardar credenciais.');
        });
      });
      sock.ev.on('connection.update', async (update) => {
        if (generation !== this.generation) return;
        if (update.qr) {
          const qr = await QRCode.toDataURL(update.qr);
          if (generation !== this.generation || !this.enabled) return;
          this.qr = qr;
          this.status = 'qr';
        }
        if (update.connection === 'open') {
          this.connectedAt = new Date().toISOString();
          this.status = 'connected';
          this.lastError = null;
          this.qr = null;
          this.failures = 0;
        }
        if (update.connection === 'close') {
          this.qr = null;
          this.socket = null;
          const code = (
            update.lastDisconnect?.error as { output?: { statusCode?: number } }
          )?.output?.statusCode;
          const policy = disconnectPolicy(code);
          this.lastError = policy.message;
          console.warn('WhatsApp desligado:', code ?? 'sem código', policy.message);
          if (policy.stop) {
            this.generation++;
            if (policy.invalidate) await writeFile(join(config.WA_AUTH_DIR, '.requires-qr'), 'Session rejected; pair again.', {mode:0o600}).catch(()=>{});
            this.status = policy.invalidate ? 'logged_out' : 'error';
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
      sock.ev.on('group-participants.update', event => {
        if(generation !== this.generation || event.action !== 'add')return;
        void (async()=>{
          const selected=await db.setting.findUnique({where:{key:'whatsapp_group'}});
          if(selected?.value!==event.id)return;
          const members=event.participants;
          let jids=members.flatMap(p=>[p.id,p.phoneNumber??'']);
          if(members.some(p=>!phoneFromJid(p.id)&&!phoneFromJid(p.phoneNumber))){
            const metadata=await sock.groupMetadata(event.id);
            jids=jids.concat(metadata.participants.filter(p=>members.some(m=>m.id===p.id)).flatMap(p=>[p.id,p.phoneNumber??'']));
          }
          await queueWelcome(event.id,jids);
        })().catch(()=>console.error('Não foi possível preparar as boas-vindas.'));
      });
      sock.ev.on('messages.upsert', ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const message of messages) {
          if (message.key.fromMe) continue;
          const text =
            message.message?.conversation ??
            message.message?.extendedTextMessage?.text ??
            '';
          if (!text.trim() || text.length > 1500) continue;
          const id = message.key.id;
          if (!id || this.seen.has(id)) continue;
          this.seen.set(id, Date.now());
          if (this.seen.size > 1000) {
            const first = this.seen.keys().next().value;
            if (first) this.seen.delete(first);
          }
          if(participationIntent(text)) {
            const phone=phoneFromJid(message.key.participantAlt)??phoneFromJid(message.key.participant);
            if(phone)void handleParticipation(message.key.remoteJid??'',phone,text,id,message.message?.extendedTextMessage?.contextInfo?.stanzaId??undefined).catch(()=>console.error('Não foi possível processar a participação.'));
            continue;
          }
          if(!/^\/escada(?:\s|$)/i.test(text)) {
            void (async()=>{
              const group=message.key.remoteJid??'';
              if(!await botEnabled()||(await db.setting.findUnique({where:{key:'whatsapp_group'}}))?.value!==group)return;
              let phone=phoneFromJid(message.key.participantAlt)??phoneFromJid(message.key.participant);
              if(!phone){const metadata=await sock.groupMetadata(group);const member=metadata.participants.find(p=>p.id===message.key.participant);phone=phoneFromJid(member?.phoneNumber);}
              if(phone)await handleAI(group,phone,text,id);
            })().catch(()=>console.error('Não foi possível processar a pergunta do grupo.'));
            continue;
          }
          void this.onCommand(
            message.key.remoteJid ?? '',
            message.key.participant ?? message.key.remoteJid ?? '',
            message.key.participantAlt ?? message.key.remoteJidAlt ?? null,
          ).catch(() => {});
        }
      });
    } catch {
      this.lastError = 'Não foi possível iniciar a ligação. A sessão guardada foi preservada.';
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
    await db.setting.upsert({
      where: { key: 'whatsapp_group_name' },
      create: { key: 'whatsapp_group_name', value: groups.find(g => g.id === id)!.name },
      update: { value: groups.find(g => g.id === id)!.name },
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
        where: { id: row.id, status: 'pending', expiresAt: { gt: new Date() }, nextAttemptAt: { lte: new Date() } },
        data: { status: 'sending', attempts: { increment: 1 } },
      });
      if (!claim.count) return;
      try {
        if(row.kind === 'ai' && (!await botEnabled() || (await db.setting.findUnique({where:{key:'whatsapp_group'}}))?.value!==row.recipient)) {await db.outbox.update({where:{id:row.id},data:{status:'cancelled',encryptedBody:''}});return;}
        if(row.kind === 'welcome' && (await db.setting.findUnique({where:{key:'whatsapp_group'}}))?.value !== row.recipient) {
          await db.outbox.update({where:{id:row.id},data:{status:'cancelled',encryptedBody:''}});return;
        }
        if(row.kind === 'group_join') {
          const payload=JSON.parse(decrypt(row.encryptedBody,config.MESSAGE_KEY)) as {playerId:string;group:string;text:string};
          const player=await db.player.findUnique({where:{id:payload.playerId}});
          const currentGroup=await db.setting.findUnique({where:{key:'whatsapp_group'}});
          if(!player || player.status!=='Ativo' || !player.verified || currentGroup?.value!==payload.group) {
            await db.outbox.update({where:{id:row.id},data:{status:'cancelled',encryptedBody:''}});return;
          }
          const outcome=await joinApprovedPlayer(this.socket,payload.group,row.recipient);
          if(outcome==='added')await queueWelcome(payload.group,[row.recipient]);
          if(outcome==='invite')await this.socket.sendMessage(row.recipient,{text:payload.text});
          await db.outbox.update({where:{id:row.id},data:{status:outcome==='invite'?'invited':outcome,sentAt:new Date(),encryptedBody:''}});
          return;
        }
        const result = await this.socket.sendMessage(row.recipient, {
          text: decrypt(row.encryptedBody, config.MESSAGE_KEY),
        });
        if (!result?.key.id) throw new Error('Envio sem identificador WhatsApp.');
        await db.setting.upsert({
          where: { key: `outbox-message:${row.id}` },
          create: { key: `outbox-message:${row.id}`, value: result.key.id },
          update: { value: result.key.id },
        });
        await db.outbox.update({
          where: { id: row.id },
          data: { status: 'sent', sentAt: new Date(), encryptedBody: '' },
        });
      } catch (error) {
        const code = (error as { output?: { statusCode?: number } })?.output?.statusCode;
        console.error('Falha no envio WhatsApp:', row.id, row.kind, typeof code === 'number' ? code : 'sem código');
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
