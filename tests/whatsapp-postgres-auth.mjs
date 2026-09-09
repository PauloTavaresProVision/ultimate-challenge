import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const docker=(args,input)=>{try{return execFileSync('docker',args,{encoding:'utf8',input,stdio:['pipe','pipe','pipe']});}catch(e){if(args.includes('--input-type=module'))console.error(String(e.stderr).replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[database omitted]'));throw Error('Isolated WhatsApp auth test failed; credentials omitted.');}};
const source=JSON.parse(docker(['compose','--env-file','deploy/.env','-f','deploy/compose.yaml','config','--format','json'])).services.app.environment;
const suffix=randomBytes(5).toString('hex'),database='escada_results_test_'+suffix,container='escada-invites-test-'+suffix;
let dbCreated=false,containerCreated=false;
try{
 docker(['exec','escada-database-1','createdb','-U','escada',database]);dbCreated=true;
 const url=new URL(source.DATABASE_URL);url.pathname='/'+database;
 const env={...source,DATABASE_URL:url.toString(),WA_AUTO_CONNECT:'false'};
 docker(['run','-d','--name',container,'--network','escada_default',...Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]),'--entrypoint','sleep','escada-app','300']);containerCreated=true;

 for(const file of ['whatsapp-postgres-auth.ts','security.ts'])docker(['cp','server/src/'+file,container+':/app/server/src/'+file]);
 docker(['cp','server/prisma/migrations/20260909230000_whatsapp_auth',container+':/app/server/prisma/migrations/20260909230000_whatsapp_auth']);
 docker(['exec',container,'npm','run','db:migrate']);
 const output=docker(['exec','-i',container,'node','--import','tsx','--input-type=module'],String.raw`
 import assert from 'node:assert/strict';
 import {Client} from 'pg';
 import {mkdtemp,writeFile,rm} from 'node:fs/promises';
 import {tmpdir} from 'node:os';import {join} from 'node:path';
 import {BufferJSON,initAuthCreds} from '@whiskeysockets/baileys';
 import {loadPostgresAuth} from './src/whatsapp-postgres-auth.ts';
 import {config} from './src/config.ts';
 const sql=new Client({connectionString:config.DATABASE_URL});await sql.connect();
 const folder=await mkdtemp(join(tmpdir(),'wa-pg-test-'));
 let failures=0,auth;
 const options={connectionString:config.DATABASE_URL,encryptionKey:config.MESSAGE_KEY,folder,onFailure:()=>failures++};
 try {
 const creds=initAuthCreds();creds.registrationId=12345;
 await writeFile(join(folder,'creds.json'),JSON.stringify(creds,BufferJSON.replacer));
 await writeFile(join(folder,'session-contact.json'),JSON.stringify(Buffer.from([1,2,3]),BufferJSON.replacer));
 auth=await loadPostgresAuth(options);
 assert.equal(auth.state.creds.registrationId,12345);
 assert.deepEqual((await auth.state.keys.get('session',['contact'])).contact,Buffer.from([1,2,3]));
 await assert.rejects(loadPostgresAuth(options),/outro processo/);
 const saves=[];for(let i=0;i<20;i++){auth.state.creds.registrationId=i;saves.push(auth.saveCreds());}
 await auth.close();await Promise.all(saves);await assert.rejects(auth.saveCreds());
 auth=await loadPostgresAuth(options);assert.equal(auth.state.creds.registrationId,19);
 const stored=await sql.query('SELECT value FROM "WhatsAppAuthKey"');assert(stored.rows.every(r=>!r.value.includes('registrationId')));
 await auth.state.keys.set({'session':{'contact':null}});
 assert.equal((await auth.state.keys.get('session',['contact'])).contact,null);
 console.log('PASS: existing session imported, encrypted, exclusive owner, queued writes drained, restart restored binary keys.');
 // Database refuses the second key: the first key in the batch must roll back too.
 await sql.query('ALTER TABLE "WhatsAppAuthKey" ADD CONSTRAINT reject_test CHECK (name <> \'session-reject.json\')');
 await assert.rejects(auth.state.keys.set({'session':{'first':Buffer.from([4]),'reject':Buffer.from([5])}}));
 assert.equal((await sql.query('SELECT name FROM "WhatsAppAuthKey" WHERE name=\'session-first.json\'')).rowCount,0);
 assert.equal(failures,1);await assert.rejects(auth.saveCreds());await auth.close().catch(()=>{});
 await sql.query('ALTER TABLE "WhatsAppAuthKey" DROP CONSTRAINT reject_test');
 auth=await loadPostgresAuth(options);await auth.revoke();await auth.close();
 auth=await loadPostgresAuth(options);assert.notEqual(auth.state.creds.registrationId,12345);
 assert.equal((await sql.query('SELECT id FROM "WhatsAppAuthSession" WHERE status=\'revoked\'')).rowCount,1);
 assert.equal((await auth.state.keys.get('session',['contact'])).contact,null);
 console.log('PASS: atomic batch rollback stops further writes; revoked credentials archived and never reimported.');
 // Terminate the pinned lock connection; losing ownership must notify the socket.
 const pid=await sql.query('SELECT pid FROM pg_locks WHERE locktype=\'advisory\' AND classid=186937789 AND objid=1');
 await sql.query('SELECT pg_terminate_backend($1)',[pid.rows[0].pid]);
 await new Promise(resolve=>setTimeout(resolve,150));assert.equal(failures,2);
 await assert.rejects(auth.saveCreds());await auth.close().catch(()=>{});
 auth=await loadPostgresAuth(options);await auth.close();
 console.log('PASS: database connection loss invalidates store and releases ownership for safe recovery. No WhatsApp connections or messages.');
 auth=await loadPostgresAuth(options);
 await sql.query('ALTER TABLE "WhatsAppAuthKey" ADD CONSTRAINT reject_close CHECK (name <> \'session-close.json\')');
 const write=auth.state.keys.set({'session':{'close':Buffer.from([9])}});
 await Promise.all([assert.rejects(write),assert.rejects(auth.close())]);
 await sql.query('ALTER TABLE "WhatsAppAuthKey" DROP CONSTRAINT reject_close');
 // A fresh installation with rejected filesystem credentials must not import them.
 await sql.query('TRUNCATE "WhatsAppAuthKey", "WhatsAppAuthSession"');
 await writeFile(join(folder,'.requires-qr'),'rejected');
 auth=await loadPostgresAuth(options);
 assert.equal((await auth.state.keys.get('session',['contact'])).contact,null);
 await auth.close();
 console.log('PASS: shutdown reports failed writes; rejected legacy files are never imported.');

 }finally{await auth?.close().catch(()=>{});await sql.end();await rm(folder,{recursive:true,force:true});}
 `);console.log(output.trim());
}finally{if(containerCreated)docker(['rm','-f',container]);if(dbCreated)docker(['exec','escada-database-1','dropdb','-U','escada',database]);}
