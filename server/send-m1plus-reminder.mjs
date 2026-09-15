import {db} from './src/db.ts';
import {encrypt} from './src/security.ts';
import {config} from './src/config.ts';
try {
 await db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('journeys'))`;
  if((await tx.setting.findUnique({where:{key:'whatsapp-automatic-paused'}}))?.value==='true')throw Error('Os envios estão pausados. Nada foi colocado na fila.');
  const group=(await tx.setting.findUnique({where:{key:'whatsapp_group'}}))?.value;
  const rows=await tx.setting.findMany({where:{key:{startsWith:'journey:'}}});
  const matches=rows.map(r=>JSON.parse(r.value)).filter(j=>j.group===group&&j.division==='M1+'&&j.date==='2026-09-23'&&j.time==='20:00'&&j.status==='open');
  if(matches.length!==1)throw Error('Não encontrei uma única jornada M1+ aberta em 23/09 às 20:00.');
  const j=matches[0],free=j.capacity-j.confirmed.length;
  if(free<=0||new Date(j.date+'T'+j.time+':00+01:00')<=new Date())throw Error('A jornada já não tem vagas disponíveis ou já começou.');
  const marker='journey-reminder:'+j.id+':missing-m1plus-v1';
  const existing=await tx.setting.findUnique({where:{key:marker}});
  if(existing){const message=await tx.outbox.findUnique({where:{id:existing.value},select:{status:true}});console.log('Mensagem já preparada. Estado:',message?.status??'indisponível');return;}
  const players=await tx.player.findMany({where:{division:'M1+',status:'Ativo'},select:{id:true,name:true,phone:true},orderBy:{name:'asc'}});
  const missing=players.filter(p=>!j.confirmed.includes(p.id)&&!j.waiting.includes(p.id));
  if(!missing.length)throw Error('Todos os jogadores já estão inscritos ou em espera.');
  if(missing.some(p=>!/^\+[1-9]\d{7,14}$/.test(p.phone)))throw Error('Há um número inválido. Nada foi enviado.');
  const tags=missing.map(p=>'@'+p.phone.slice(1)).join(', ');
  const text=`🎾 *M1+, ${free===1?'falta só 1 vaga':`faltam só ${free} vagas`}!*\n\n${tags}… estamos à espera de quê? De um convite com transporte e massagem incluídos? 😂\n\n${missing.length>free?`São *${missing.length} nomes para ${free} ${free===1?'vaga':'vagas'}*. Quem ficar de fora pode sempre levar a toalha e dar conselhos da bancada! 👀🍿`:'Ainda vão a tempo de trocar o sofá pelo campo! 👀🎾'}\n\n📅 *23/09 às 20:00*\n📍 *Premier Padel Club*\n\nRespondam aqui a confirmar a participação. As vagas não se guardam com um «depois digo»! 💪🎾`;
  const message=await tx.outbox.create({data:{recipient:j.group,kind:'journey_reply',encryptedBody:encrypt(JSON.stringify({format:'mentioned-reply-v1',text,mentions:missing.map(p=>p.phone.slice(1)+'@s.whatsapp.net')}),config.MESSAGE_KEY),expiresAt:new Date(Date.now()+600000)}});
  await tx.setting.create({data:{key:'journey-message:'+message.id,value:j.id}});
  await tx.setting.create({data:{key:marker,value:message.id}});
  console.log('Mensagem colocada na fila. Vagas:',free);
  console.log('Pessoas mencionadas:',missing.map(p=>p.name).join(', '));
  console.log('ID do envio:',message.id);
 });
} catch(e){console.error(e instanceof Error?e.message:'Não foi possível preparar a mensagem.');process.exitCode=1;}
finally {await db.$disconnect();}
