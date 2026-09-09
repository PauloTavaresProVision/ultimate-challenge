import {openWebWhatsApp} from './whatsapp-web.ts';
import {automaticPaused,DeliveryPaused} from './whatsapp-pause.ts';
import type {MessagingSocket,WhatsAppEngine} from './whatsapp-transport.ts';
import {loadPostgresAuth} from './whatsapp-postgres-auth.ts';
import {closeDiagnostic} from './whatsapp-close-diagnostic.ts';
import {claimDelivery,finishInvitation} from './delivery-queue.ts';
import { handleAI, botEnabled } from './ai-bot.ts';
import { SendGate } from './whatsapp-send-gate.ts';
import { decodeBotMessage } from './bot-message.ts';
import './signal-log-redaction.ts';
import { resolveRecipient } from './whatsapp-recipient.ts';
import { nextReceipt } from './whatsapp-receipts.ts';
import { handleParticipation, participationIntent } from './substitutions.ts';
import { queueWelcome } from './welcome.ts';
import { disconnectPolicy } from './whatsapp-disconnect.ts';
import { joinApprovedPlayer } from './group-join.ts';
import makeWASocket, {
  jidNormalizedUser,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { config } from './config.ts';
import { db } from './db.ts';
import { decrypt, phoneFromJid } from './security.ts';
const logger = pino({ level: 'silent' });
export class WhatsApp {
  constructor(private readonly webFactory:typeof openWebWhatsApp=openWebWhatsApp){}
  private gate = new SendGate();
  engine:WhatsAppEngine='baileys';
  private changing=false;
  async initialize(){this.engine=(await db.setting.findUnique({where:{key:'whatsapp_engine'}}))?.value==='webjs'?'webjs':'baileys';}
  async selectEngine(engine:WhatsAppEngine){
    if(this.changing)throw new Error('Troca em curso.');
    this.changing=true;
    try {
      await this.disconnect();
      await db.setting.upsert({where:{key:'whatsapp_engine'},create:{key:'whatsapp_engine',value:engine},update:{value:engine}});
      this.engine=engine;this.lastError=null;
    } finally {this.changing=false;}
  }
  get sendingPausedReason() { return this.engine==='webjs'?null:this.gate.reason; }
  private async canSend() {
    const sock = this.socket;
    if (!sock || this.status !== 'connected') return false;
    if(this.engine==='webjs')return true;
    return await this.gate.allowed(() => (sock as WASocket).fetchAccountReachoutTimelock()) && this.socket === sock && this.status === 'connected';
  }
  private socket: MessagingSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private enabled = false;
  private stopping = false;
  private auth: Awaited<ReturnType<typeof loadPostgresAuth>> | null = null;
  private opening: Promise<void> | null = null;
  private closingSocket:Promise<void>|null=null;
  private generation = 0;
  private failures = 0;
  private sending = false;
  private checkingWelcomes = false;
  async reconcileWelcomes() {
    const socket=this.socket;
    if(this.checkingWelcomes||!socket||this.status!=='connected')return;
    this.checkingWelcomes=true;
    try {
      const group=await db.setting.findUnique({where:{key:'whatsapp_group'}});
      if(!group?.value)return;
      const metadata=await socket.groupMetadata(group.value);
      if(this.socket!==socket||this.status!=='connected')return;
      const jids=metadata.participants.flatMap(p=>[p.id,p.phoneNumber??'']);
      await queueWelcome(group.value,jids);
    } finally {this.checkingWelcomes=false;}
  }
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
  private async recordReceipt(id: string, status: number, error?: string) {
    await db.$transaction(async tx => {
      const key = `wa-receipt:${id}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      const previous = await tx.setting.findUnique({where:{key}});
      const value = String(nextReceipt(previous ? Number(previous.value) : null, status));
      await tx.setting.upsert({where:{key},create:{key,value},update:{value}});
      if (error && /^\d{1,6}$/.test(error)) {
        const errorKey = `wa-receipt-error:${id}`;
        await tx.setting.upsert({where:{key:errorKey},create:{key:errorKey,value:error},update:{value:error}});
      }
    });
  }
  connectedAt: string | null = null;
  private async diagnose(sock: WASocket) {
    const [restriction, quota] = await Promise.allSettled([
      sock.fetchAccountReachoutTimelock(), sock.fetchNewChatMessageCap(),
    ]);
    const recent = await db.outbox.findMany({where:{kind:{in:['test','invitation']}},orderBy:{createdAt:'desc'},take:10,select:{recipient:true}});
    const contacts = [];
    for (const pn of [...new Set(recent.map(r=>r.recipient))].slice(0,5)) {
      const lid = await sock.signalRepository.lidMapping.getLIDForPN(pn);
      const ids = lid ? [pn,lid] : [pn];
      const tokens = await sock.authState.keys.get('tctoken',ids);
      contacts.push({phoneSuffix:pn.split('@')[0].slice(-4),hasLid:!!lid,tokens:ids.map(id=>({address:id===pn?'phone':'lid',present:!!tokens[id]?.token?.length,timestamp:tokens[id]?.timestamp??null}))});
    }
    const result = {
      checkedAt:new Date().toISOString(),
      restriction:restriction.status==='fulfilled'?restriction.value:{unavailable:true},
      quota:quota.status==='fulfilled'?quota.value:{unavailable:true},
      contacts,
    };
    console.info('WhatsApp diagnóstico:',JSON.stringify(result));
    await db.setting.upsert({where:{key:'whatsapp-diagnostics'},create:{key:'whatsapp-diagnostics',value:JSON.stringify(result)},update:{value:JSON.stringify(result)}});
  }
  get account() {
    const user = this.socket?.user;
    return this.status === 'connected' && user
      ? { name: user.name || null, phone: phoneFromJid(jidNormalizedUser(user.id)) }
      : null;
  }
  async sendTest(phone: string, text: string) {
    if (!this.socket || this.status !== 'connected')
      throw new Error('Liga o WhatsApp antes de enviar o teste.');
    if (!await this.canSend()) throw new Error(this.gate.reason ?? 'Envios em espera.');
    const socket=this.socket;
    if(!socket)throw new Error('Ligação interrompida.');
    const row=await db.outbox.create({data:{recipient:`${phone.slice(1)}@s.whatsapp.net`,kind:'test',status:'sending',attempts:1,encryptedBody:'',expiresAt:new Date(Date.now()+86400000)}});
    try {
      const recipient = await resolveRecipient(row.recipient, pn => socket.signalRepository.lidMapping.getLIDForPN(pn));
      if(this.socket!==socket||this.status!=='connected')throw new Error('Ligação alterada antes do teste.');
      const result = await socket.sendMessage(recipient, { text });
      if (!result?.key.id) throw new Error('Envio sem confirmação.');
      await db.setting.upsert({where:{key:`outbox-message:${row.id}`},create:{key:`outbox-message:${row.id}`,value:result.key.id},update:{value:result.key.id}});
      console.info('WhatsApp teste:', row.id, result.key.id);
      const sentAt=new Date();
      await db.outbox.update({where:{id:row.id},data:{status:'sent',sentAt}});
      return { sentAt: sentAt.toISOString() };
    } catch(e) {
      const code = (e as { output?: {statusCode?:number} })?.output?.statusCode;
      console.error('Falha no teste WhatsApp:', row.id, typeof code === 'number' ? code : 'sem código');
      await db.outbox.update({where:{id:row.id},data:{status:'uncertain'}});
      throw e;
    }
  }
  async connect() {
    if (this.enabled || this.stopping || this.changing) return;
    this.enabled = true;
    this.failures=0;
    await this.open();
  }
  private open():Promise<void> {
    if(this.opening)return this.opening;
    this.opening=(this.engine==='webjs'?this.openWeb():this.openSocket()).finally(()=>{this.opening=null;});
    return this.opening;
  }
  private async openSocket() {
    if(!this.enabled)return;
    const generation = ++this.generation;
    const openedAt=Date.now();
    this.status = 'connecting';
    try {
      const auth = await loadPostgresAuth({
        connectionString:config.DATABASE_URL, encryptionKey:config.MESSAGE_KEY,
        folder:config.WA_AUTH_DIR,
        onFailure:()=>{
          if(generation!==this.generation)return;
          this.enabled=false;this.generation++;
          const socket=this.socket;this.socket=null;socket?.end(undefined);
          this.qr=null;this.status='error';
          this.lastError='A persistência da sessão ficou indisponível. A ligação foi parada para proteger as credenciais.';
          const previous=this.auth;this.auth=null;
          void previous?.close().catch(()=>{});
          console.error('WhatsApp: persistência PostgreSQL interrompida; socket encerrado.');
        }
      });
      if (!this.enabled || generation !== this.generation) { await auth.close(); return; }
      this.auth = auth;
      const {state, saveCreds} = auth;
      const sock = makeWASocket({
        auth: state,
        logger,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        // Use Baileys' default incremental history processing: it also persists
        // contact privacy tokens and PN/LID mappings. Full history stays disabled.
      });
      this.socket = sock;
      sock.ws.on('CB:ack,class:message', (node: {attrs: Record<string,string>}) => {
        if (generation !== this.generation || !node.attrs.id) return;
        const {id, error} = node.attrs;
        if (error === '463') this.gate.reject();
        // Baileys only emits messages.update for bad ACKs, not successful ACKs.
        void this.recordReceipt(id, error ? 0 : 2, error)
          .catch(() => console.error('Não foi possível guardar a resposta do servidor WhatsApp.'));
        console.info('WhatsApp ACK:', id, error && /^\d{1,6}$/.test(error) ? `rejeitado ${error}` : error ? 'rejeitado' : 'aceite');
      });
      sock.ev.on('messages.update', updates => {
        if (generation !== this.generation) return;
        for (const {key, update} of updates) {
          if (!key.fromMe || !key.id || !key.remoteJid?.endsWith('@s.whatsapp.net') && !key.remoteJid?.endsWith('@lid')) continue;
          const status = update.status;
          if (status == null || ![0, 2, 3, 4, 5].includes(status)) continue;
          void this.recordReceipt(key.id, status, update.messageStubParameters?.[0])
            .catch(() => console.error('Não foi possível guardar a confirmação WhatsApp.'));
        }
      });
      sock.ev.on('creds.update', () => {
        if (generation !== this.generation) return;
        void saveCreds().catch(() => {
          if(generation!==this.generation)return;
          this.enabled=false;this.generation++;this.socket=null;sock.end(undefined);
          this.status = 'error';
          this.lastError = 'Não foi possível guardar a sessão WhatsApp. Verifica a ligação ao PostgreSQL.';
          console.error('WhatsApp: falha ao guardar credenciais.');
        });
      });
      sock.ev.on('connection.update', (update) => { void (async()=>{
        if (generation !== this.generation) return;
        if (update.qr) {
          const qr = await QRCode.toDataURL(update.qr);
          if (generation !== this.generation || !this.enabled) return;
          this.qr = qr;
          this.status = 'qr';
        }
        if (update.connection === 'open') {
          this.gate = new SendGate();
          this.connectedAt = new Date().toISOString();
          this.status = 'connected';
          this.lastError = null;
          this.qr = null;
          this.failures = 0;
          void this.reconcileWelcomes().catch(()=>console.error('WhatsApp: falha ao verificar boas-vindas em falta.'));
          void this.diagnose(sock).catch(()=>console.error('WhatsApp diagnóstico: não foi possível concluir a consulta.'));
        }
        if (update.connection === 'close') {
          console.warn('WhatsApp sessão:',JSON.stringify(closeDiagnostic(update.lastDisconnect?.error,this.status,openedAt)));
          this.qr = null;
          this.socket = null;
          const closedGeneration = ++this.generation;
          if (this.timer) clearTimeout(this.timer);
          this.timer = null;
          sock.end(undefined);
          const code = (
            update.lastDisconnect?.error as { output?: { statusCode?: number } }
          )?.output?.statusCode;
          const policy = disconnectPolicy(code);
          try {
            if(policy.invalidate)await auth.revoke();
            await auth.close();
          } catch {
            await auth.close().catch(()=>{});
            if (closedGeneration !== this.generation) return;
            this.enabled = false;
            this.status = 'error';
            this.lastError = 'Falha ao guardar a sessão. Os ficheiros foram preservados.';
            return;
          }
          if (closedGeneration !== this.generation) return;
          this.auth = null;
          this.lastError = policy.message;
          console.warn('WhatsApp desligado:', code ?? 'sem código', policy.message);
          if (policy.stop) {
            this.status = policy.invalidate ? 'logged_out' : 'error';
            this.enabled = false;
            return;
          }
          this.status = 'disconnected';
          // Paired sessions keep recovering from transport outages; an expired
          // QR must not cause an endless cycle of unauthenticated sockets.
          if (this.enabled && (auth.state.creds.registered || this.failures < 8)) {
            this.failures=Math.min(this.failures+1,8);
            this.timer = setTimeout(
              () => {this.timer=null;if(this.enabled&&closedGeneration===this.generation)void this.open();},
              Math.min(60000, 2000 * 2 ** this.failures),
            );
          } else {
            this.enabled = false;
            this.status = 'error';
          }
        }
      })().catch(()=>{console.error('WhatsApp: falha ao processar estado da ligação.');}); });
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
        if (generation !== this.generation || !this.enabled || type !== 'notify') return;
        this.handleMessages(messages);
      });
    } catch {
      if (generation !== this.generation) return;
      this.socket?.end(undefined);
      await this.auth?.close().catch(()=>{});
      this.auth = null;
      this.lastError = 'Não foi possível iniciar a ligação. A sessão guardada foi preservada.';
      this.status = 'error';
      this.enabled = false;
      this.socket = null;
    }
  }
  private handleMessages(messages:WAMessage[]) {
    const sock=this.socket;if(!sock)return;
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
  }
  private async openWeb(){
    if(!this.enabled)return;
    const generation=++this.generation;
    this.status='connecting';this.lastError=null;
    try {
      const sock=await this.webFactory({databaseUrl:config.DATABASE_URL,folder:config.WA_WEB_AUTH_DIR,executablePath:config.WA_WEB_EXECUTABLE,
        qr:qr=>{void QRCode.toDataURL(qr).then(data=>{if(generation===this.generation&&this.enabled){this.qr=data;this.status='qr';}}).catch(()=>{});},
        ready:()=>{if(generation!==this.generation)return;this.status='connected';this.qr=null;this.lastError=null;this.failures=0;this.connectedAt=new Date().toISOString();void this.reconcileWelcomes().catch(()=>{});},
        closed:revoked=>{if(generation!==this.generation)return;
          const closed=++this.generation;const previous=this.socket;this.socket=null;this.qr=null;
          this.status=revoked?'logged_out':'disconnected';
          this.lastError=revoked?'O WhatsApp Web terminou a sessão. Associa novamente por QR.':'WhatsApp Web interrompido. A recuperar a ligação.';
          const closing=Promise.resolve(previous?.end());this.closingSocket=closing;
          void closing.then(()=>{
            if(closed!==this.generation||!this.enabled)return;
            if(revoked){this.enabled=false;return;}
            this.failures=Math.min(this.failures+1,8);
            this.timer=setTimeout(()=>{this.timer=null;if(closed===this.generation&&this.enabled)void this.open();},Math.min(60000,2000*2**this.failures));
          }).catch(()=>{if(closed===this.generation){this.enabled=false;this.status='error';this.lastError='Não foi possível encerrar o navegador anterior.';}}).finally(()=>{if(this.closingSocket===closing)this.closingSocket=null;});
        },
        message:message=>{if(generation===this.generation&&this.enabled)this.handleMessages([message]);},
        receipt:(id,status)=>{if(generation===this.generation)void this.recordReceipt(id,status).catch(()=>{});},
        joined:(group,ids)=>{if(generation===this.generation)void queueWelcome(group,ids).catch(()=>{});}
      });
      if(generation!==this.generation||!this.enabled){await sock.end();return;}
      this.socket=sock;
    }catch{if(generation===this.generation){this.enabled=false;this.status='error';this.lastError='Não foi possível iniciar o WhatsApp Web. Verifica o navegador e se já existe outra ligação ativa.';}}
  }
  async disconnect() {
    this.stopping = true;
    this.enabled = false;
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const sock = this.socket;
    this.socket = null;
    this.qr = null;
    this.status = 'disconnected';
    const stopped=Promise.resolve(sock?.end(undefined));
    try {
      await stopped;
      await this.opening;
      await this.closingSocket;
      await this.auth?.close();
      this.auth=null;
    } finally { this.stopping=false; }
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
    if(await automaticPaused())return;
    const group = await db.setting.findUnique({
      where: { key: 'whatsapp_group' },
    });
    if (!group || chat !== group.value || !this.socket) return;
    if (!await this.canSend()) return;
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
    if(await automaticPaused())return;
    await this.socket.sendMessage(chat, {
      mentions: [`${phone.slice(1)}@s.whatsapp.net`],
      text: `@${phone.slice(1)} ${player.name} · ${player.division} · ${player.side}\n${game ? `Próximo jogo: ${game.date}, ${game.time}, ${game.court.name}.` : 'Ainda não tens um jogo publicado.'}\n${config.APP_ORIGIN}/jogos`,
    });
  }
  async deliver() {
    if (this.sending || this.status !== 'connected' || !this.socket) return;
    this.sending = true;
    try {
      if (!await this.canSend()) return;
      const socket = this.socket!;
      const row = await claimDelivery();
      if (!row) return;
      let attempted = false;
      const ready = async () => {
        if(await automaticPaused())throw new DeliveryPaused('Envios automáticos pausados.');
        if (this.socket !== socket || this.status !== 'connected') throw new Error('Ligação interrompida antes do envio.');
      };
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
          await ready();
          attempted = true;
          const outcome=await joinApprovedPlayer(socket,payload.group,row.recipient);
          if(outcome==='added'||outcome==='already_member')await queueWelcome(payload.group,[row.recipient]);
          if(outcome==='invite') {
            const recipient = await resolveRecipient(row.recipient, pn => socket.signalRepository.lidMapping.getLIDForPN(pn));
            await ready();
            await socket.sendMessage(recipient,{text:payload.text});
          }
          await db.outbox.update({where:{id:row.id},data:{status:outcome==='invite'?'invited':outcome,sentAt:new Date(),encryptedBody:''}});
          return;
        }
        if(row.kind==='invitation') await finishInvitation();
        const recipient = await resolveRecipient(row.recipient, pn => socket.signalRepository.lidMapping.getLIDForPN(pn));
        const body = decrypt(row.encryptedBody, config.MESSAGE_KEY);
        const content = row.kind === 'ai' ? decodeBotMessage(body) : {text:body};
        await ready();
        attempted = true;
        const result = await socket.sendMessage(recipient, content);
        if(row.kind==='invitation') await finishInvitation();
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
        if(row.kind==='invitation') await finishInvitation();
        const code = (error as { output?: { statusCode?: number } })?.output?.statusCode;
        console.error('Falha no envio WhatsApp:', row.id, row.kind, typeof code === 'number' ? code : 'sem código');
        await db.outbox.update({
          where: { id: row.id },
          data: { status: !attempted && (error instanceof DeliveryPaused || this.socket !== socket || this.status !== 'connected') ? 'pending' : 'uncertain' },
        });
      }
    } finally {
      this.sending = false;
    }
  }
}
