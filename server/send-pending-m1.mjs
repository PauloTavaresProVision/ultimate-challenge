import {db} from './src/db.ts';
import {decrypt, encrypt} from './src/security.ts';
import {config} from './src/config.ts';
import {roundAnnouncement} from './src/round-announcement.ts';
try {
  await db.$transaction(async tx => {
    const group = (await tx.setting.findUnique({where:{key:'whatsapp_group'}}))?.value;
    if (!group) throw Error('Não existe grupo configurado.');
    const rows = await tx.outbox.findMany({where:{kind:'round',recipient:group,status:'pending',attempts:0,expiresAt:{gt:new Date()}}});
    const candidates = rows.map(row => {
      const body = decrypt(row.encryptedBody,config.MESSAGE_KEY);
      let message;
      try { message = JSON.parse(body); } catch {}
      const text = message?.format === 'mentioned-reply-v1' ? message.text : body;
      return {row,body,message,text};
    }).filter(({text}) => typeof text === 'string' && (/^M1$/m.test(text) || text.includes('*Ultimate Challenge · M1*')));
    if (candidates.length !== 1) throw Error(candidates.length
      ? 'Existe mais de uma convocatória M1 pendente. Nada foi enviado.'
      : 'Não há convocatória M1 pendente sem tentativas. Se ainda está em rascunho, publica o sorteio M1 primeiro.');
    const {row,body} = candidates[0];
    let {message} = candidates[0];
    if (message?.format === 'mentioned-reply-v1') {
      const headers = message.text.match(/\*Ultimate Challenge · [^*]+\*/g);
      if (headers?.length !== 1 || headers[0] !== '*Ultimate Challenge · M1*' || !Array.isArray(message.mentions) || !message.mentions.length)
        throw Error('A convocatória não contém apenas M1 com menções. Nada foi alterado.');
    } else {
      const players = await tx.player.findMany();
      const courts = await tx.court.findMany();
      const games = await tx.game.findMany({where:{published:true,division:'M1'},orderBy:[{date:'asc'},{time:'asc'}]});
      let remaining = body;
      const selected = games.filter(g => {
        const name = id => players.find(p=>p.id===id)?.name;
        const block = `${g.date} · ${g.time} · ${courts.find(c=>c.id===g.courtId)?.name}\n${g.a.map(name).join(' / ')} × ${g.b.map(name).join(' / ')}`;
        if (!remaining.includes(block)) return false;
        remaining = remaining.replace(block,'');
        return true;
      });
      remaining = remaining.replace('🎾 Escada · Jogos','').replace(/^M1$/m,'').replace(`Jogos: ${config.APP_ORIGIN}/jogos`,'').trim();
      if (remaining || !selected.length) throw Error('Os jogos M1 já não correspondem à mensagem guardada. Nada foi alterado.');
      message = roundAnnouncement(selected.map(g=>({...g,court:g.courtId})),players,courts,config.APP_ORIGIN);
    }
    const result = await tx.outbox.updateMany({where:{id:row.id,status:'pending',attempts:0,encryptedBody:row.encryptedBody},data:{encryptedBody:encrypt(JSON.stringify(message),config.MESSAGE_KEY),nextAttemptAt:new Date()}});
    if (!result.count) throw Error('A fila mudou entretanto. Não foi repetido o envio.');
    console.log(message.text);
    console.log('\nM1 preparado para envio imediato.');
  });
} catch(e) {console.error(e.message);process.exitCode=1;}
finally {await db.$disconnect();}
