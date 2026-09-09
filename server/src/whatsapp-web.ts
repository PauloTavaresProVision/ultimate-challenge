import WWebJS from 'whatsapp-web.js';
import type {Client as WebClient, ClientOptions, GroupChat, Message} from 'whatsapp-web.js';
import {Client as PgClient} from 'pg';
import {resolve} from 'node:path';
import type {WAMessage} from '@whiskeysockets/baileys';
import type {GroupInfo,MessagingSocket} from './whatsapp-transport.ts';

export const toWebId=(id:string)=>id.replace(/@s\.whatsapp\.net$/,'@c.us');
export const fromWebId=(id:string)=>id.replace(/@c\.us$/,'@s.whatsapp.net');
export const webReceipt=(ack:number)=>({[-1]:0,1:2,2:3,3:4,4:5} as Record<number,number>)[ack];

export async function openWebWhatsApp(options:{databaseUrl:string;folder:string;executablePath?:string;
  qr:(qr:string)=>void;authenticated?:()=>void;ready:()=>void;closed:(revoked:boolean)=>void;
  message:(message:WAMessage)=>void;receipt:(id:string,status:number)=>void;joined:(group:string,ids:string[])=>void;
}, createClient:(options:ClientOptions)=>WebClient=options=>new WWebJS.Client(options)):Promise<MessagingSocket> {
  const lease=new PgClient({connectionString:options.databaseUrl,connectionTimeoutMillis:10000,keepAlive:true});
  let stopped=false,ready=false,closing:Promise<void>|undefined;
  let client:WebClient;
  let initialization:Promise<void>|undefined;
  const reportClose=(revoked:boolean)=>{if(!stopped){ready=false;options.closed(revoked);}};
  lease.on('error',()=>reportClose(false));
  lease.on('end',()=>reportClose(false));
  try {
    await lease.connect();
    const lock=await lease.query('SELECT pg_try_advisory_lock(186937789,1) AS owned');
    if(!lock.rows[0].owned)throw new Error('Outra ligação WhatsApp está ativa.');
    client=createClient({
      authStrategy:new WWebJS.LocalAuth({clientId:'ultimate',dataPath:resolve(options.folder)}),
      takeoverOnConflict:false,authTimeoutMs:60000,qrMaxRetries:8,
      puppeteer:{headless:true,executablePath:options.executablePath||undefined,
        args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']}
    });
  } catch(error){stopped=true;await lease.end().catch(()=>{});throw error;}
  const check=()=>{if(stopped||!ready)throw new Error('WhatsApp Web desligado.');};
  const group=async(id:string)=>{check();const chat=await client.getChatById(toWebId(id));if(!chat.isGroup)throw new Error('Grupo inválido.');return chat as GroupChat;};
  const pn=async(id:string)=>{
    if(!id.endsWith('@lid'))return fromWebId(id);
    const mapped=await client.getContactLidAndPhone([id]);
    return mapped[0]?.pn?fromWebId(mapped[0].pn):null;
  };
  const metadata=async(chat:GroupChat):Promise<GroupInfo>=>({id:chat.id._serialized,subject:chat.name,
    participants:await Promise.all(chat.participants.map(async p=>({id:fromWebId(p.id._serialized),phoneNumber:await pn(p.id._serialized)??undefined}))) });
  const socket:MessagingSocket={
    get user(){const info=client.info;return info?{id:fromWebId(info.wid._serialized),name:info.pushname}:undefined;},
    signalRepository:{lidMapping:{getLIDForPN:async()=>null,getPNForLID:pn}},
    async sendMessage(id,content){check();const result=await client.sendMessage(toWebId(id),content.text,
      {mentions:content.mentions?.map(toWebId),sendSeen:false});return result?{key:{id:result.id._serialized}}:undefined;},
    async groupMetadata(id){return metadata(await group(id));},
    async groupFetchAllParticipating(){check();const chats=await client.getChats();return Object.fromEntries(chats.filter(c=>c.isGroup).map(c=>[c.id._serialized,{id:c.id._serialized,subject:c.name,participants:[]}]));},
    async groupInviteCode(id){return (await group(id)).getInviteCode();},
    async groupParticipantsUpdate(id,participants){
      const results=await (await group(id)).addParticipants(participants.map(toWebId),{autoSendInviteV4:false});
      if(typeof results==='string')throw new Error('Entrada no grupo não confirmada.');
      return participants.map(p=>({status:String(results[toWebId(p)]?.code??0)}));
    },
    end(){
      if(!closing){stopped=true;ready=false;closing=(async()=>{
        // destroy closes Chromium without unlinking the device (logout would revoke it).
        if(client.pupBrowser)await client.destroy();
        await initialization?.catch(()=>{});
        if(client.pupBrowser?.isConnected())await client.destroy();
        await lease.end();
      })();}
      return closing;
    }
  };
  client.on('qr',value=>{if(!stopped)options.qr(value);});
  client.on('authenticated',()=>{if(!stopped){console.info('WhatsApp Web: associado; a concluir inicialização.');options.authenticated?.();}});
  client.on('ready',()=>{if(!stopped){ready=true;console.info('WhatsApp Web: pronto para enviar.');options.ready();}});
  client.on('auth_failure',()=>reportClose(true));
  client.on('disconnected',reason=>{
    if(stopped)return;
    const terminal=['LOGOUT','CONFLICT','UNPAIRED','UNPAIRED_IDLE','Max qrcode retries reached'];
    console.warn('WhatsApp Web sessão:',terminal.includes(reason)?reason:'ligação interrompida');
    reportClose(terminal.includes(reason));
  });
  client.on('message_ack',(message:Message,ack:number)=>{const status=webReceipt(ack);if(!stopped&&status!==undefined)options.receipt(message.id._serialized,status);});
  client.on('group_join',notification=>{if(!stopped)options.joined(notification.chatId,notification.recipientIds.map(fromWebId));});
  client.on('message',(message:Message)=>{void (async()=>{
    if(stopped||!ready||message.fromMe||!message.body||!message.from.endsWith('@g.us'))return;
    const sender=message.author??message.from;
    const phone=await pn(sender);if(stopped||!ready)return;
    const quoted=message.hasQuotedMsg?await message.getQuotedMessage().catch(()=>null):null;
    options.message({key:{id:message.id._serialized,remoteJid:message.from,fromMe:false,participant:fromWebId(sender),participantAlt:phone??undefined},
      message:{extendedTextMessage:{text:message.body,contextInfo:quoted?{stanzaId:quoted.id._serialized}:undefined}}});
  })().catch(()=>console.error('WhatsApp Web: falha ao ler mensagem do grupo.'));});
  // Let the caller install ownership before any browser callback is delivered.
  initialization=new Promise<void>(resolve=>setImmediate(resolve)).then(()=>{if(!stopped)return client.initialize();});
  void initialization.catch(()=>reportClose(false));
  return socket;
}
