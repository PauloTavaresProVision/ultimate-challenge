import {execFileSync} from 'node:child_process';
// Real library, production image permissions, no network or WhatsApp account.
const script=String.raw`
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const LocalWebCache=require('whatsapp-web.js/src/webCache/LocalWebCache.js');
const oldCache=new LocalWebCache();
await assert.rejects(oldCache.persist('test','permission-test'),{code:'EACCES'});
const cache=new LocalWebCache({path:'/app/server/.web-session/web-cache'});
await cache.persist('test','permission-test');
assert.equal(await cache.resolve('permission-test'),'test');
console.log('PASS: default cache fails with EACCES; persistent writable cache saves and resolves successfully as node.');
`;
try{
 console.log(execFileSync('docker',['run','--rm','-i','--network','none','--entrypoint','node','ultimate-webjs-test','--input-type=module'],{input:script,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim());
}catch(e){console.error(String(e.stderr||e.message));process.exitCode=1;}
