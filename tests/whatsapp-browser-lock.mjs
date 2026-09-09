import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const docker=(args,input)=>execFileSync('docker',args,{encoding:'utf8',input,stdio:['pipe','pipe','pipe']});
const suffix=randomBytes(5).toString('hex'),volume='wa-lock-test-'+suffix;
const first=volume+'-a',second=volume+'-b';
const launch=String.raw`
import puppeteer from 'puppeteer';
import {createServer} from 'node:http';
const server=createServer((q,r)=>r.end('test'));
await new Promise(r=>server.listen(3009,'127.0.0.1',r));
const options={executablePath:'/usr/bin/chromium',headless:true,userDataDir:'/app/server/.web-session/profile',args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']};
`;
try{
 docker(['volume','create',volume]);
 for(const name of [first,second]){
  docker(['run','-d','--name',name,'--init','--network','none','-v',volume+':/app/server/.web-session','--entrypoint','sleep','ultimate-webjs-test','300']);
  if(name===first){
   docker(['exec','-i',name,'node','--input-type=module'],launch+String.raw`
const browser=await puppeteer.launch(options);const page=await browser.newPage();await page.goto('http://127.0.0.1:3009');
await page.evaluate(()=>localStorage.setItem('preserved','yes'));
await browser.close();
const interrupted=await puppeteer.launch(options);
// Kill Chromium without cleanup, reproducing an interrupted container update.
interrupted.process().kill('SIGKILL');await new Promise(r=>setTimeout(r,1000));server.close();process.exit(0);
`);
   docker(['rm','-f',first]);
  }
 }
 docker(['cp','server/src/whatsapp-browser-lock.ts',second+':/app/server/src/whatsapp-browser-lock.ts']);
 const result=docker(['exec','-i',second,'node','--import','tsx','--input-type=module'],launch+String.raw`
import assert from 'node:assert/strict';import {recoverBrowserLock} from './src/whatsapp-browser-lock.ts';
import {mkdtemp,symlink,writeFile,readFile,readlink} from 'node:fs/promises';import {hostname} from 'node:os';
let rejected=false;try{const b=await puppeteer.launch(options);await b.close();}catch(e){rejected=/profile|Singleton|another/i.test(e.message);}
assert(rejected,'Chromium should reject previous-container lock before recovery');
assert.equal(await recoverBrowserLock(options.userDataDir),true);
const browser=await puppeteer.launch(options);const page=await browser.newPage();await page.goto('http://127.0.0.1:3009');
assert.equal(await page.evaluate(()=>localStorage.getItem('preserved')),'yes');await browser.close();server.close();
const live=await mkdtemp('/tmp/live-');await symlink(hostname()+'-'+process.pid,live+'/SingletonLock');
assert.equal(await recoverBrowserLock(live),false);assert(await readlink(live+'/SingletonLock'));
const regular=await mkdtemp('/tmp/regular-');await writeFile(regular+'/SingletonLock','keep');
assert.equal(await recoverBrowserLock(regular),false);assert.equal(await readFile(regular+'/SingletonLock','utf8'),'keep');
console.log('PASS: reproduced stale lock across containers; Chromium recovered with local storage preserved; active locks and regular files untouched.');
`);console.log(result.trim());
}catch(e){console.error(String(e.stderr||e.message));process.exitCode=1;}
finally{for(const name of [first,second])try{docker(['rm','-f',name]);}catch{}try{docker(['volume','rm',volume]);}catch{}}
