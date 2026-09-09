import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadWhatsAppAuth} from '../src/whatsapp-auth.ts';

test('session writes drain on close and survive reopen with binary keys',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wa-auth-test-'));
 try{
  const auth=await loadWhatsAppAuth(dir);
  const saves=[];
  for(let i=0;i<20;i++){Object.assign(auth.state.creds,{registrationId:i});saves.push(auth.saveCreds());}
  saves.push(auth.state.keys.set({'session':{'contact':Buffer.from([1,2,3])}}));
  await auth.close();await Promise.all(saves);
  await assert.rejects(auth.saveCreds(),/encerrada/);
  const restored=await loadWhatsAppAuth(dir);
  assert.equal(restored.state.creds.registrationId,19);
  assert.deepEqual((await restored.state.keys.get('session',['contact'])).contact,Buffer.from([1,2,3]));
  await restored.state.keys.set({'session':{'contact':null}});
  assert.equal((await restored.state.keys.get('session',['contact'])).contact,null);
  await restored.close();
  assert.deepEqual(await readdir(dir),['creds.json']);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('corrupt credentials are preserved instead of silently creating a new identity',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wa-auth-test-'));
 try{
  await writeFile(join(dir,'creds.json'),'{broken');
  await assert.rejects(loadWhatsAppAuth(dir),/preservados/);
  assert.equal(await readFile(join(dir,'creds.json'),'utf8'),'{broken');
 }finally{await rm(dir,{recursive:true,force:true});}
});
