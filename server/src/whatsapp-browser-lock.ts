import {readlink,lstat,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {hostname} from 'node:os';

// Call ONLY while holding the shared PostgreSQL WhatsApp ownership lock.
// A Docker replacement changes hostname and /tmp but retains the profile volume.
export async function recoverBrowserLock(profile:string,currentHost=hostname()){
  let target:string;
  try{target=await readlink(join(profile,'SingletonLock'));}
  catch(e){if(['ENOENT','EINVAL'].includes((e as NodeJS.ErrnoException).code??''))return false;throw e;}
  const match=/^(.+)-(\d+)$/.exec(target);
  if(!match)return false;
  const [,owner,pidText]=match;
  if(owner===currentHost){
    try{process.kill(Number(pidText),0);return false;}
    catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')return false;}
  }else{
    // Only recover the known Docker hostname pattern, not arbitrary shared hosts.
    if(!/^[a-f0-9]{12}$/.test(owner)||!/^[a-f0-9]{12}$/.test(currentHost))return false;
    try{
      const socket=await readlink(join(profile,'SingletonSocket'));
      try{await lstat(socket);return false;}
      catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
  for(const name of ['SingletonSocket','SingletonCookie','SingletonLock']){
    const path=join(profile,name);
    try{if((await lstat(path)).isSymbolicLink())await unlink(path);}
    catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
  console.info('WhatsApp Web: bloqueios obsoletos do Chromium removidos; perfil preservado.');
  return true;
}
