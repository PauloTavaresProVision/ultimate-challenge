// Run inside the updated application container. Only updates the reviewed pending message.
import {db} from './src/db.ts';
import {decrypt, encrypt} from './src/security.ts';
import {config} from './src/config.ts';
import {roundAnnouncement} from './src/round-announcement.ts';
const id = '2ad15afd-39d1-4e8c-ab27-10e18c7253fd';
try {
  await db.$transaction(async tx => {
    const row = await tx.outbox.findUnique({where:{id}});
    if (!row || row.kind !== 'round' || row.status !== 'pending' || row.attempts !== 0)
      throw Error('A mensagem já saiu da fila ou teve uma tentativa. Não foi repetida.');
    if (row.expiresAt <= new Date()) throw Error('A mensagem expirou. Nada foi alterado.');
    const group = await tx.setting.findUnique({where:{key:'whatsapp_group'}});
    if (group?.value !== row.recipient) throw Error('O grupo foi alterado. Nada foi enviado.');
    const players = await tx.player.findMany();
    const courts = await tx.court.findMany();
    const games = await tx.game.findMany({where:{published:true,division:'M1+',date:'2026-09-23'},orderBy:{time:'asc'}});
    let remaining = decrypt(row.encryptedBody,config.MESSAGE_KEY);
    const selected = games.filter(g => {
      const name = id => players.find(p=>p.id===id)?.name;
      const block = `${g.date} · ${g.time} · ${courts.find(c=>c.id===g.courtId)?.name}\n${g.a.map(name).join(' / ')} × ${g.b.map(name).join(' / ')}`;
      if (!remaining.includes(block)) return false;
      remaining = remaining.replace(block,'');
      return true;
    });
    remaining = remaining.replace('🎾 Escada · Jogos','').replace('M1+','').replace(`Jogos: ${config.APP_ORIGIN}/jogos`,'').trim();
    if (remaining || selected.length !== 16) throw Error('Os jogos já não correspondem à mensagem revista. Nada foi alterado.');
    const message = roundAnnouncement(selected.map(g=>({...g,court:g.courtId})),players,courts,config.APP_ORIGIN);
    const result = await tx.outbox.updateMany({where:{id,status:'pending',attempts:0,encryptedBody:row.encryptedBody},data:{encryptedBody:encrypt(JSON.stringify(message),config.MESSAGE_KEY),nextAttemptAt:new Date()}});
    if (!result.count) throw Error('A fila mudou entretanto. Não foi repetido o envio.');
    console.log(message.text);
    console.log('\nConvocatória com menções preparada para envio imediato.');
  });
} catch(e) { console.error(e.message); process.exitCode=1; }
finally { await db.$disconnect(); }
