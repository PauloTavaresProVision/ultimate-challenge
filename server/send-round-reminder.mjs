import {db} from './src/db.ts';
import {encrypt,digest} from './src/security.ts';
import {config} from './src/config.ts';
import {roundAnnouncement} from './src/round-announcement.ts';
const division=process.env.ROUND_DIVISION;
try {
  if(!['M1+','M1','M2+','M2'].includes(division))throw Error('Indica uma divisão válida.');
  await db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('round-reminder'))`;
    const group=(await tx.setting.findUnique({where:{key:'whatsapp_group'}}))?.value;
    if(!group)throw Error('Grupo não configurado.');
    if((await tx.setting.findUnique({where:{key:'whatsapp-automatic-paused'}}))?.value==='true')throw Error('Os envios automáticos estão pausados. Retoma-os antes de enviar o lembrete.');
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Luanda',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const games=await tx.game.findMany({where:{division,published:true,date:{gte:today}},orderBy:[{date:'asc'},{time:'asc'}]});
    const rounds=new Map();
    for(const game of games){const key=`${game.round}:${game.date}`;rounds.set(key,[...(rounds.get(key)??[]),game]);}
    const upcoming=[...rounds.values()].filter(gs=>!gs.some(g=>g.winner)&&new Date(`${gs[0].date}T${gs[0].time}:00+01:00`)>new Date());
    if(upcoming.length!==1)throw Error(upcoming.length?'Há várias rondas futuras publicadas nesta divisão. É necessário identificar qual anunciar.':'Não encontrei uma ronda publicada desta divisão que ainda não tenha começado.');
    const selected=upcoming[0];
    const marker=`round-reminder:${digest(`${group}:${division}:${selected[0].round}:${selected[0].date}:v1`)}`;
    const prior=await tx.setting.findUnique({where:{key:marker}});
    if(prior){const old=await tx.outbox.findUnique({where:{id:prior.value},select:{status:true}});console.log('Este lembrete já foi preparado. Estado:',old?.status??'indisponível');return;}
    const ids=[...new Set(selected.flatMap(g=>[...g.a,...g.b]))];
    const players=await tx.player.findMany({where:{id:{in:ids}}});
    const courts=await tx.court.findMany({where:{id:{in:[...new Set(selected.map(g=>g.courtId))]}}});
    const message=roundAnnouncement(selected.map(g=>({...g,court:g.courtId})),players,courts,config.APP_ORIGIN);
    message.text=message.text.replace('O sorteio está feito! 🎾','📣 *Lembrete dos jogos!*');
    const outbox=await tx.outbox.create({data:{recipient:group,kind:'round',encryptedBody:encrypt(JSON.stringify(message),config.MESSAGE_KEY),nextAttemptAt:new Date(),expiresAt:new Date(`${selected[0].date}T${selected[0].time}:00+01:00`)}});
    await tx.setting.create({data:{key:marker,value:outbox.id}});
    await tx.audit.create({data:{actor:'admin',action:`Lembrete ${division} da ronda ${selected[0].round} preparado para o grupo.`}});
    console.log(message.text);
    console.log('\nNovo lembrete colocado na fila para envio imediato. ID:',outbox.id);
  });
}catch(e){console.error(e.message);process.exitCode=1;}
finally{await db.$disconnect();}
