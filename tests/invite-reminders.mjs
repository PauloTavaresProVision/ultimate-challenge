import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const docker = (args, input) => {
  try {
    return execFileSync('docker', args, {
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    if (args.includes('--input-type=module'))
      console.error(
        String(e.stderr).replace(
          /postgres(?:ql)?:\/\/[^\s]+/g,
          '[database omitted]',
        ),
      );
    throw Error('Isolated approval test failed.');
  }
};
const source = JSON.parse(
  docker([
    'compose',
    '--env-file',
    'deploy/.env',
    '-f',
    'deploy/compose.yaml',
    'config',
    '--format',
    'json',
  ]),
).services.app.environment;
const suffix = randomBytes(5).toString('hex'),
  database = 'escada_results_test_' + suffix,
  container = 'escada-approval-test-' + suffix;
let dbCreated = false,
  containerCreated = false;
try {
  docker(['exec', 'escada-database-1', 'createdb', '-U', 'escada', database]);
  dbCreated = true;
  const url = new URL(source.DATABASE_URL);
  url.pathname = '/' + database;
  const env = {
    ...source,
    DATABASE_URL: url.toString(),
    WA_AUTO_CONNECT: 'false',
  };
  docker([
    'run',
    '-d',
    '--name',
    container,
    '--network',
    'escada_default',
    ...Object.entries(env).flatMap(([k, v]) => ['-e', k + '=' + v]),
    '--entrypoint',
    'sleep',
    'ultimate-webjs-test',
    '300',
  ]);
  containerCreated = true;
  for (const name of [
    'invite-sending.ts',
    'invite-reminders.ts',
    'delivery-status.ts',
    'delivery-queue.ts',
    'whatsapp-pause.ts',
  ])
    docker([
      'cp',
      'server/src/' + name,
      container + ':/app/server/src/' + name,
    ]);
  docker(['exec', container, 'npm', 'run', 'db:migrate']);
  console.log(
    docker(
      [
        'exec',
        '-i',
        container,
        'node',
        '--import',
        'tsx',
        '--input-type=module',
      ],
      String.raw`
 import assert from 'node:assert/strict';import express from 'express';import {randomUUID} from 'node:crypto';
 import {db} from './src/db.ts';import {installInviteSending} from './src/invite-sending.ts';
 import {reminderCandidates,reminderStillEligible} from './src/invite-reminders.ts';import {claimDelivery,finishInvitation} from './src/delivery-queue.ts';
 const app=express();app.use(express.json());const auth=(_req,res,next)=>{res.locals.session={adminId:'test'};next();};
 installInviteSending(app,auth,auth,()=>true);app.use((err,_req,res,_next)=>res.status(err.status??500).json({error:err.message}));
 const server=app.listen(0);await new Promise(r=>server.once('listening',r));
 try{
 const now=new Date();const expiresAt=new Date(now.getTime()+86400000);const phone=i=>'+24490000000'+i;
 for(let i=1;i<=6;i++)await db.outbox.create({data:{recipient:phone(i).slice(1)+'@s.whatsapp.net',kind:'invitation',status:i===3?'cancelled':i===4?'accepted':i===2?'read':'delivered',encryptedBody:'',expiresAt}});
 await db.player.create({data:{name:'Already registered',phone:phone(5),birth:new Date('1990-01-01'),side:'Direita',division:'M1',status:'Pendente',verified:false}});
 await db.outbox.create({data:{recipient:phone(6).slice(1)+'@s.whatsapp.net',kind:'invitation',status:'cancelled',encryptedBody:'',expiresAt,createdAt:new Date(now.getTime()+1000)}});
 const candidates=await reminderCandidates();assert.deepEqual(candidates.map(r=>r.phone).sort(),[phone(1),phone(2)]);
 const body={batchId:randomUUID(),invitationIds:candidates.map(r=>r.id),message:'Lembrete personalizado'};
 const post=async()=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/admin/invite-reminders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
 assert.equal((await post()).queued,2);assert.equal((await post()).queued,2);assert.equal(await db.outbox.count({where:{kind:'invitation_reminder'}}),2);assert.equal((await reminderCandidates()).length,0);
 const claimTime=new Date(Date.now()+2000);const first=await claimDelivery(claimTime);assert.equal(first.kind,'invitation_reminder');assert.equal(await claimDelivery(new Date(claimTime.getTime()+1000)),null);
 await db.outbox.update({where:{id:first.id},data:{status:'sent'}});await finishInvitation(claimTime);assert.equal(await claimDelivery(new Date(claimTime.getTime()+29999)),null);assert.equal((await claimDelivery(new Date(claimTime.getTime()+30000))).kind,'invitation_reminder');
 assert.equal(await reminderStillEligible(phone(1).slice(1)+'@s.whatsapp.net'),true);
 await db.player.create({data:{name:'Registered during queue',phone:phone(1),birth:new Date('1990-01-01'),side:'Direita',division:'M1',status:'Pendente',verified:false}});
 assert.equal(await reminderStillEligible(phone(1).slice(1)+'@s.whatsapp.net'),false);assert.equal(await reminderStillEligible(phone(6).slice(1)+'@s.whatsapp.net'),false);
 console.log('PASS: delivered/read only, cancelled/registered excluded, idempotent queue, 30-second spacing and eligibility rechecked. No messages sent.');
 }finally{await new Promise(r=>server.close(r));await db.$disconnect();}
 `,
    ).trim(),
  );
} finally {
  if (containerCreated) docker(['rm', '-f', container]);
  if (dbCreated)
    docker(['exec', 'escada-database-1', 'dropdb', '-U', 'escada', database]);
}
