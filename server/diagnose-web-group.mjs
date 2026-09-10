// Run on stdin from /app/server. Connect to the existing browser, never launch a session.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer';
import {db} from './src/db.ts';
import {config} from './src/config.ts';
let browser;
try {
 const group=await db.setting.findUnique({where:{key:'whatsapp_group'}});
 if(!group?.value)throw Error('Grupo não configurado.');
 const active=await readFile(resolve(config.WA_WEB_AUTH_DIR,'session-ultimate','DevToolsActivePort'),'utf8');
 const [port,path]=active.trim().split(/\r?\n/);
 if(!/^\d+$/.test(port)||!path?.startsWith('/devtools/browser/'))throw Error('Endpoint Chromium inválido.');
 browser=await puppeteer.connect({browserWSEndpoint:'ws://127.0.0.1:'+port+path});
 const page=(await browser.pages()).find(p=>p.url().startsWith('https://web.whatsapp.com/'));
 if(!page)throw Error('Página WhatsApp não encontrada no navegador ligado.');
 const result=await page.evaluate(async id=>{
  const report={};
  const inspect=async(name,fn)=>{try{report[name]=await fn();}catch(e){report[name]={errorName:String(e?.name??typeof e),message:String(e?.message??e).replace(/\d{7,}/g,'[id]').slice(0,500),stack:String(e?.stack??'').replace(/\d{7,}/g,'[id]').slice(0,1200)};}};
  let chat;
  await inspect('grupoLocal',async()=>{const wid=window.require('WAWebWidFactory').createWid(id);chat=window.require('WAWebCollections').Chat.get(wid);return {encontrado:!!chat,administrador:chat?chat.iAmAdmin():null,membros:chat?.groupMetadata?.participants?.length??null};});
  await inspect('carregarGrupoBiblioteca',async()=>{await window.WWebJS.getChat(id);return 'ok';});
  if(chat?.groupMetadata)await inspect('resolverIdentificadores',async()=>{
   const members=chat.groupMetadata.participants.serialize();let resolved=0;
   for(const member of members){const id=member.id?._serialized;if(id?.endsWith('@lid')){await window.WWebJS.enforceLidAndPnRetrieval(id);resolved++;}}
   return {consultados:resolved};
  });
  return report;
 },group.value);
 console.log(JSON.stringify(result,null,2));
}catch(e){console.error('Diagnóstico indisponível:',e.code==='ENOENT'?'Chromium não publicou DevToolsActivePort no perfil.':e.message);process.exitCode=1;}
finally{browser?.disconnect();await db.$disconnect();}
