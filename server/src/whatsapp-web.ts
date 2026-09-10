import WWebJS from 'whatsapp-web.js';
import type {Client as WebClient, ClientOptions, GroupChat, Message} from 'whatsapp-web.js';
import {Client as PgClient} from 'pg';
import {resolve} from 'node:path';
import type {WAMessage} from '@whiskeysockets/baileys';
import type {GroupInfo,MessagingSocket} from './whatsapp-transport.ts';
import {webStartupError} from './whatsapp-web-error.ts';
import {recoverBrowserLock} from './whatsapp-browser-lock.ts';
import {lostWebContext} from './group-recovery.ts';

export const toWebId=(id:string)=>id.replace(/@s\.whatsapp\.net$/,'@c.us');
export const fromWebId=(id:string)=>id.replace(/@c\.us$/,'@s.whatsapp.net');
export const webReceipt=(ack:number)=>({[-1]:0,1:2,2:3,3:4,4:5} as Record<number,number>)[ack];

export async function openWebWhatsApp(options:{databaseUrl:string;folder:string;executablePath?:string;
  qr:(qr:string)=>void;authenticated?:()=>void;ready:()=>void;closed:(revoked:boolean,startupError?:string)=>void;
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
    await recoverBrowserLock(resolve(options.folder,'session-ultimate'));
    client=createClient({
      authStrategy:new WWebJS.LocalAuth({clientId:'ultimate',dataPath:resolve(options.folder)}),
      // The image WORKDIR is root-owned. Cache persistence runs after authenticated
      // and before ready, so its default relative path would strand initialization.
      webVersionCache:{type:'local',path:resolve(options.folder,'web-cache')},
      takeoverOnConflict:false,authTimeoutMs:60000,qrMaxRetries:8,
      puppeteer:{headless:true,executablePath:options.executablePath||undefined,
        args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']}
    });
  } catch(error){stopped=true;await lease.end().catch(()=>{});throw error;}
  const check=()=>{if(stopped||!ready)throw new Error('WhatsApp Web desligado.');};
  const groupOperation=async<T>(operation:()=>Promise<T>):Promise<T>=>{
    try{return await operation();}catch(error){if(!stopped&&lostWebContext(error))reportClose(false);throw error;}
  };
  const group=async(id:string)=>{
    check();if(!id.endsWith('@g.us'))throw new Error('Grupo inválido.');
    // getChatById serializes unrelated chat/message state and can fail in IndexedDB.
    // Keep the library's GroupChat methods, with only the metadata they require.
    const data=await client.pupPage!.evaluate(async groupId=>{
      const w=globalThis as unknown as {require:(name:string)=>any};
      const wid=w.require('WAWebWidFactory').createWid(groupId);
      const chats=w.require('WAWebCollections').Chat;
      const chat=chats.get(wid)||await chats.find(wid);
      if(!chat)throw new Error('Grupo não encontrado no WhatsApp.');
      await w.require('WAWebGroupQueryJob').queryAndUpdateGroupMetadataById({id:groupId});
      if(!chat.groupMetadata?.participants)throw new Error('Participantes do grupo indisponíveis.');
      return {id:{_serialized:groupId},formattedTitle:chat.groupMetadata.subject??chat.name??groupId,isGroup:true,
        groupMetadata:{participants:chat.groupMetadata.participants.serialize().map((p:{id:{_serialized:string}})=>({id:{_serialized:p.id._serialized}}))}};
    },id);
    const Group=(WWebJS as unknown as {GroupChat:new(client:WebClient,data:unknown)=>GroupChat}).GroupChat;
    return new Group(client,data);
  };
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
      {mentions:content.mentions?.map(toWebId),sendSeen:false});
      if(result){const status=webReceipt(result.ack);if(status!==undefined)options.receipt(result.id._serialized,status);}
      return result?{key:{id:result.id._serialized}}:undefined;},
    async fetchReceipt(id){check();const message=await client.getMessageById(id);return message?webReceipt(message.ack)??null:null;},
    async groupMetadata(id){return groupOperation(async()=>metadata(await group(id)));},
    async groupFetchAllParticipating(){
      check();
      // Read only group identifiers and names. getChats serializes every private
      // conversation and its last message, which is unnecessary for this selector.
      const page=client.pupPage;if(!page)throw new Error('Navegador WhatsApp indisponível.');
      const groups=await page.evaluate(()=>{
        const w=globalThis as unknown as {require:(name:string)=>{Chat:{getModelsArray:()=>Array<{id?:{_serialized?:string};name?:string;groupMetadata?:{subject?:string}}>}}};
        return w.require('WAWebCollections').Chat.getModelsArray()
          .filter(c=>c.id?._serialized?.endsWith('@g.us'))
          .map(c=>({id:c.id!._serialized!,subject:c.name||c.groupMetadata?.subject||c.id!._serialized!}));
      });
      return Object.fromEntries(groups.map(g=>[g.id,{...g,participants:[]}]));
    },
    async groupInviteCode(id){return (await group(id)).getInviteCode();},
    async groupParticipantsUpdate(id,participants){
      const results=await groupOperation(async()=>(await group(id)).addParticipants(participants.map(toWebId),{autoSendInviteV4:false}));
      if(typeof results==='string')throw new Error(results.includes('no admin rights')?'O número ligado não é administrador do grupo.':'WhatsApp Web recusou a operação de adicionar ao grupo.');
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
  void initialization.catch(error=>{
    if(stopped)return;
    const detail=webStartupError(error);
    console.error('WhatsApp Web arranque:',detail);
    ready=false;options.closed(false,detail);
  });
  return socket;
}
