import {BufferJSON, initAuthCreds, proto, type AuthenticationState} from '@whiskeysockets/baileys';
import {Client} from 'pg';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {encrypt, decrypt} from './security.ts';

// One pinned PostgreSQL connection owns both the advisory lock and all writes.
// Losing that connection makes this store unusable and immediately stops its socket.
export async function loadPostgresAuth(options: {
  connectionString:string; encryptionKey:string; folder:string; onFailure:()=>void;
}) {
  const client=new Client({connectionString:options.connectionString, connectionTimeoutMillis:10000,
    query_timeout:15000, keepAlive:true, keepAliveInitialDelayMillis:5000});
  let stopped=false, failed=false, closing:Promise<void>|undefined;
  let tail:Promise<unknown>=Promise.resolve();
  const fail=()=>{if(!stopped&&!failed){failed=true;options.onFailure();}};
  client.on('error',fail);
  client.on('end',fail);
  const encode=(value:unknown)=>encrypt(JSON.stringify(value,BufferJSON.replacer),options.encryptionKey);
  const decode=(value:string)=>JSON.parse(decrypt(value,options.encryptionKey),BufferJSON.reviver);
  const key=(name:string)=>name.replace(/\//g,'__').replace(/:/g,'-');
  async function transaction<T>(work:()=>Promise<T>) {
    await client.query('BEGIN');
    try {const result=await work();await client.query('COMMIT');return result;}
    catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  }
  function serial<T>(work:()=>Promise<T>):Promise<T> {
    if(stopped||failed)return Promise.reject(new Error('Sessão encerrada; gravação recusada.'));
    const result=tail.then(()=>{if(failed)throw new Error('Persistência indisponível.');return work();});
    tail=result.catch(()=>{
      const notify=!failed&&!stopped;
      failed=true;
      if(notify)options.onFailure();
    });
    return result;
  }
  const put=async(name:string,value:string)=>{
    await client.query('INSERT INTO "WhatsAppAuthKey" ("sessionId",name,value) VALUES ($1,$2,$3) ON CONFLICT ("sessionId",name) DO UPDATE SET value=EXCLUDED.value',['primary',name,value]);
  };
  try {
    await client.connect();
    const lock=await client.query('SELECT pg_try_advisory_lock(186937789, 1) AS owned');
    if(!lock.rows[0].owned)throw new Error('Já existe outro processo a utilizar a sessão WhatsApp.');
    const existing=await client.query('SELECT status FROM "WhatsAppAuthSession" WHERE id=$1',['primary']);
    if(!existing.rowCount) {
      // Import only active root files, never archived/rejected credentials.
      const names=await readdir(options.folder).catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return [] as string[];throw e;});
      const values: Array<[string,string]>=[];
      if(!names.includes('.requires-qr')) {
        if(names.some(n=>n.endsWith('.json'))&&!names.includes('creds.json'))throw new Error('Sessão incompleta; ficheiros preservados.');
        for(const name of names.filter(n=>n.endsWith('.json'))) {
          const parsed=JSON.parse(await readFile(join(options.folder,name),'utf8'),BufferJSON.reviver);
          values.push([name,encode(parsed)]);
        }
      }
      if(!values.some(([name])=>name==='creds.json'))values.push(['creds.json',encode(initAuthCreds())]);
      await transaction(async()=>{
        await client.query('INSERT INTO "WhatsAppAuthSession" (id,status) VALUES ($1,$2)',['primary','active']);
        for(const [name,value] of values)await put(name,value);
      });
      console.info('WhatsApp: persistência PostgreSQL preparada; ficheiros originais preservados.');
    } else if(existing.rows[0].status==='revoked') {
      // Keep revoked keys for diagnosis; they must never become active again.
      await transaction(async()=>{
        await client.query('UPDATE "WhatsAppAuthSession" SET id=$1 WHERE id=$2',['archived-'+randomUUID(),'primary']);
        await client.query('INSERT INTO "WhatsAppAuthSession" (id,status) VALUES ($1,$2)',['primary','active']);
        await put('creds.json',encode(initAuthCreds()));
      });
    }
    const saved=await client.query('SELECT value FROM "WhatsAppAuthKey" WHERE "sessionId"=$1 AND name=$2',['primary','creds.json']);
    if(!saved.rowCount)throw new Error('Credenciais ausentes; sessão preservada.');
    const creds=decode(saved.rows[0].value);
    const state:AuthenticationState={creds,keys:{
      get:(type,ids)=>serial(async()=>{
        const names=ids.map(id=>key(`${type}-${id}.json`));
        const rows=await client.query('SELECT name,value FROM "WhatsAppAuthKey" WHERE "sessionId"=$1 AND name=ANY($2::text[])',['primary',names]);
        const values=new Map(rows.rows.map(row=>[row.name,row.value]));
        return Object.fromEntries(ids.map((id,i)=>{
          let value=values.has(names[i])?decode(values.get(names[i])):null;
          if(type==='app-state-sync-key'&&value)value=proto.Message.AppStateSyncKeyData.fromObject(value);
          return [id,value];
        }));
      }),
      set:data=>{
        const entries=Object.entries(data).flatMap(([type,values])=>Object.entries(values??{}).map(([id,value])=>({name:key(`${type}-${id}.json`),value:value==null?null:encode(value)})));
        return serial(()=>transaction(async()=>{
          for(const entry of entries) {
            if(entry.value!==null)await put(entry.name,entry.value);
            else await client.query('DELETE FROM "WhatsAppAuthKey" WHERE "sessionId"=$1 AND name=$2',['primary',entry.name]);
          }
        }));
      }
    }};
    return {state,
      saveCreds:()=>{const snapshot=encode(creds);return serial(()=>put('creds.json',snapshot));},
      revoke:()=>serial(async()=>{await client.query('UPDATE "WhatsAppAuthSession" SET status=$1 WHERE id=$2',['revoked','primary']);}),
      close:()=>{
        if(!closing){stopped=true;closing=(async()=>{await tail;await client.end();if(failed)throw new Error('Persistência da sessão interrompida.');})();}
        return closing;
      }
    };
  } catch(error) {stopped=true;await client.end().catch(()=>{});throw error;}
}
