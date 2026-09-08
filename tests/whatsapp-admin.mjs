import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const env = JSON.parse(execFileSync('docker', ['compose', '--env-file', 'deploy/.env', '-f', 'deploy/compose.yaml', 'config', '--format', 'json'], { encoding: 'utf8' })).services.app.environment;
const origin = 'http://localhost:3100';
assert.equal(env.APP_ORIGIN, origin);
async function request(path, method = 'GET', body, cookie, csrf = true) {
  return fetch(`${origin}/api${path}`, { method, headers: { ...(csrf ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
// No valid send payload is used: this test never sends a WhatsApp message.
assert.equal((await request('/admin/whatsapp/test', 'POST', {})).status, 401);
const login = await request('/login', 'POST', { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0];
try {
  const response = await request('/admin/whatsapp', 'GET', undefined, cookie);
  assert.equal(response.status, 200);
  const state = await response.json();
  assert.ok(Object.hasOwn(state, 'account'));
  assert.ok(Object.hasOwn(state, 'groupName'));
  assert.ok(Object.hasOwn(state, 'connectedAt'));
  assert.equal((await request('/admin/whatsapp/test', 'POST', {}, cookie, false)).status, 403);
  assert.equal((await request('/admin/whatsapp/test', 'POST', { phone: 'invalid', message: 'test' }, cookie)).status, 400);
  assert.equal((await request('/admin/whatsapp/test', 'POST', { phone: '+244900000000', message: '' }, cookie)).status, 400);
  const html = await (await fetch(origin)).text();
  const asset = html.match(/src="([^"]+\.js)"/)[1];
  const js = await (await fetch(origin + asset)).text();
  assert.ok(js.includes('Testar envio'));
  assert.ok(js.includes('Pesquisar grupo por nome'));
  console.log('WhatsApp admin: account metadata, authentication, CSRF, input validation and deployed interface passed. No messages sent.');
} finally { await request('/logout', 'POST', undefined, cookie); }
