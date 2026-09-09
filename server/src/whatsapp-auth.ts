import {BufferJSON,initAuthCreds,proto,type AuthenticationState} from '@whiskeysockets/baileys';
import {mkdir,readFile,open,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

// Compatible with the existing Baileys files: no migration or credential reset.
export async function loadWhatsAppAuth(folder:string){
 await mkdir(folder,{recursive:true,mode:0o700});
 let tail:Promise<unknown>=Promise.resolve();
 let stopped=false;
 let failure:unknown;
 const path=(name:string)=>join(folder,name.replace(/\//g,'__').replace(/:/g,'-'));
 function serial<T>(task:()=>Promise<T>):Promise<T>{
  if(stopped)return Promise.reject(new Error('Sessão antiga encerrada.'));
  const result=tail.then(task);tail=result.catch(error=>{failure=error;});return result;
 }
 async function read(name:string){
  try{return JSON.parse(await readFile(path(name),'utf8'),BufferJSON.reviver);}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw new Error('Não foi possível ler a sessão guardada. Os ficheiros foram preservados.');}
 }
 async function write(name:string,value:string){
  const target=path(name),temporary=target+'.'+randomUUID()+'.tmp';
  try{
   const file=await open(temporary,'wx',0o600);
   try{await file.writeFile(value);await file.sync();}finally{await file.close();}
   await rename(temporary,target);
  }finally{await unlink(temporary).catch(()=>{});}
 }
 const creds=await read('creds.json')??initAuthCreds();
 const state:AuthenticationState={creds,keys:{
  get:async(type,ids)=>serial(async()=>{
   const result:Record<string,any>={};
   for(const id of ids){let value=await read(`${type}-${id}.json`);if(type==='app-state-sync-key'&&value)value=proto.Message.AppStateSyncKeyData.fromObject(value);result[id]=value;}
   return result;
  }),
  set:async data=>{
   // Snapshot before awaiting: later mutations must not change an earlier write.
   const entries=Object.entries(data).flatMap(([type,values])=>Object.entries(values??{}).map(([id,value])=>({name:`${type}-${id}.json`,value:value?JSON.stringify(value,BufferJSON.replacer):null})));
   await serial(async()=>{for(const entry of entries){if(entry.value!==null)await write(entry.name,entry.value);else await unlink(path(entry.name)).catch(error=>{if(error.code!=='ENOENT')throw error;});}});
  }
 }};
 return {state,saveCreds:()=>{const snapshot=JSON.stringify(creds,BufferJSON.replacer);return serial(()=>write('creds.json',snapshot));},
  close:async()=>{stopped=true;await tail;if(failure)throw new Error('Falha ao guardar a sessão. Os ficheiros foram preservados.');}};
}
