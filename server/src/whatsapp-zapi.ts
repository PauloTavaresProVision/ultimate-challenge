import {Client as PgClient} from 'pg';
import type {openWebWhatsApp} from './whatsapp-web.ts';
import type {MessagingSocket,GroupInfo} from './whatsapp-transport.ts';
import {ZApiClient,zJid,zPhone,zMessageId,zReceipt} from './zapi-client.ts';
import {loadZSettings} from './zapi-settings.ts';
import {db} from './db.ts';
import {config} from './config.ts';
import {decrypt} from './security.ts';
type Options=Parameters<typeof openWebWhatsApp>[0];
export async function openZApi(options:Options):Promise<MessagingSocket>{
  const settings=await loadZSettings();if(!settings)throw new Error('Configura as credenciais da Z-API.');
  const client=new ZApiClient(settings);
  const lease=new PgClient({connectionString:options.databaseUrl,connectionTimeoutMillis:10000});
  let stopped=false,connected=false,timer:ReturnType<typeof setTimeout>|undefined,user:MessagingSocket['user'];
  const close=()=>{if(!stopped)options.closed(false);};lease.on('error',close);lease.on('end',close);
  try{
    await lease.connect();const lock=await lease.query('SELECT pg_try_advisory_lock(186937789,1) AS owned');
    if(!lock.rows[0].owned)throw new Error('Outra ligação WhatsApp está ativa.');
    const origin=new URL(config.APP_ORIGIN);if(origin.protocol!=='https:')throw new Error('A Z-API exige um endereço público HTTPS para os webhooks.');
    const result=await client.call('update-every-webhooks','PUT',{value:`${origin.origin}/api/webhooks/zapi/${settings.webhookSecret}`,notifySentByMe:false});
    if(result.value!==true)throw new Error('A Z-API não confirmou a configuração dos webhooks.');
    let protectedQueue=false;
    try{
      const queue=await client.call('update-queue-settings','PUT',{disableEnqueueWhenDisconnected:true});
      protectedQueue=queue?.success===true;
    }catch{/* Optional provider setting must not invalidate an authenticated connection. */}
    const warning=protectedQueue?'':'A Z-API não confirmou o bloqueio da sua fila quando desligada. A plataforma verifica a ligação antes de cada envio, mas a fila remota pode aceitar mensagens se a ligação cair entretanto.';
    await db.setting.upsert({where:{key:'zapi-queue-warning'},create:{key:'zapi-queue-warning',value:warning},update:{value:warning}});
  }catch(e){stopped=true;await lease.end();throw e;}
  const check=()=>{if(stopped||!connected)throw new Error('Z-API desligada.');};
  const metadata=async(id:string):Promise<GroupInfo>=>{
    check();const r=await client.call('group-metadata/'+encodeURIComponent(zPhone(id)));
    if(!Array.isArray(r.participants))throw new Error('Z-API não devolveu os participantes.');
    return {id,subject:r.subject??id,participants:r.participants.map((p:{phone:string})=>({id:zJid(p.phone),phoneNumber:/^\d+$/.test(p.phone)?zJid(p.phone):undefined}))};
  };
  const socket:MessagingSocket={
    get user(){return user;},
    signalRepository:{lidMapping:{getLIDForPN:async()=>null,getPNForLID:async lid=>{
      const r=await db.setting.findUnique({where:{key:'zapi-lid:'+settings.instanceId+':'+lid}});return r?.value??null;
    }}},
    async sendMessage(id,content){check();
      const status=await client.call('status');
      if(status?.connected!==true)throw new Error('Z-API desligada. A mensagem não foi enviada à API.');
      check();const r=await client.call('send-text','POST',{phone:zPhone(id),message:content.text,...(content.mentions?.length?{mentioned:content.mentions.map(zPhone)}:{})});
      if(typeof r.messageId!=='string'||!r.messageId)throw new Error('Z-API não devolveu o identificador do envio.');
      const messageId=zMessageId(settings.instanceId,r.messageId);
      // HTTP 200 means queued at Z-API, not delivered to WhatsApp.
      if(typeof r.zaapId==='string'){
        const alias=zMessageId(settings.instanceId,r.zaapId);
        await db.setting.upsert({where:{key:'zapi-alias:'+alias},create:{key:'zapi-alias:'+alias,value:messageId},update:{value:messageId}});
        const early=await db.setting.findUnique({where:{key:'wa-receipt:'+alias}});if(early)options.receipt(messageId,Number(early.value));
      }
      return {key:{id:messageId}};
    },
    groupMetadata:metadata,
    async groupFetchAllParticipating(){check();const groups:Record<string,GroupInfo>={};
      for(let page=1;page<=100;page++){
        const rows=await client.call('groups?page='+page+'&pageSize=100');if(!Array.isArray(rows))throw new Error('Z-API não devolveu a lista de grupos.');
        for(const row of rows){if(typeof row.phone==='string'&&row.phone.endsWith('-group')){const id=zJid(row.phone);groups[id]={id,subject:row.name??id,participants:[]};}}
        if(rows.length<100)return groups;
      }throw new Error('Lista de grupos excede o limite de paginação.');
    },
    async groupInviteCode(id){check();const r=await client.call('group-invitation-link/'+encodeURIComponent(zPhone(id)));
      const url=new URL(r.invitationLink);if(url.hostname!=='chat.whatsapp.com')throw new Error('Link de grupo inválido.');return url.pathname.slice(1);},
    async groupParticipantsUpdate(id,participants){check();const phones=participants.map(zPhone);
      if(phones.some(p=>!/^\d+$/.test(p)))throw new Error('A Z-API exige números de telefone para adicionar participantes.');
      await client.call('add-participant','POST',{groupId:zPhone(id),phones,autoInvite:false});
      // The API's value:true is not evidence of membership. Verify the group.
      const members=await metadata(id);return participants.map(p=>({status:members.participants.some(m=>m.id===p)?'200':'408'}));
    },
    async end(){stopped=true;connected=false;if(timer)clearTimeout(timer);await lease.end();}
  };
  const poll=async()=>{
    try{
      const status=await client.call('status');if(stopped)return;
      if(status.connected===true){
        if(!connected){const device=await client.call('device');if(stopped)return;if(!/^\d+$/.test(device.phone??''))throw new Error('Z-API não identificou o número ligado.');user={id:zJid(device.phone),name:device.name};connected=true;options.ready();}
      }else{if(connected){connected=false;options.closed(false,'A Z-API perdeu a ligação. Verifica a instância antes de voltar a ligar.');return;}
        const qr=await client.call('qr-code/image');if(stopped)return;
        if(qr.challenge)throw new Error('Z-API: conclui a chave de acesso no painel Z-API e volta a ligar aqui.');
        if(typeof qr.value!=='string'||!qr.value.startsWith('data:image/png;base64,'))throw new Error('A Z-API não devolveu uma imagem QR válida.');options.qr(qr.value);
      }
      const inbox=connected?await db.setting.findMany({where:{key:{startsWith:'zapi-inbox:'+settings.instanceId+':'}},take:100}):[];
      for(const row of inbox){if(stopped)return;const p=JSON.parse(decrypt(row.value,config.MESSAGE_KEY));
        if(p.instanceId!==settings.instanceId)continue;
        if(p.type==='ReceivedCallback'&&p.isGroup===true){
          const group=zJid(p.phone??'');
          if(['GROUP_PARTICIPANT_ADD','GROUP_PARTICIPANT_INVITE'].includes(p.notification))options.joined(group,(p.notificationParameters??[]).filter((v:unknown)=>typeof v==='string'&&/^\d+$/.test(v)).map(zJid));
          if(!p.fromMe&&!p.isEdit&&!p.waitingMessage&&typeof p.text?.message==='string'&&typeof p.messageId==='string'){
            const phone=typeof p.participantPhone==='string'&&/^\d+$/.test(p.participantPhone)?zJid(p.participantPhone):undefined;
            const lid=typeof p.participantLid==='string'&&p.participantLid.endsWith('@lid')?p.participantLid:undefined;
            if(phone&&lid)await db.setting.upsert({where:{key:'zapi-lid:'+settings.instanceId+':'+lid},create:{key:'zapi-lid:'+settings.instanceId+':'+lid,value:phone},update:{value:phone}});
            if(phone||lid)options.message({key:{id:p.messageId,remoteJid:group,participant:lid??phone,participantAlt:phone,fromMe:false},message:{extendedTextMessage:{text:p.text.message,contextInfo:{stanzaId:p.referenceMessageId??undefined}}}});
          }
        }
        await db.setting.delete({where:{key:row.key}});
      }
    }catch(e){if(!stopped){options.closed(false,e instanceof Error&&e.message.startsWith('Z-API')?e.message:'Não foi possível concluir a ligação Z-API. Verifica as credenciais e a ligação no painel Z-API.');return;}}
    if(!stopped)timer=setTimeout(()=>void poll(),10000);
  };
  timer=setTimeout(()=>void poll(),0);
  return socket;
}
