import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
// Use Compose's own parser: dotenv interprets unquoted # differently.
// Keep the full configuration in memory; never print its secrets.
const env = JSON.parse(execFileSync('docker', [
  'compose', '--env-file', 'deploy/.env', '-f', 'deploy/compose.yaml',
  'config', '--format', 'json',
], { encoding: 'utf8' })).services.app.environment;
const origin = env.APP_ORIGIN;
assert.equal(
  origin,
  'http://localhost:3100',
  'Smoke test is restricted to the local installation.',
);
async function request(path, method = 'GET', body, cookie, withOrigin = true) {
  return fetch(`${origin}/api${path}`, {
    method,
    headers: {
      ...(withOrigin ? { Origin: origin } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
assert.equal((await request('/health')).status, 200);
assert.equal((await request('/admin/state')).status, 401);
assert.equal(
  (
    await request(
      '/login',
      'POST',
      { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
      null,
      false,
    )
  ).status,
  403,
);
const login = await request('/login', 'POST', {
  email: env.ADMIN_EMAIL,
  password: env.ADMIN_PASSWORD,
});
assert.equal(login.status, 200);
const header = login.headers.get('set-cookie');
assert(header.includes('HttpOnly'));
assert(header.includes('SameSite=Strict'));
const cookie = header.split(';')[0];
const state = await (await request('/admin/state', 'GET', null, cookie)).json();
const saved = await request('/admin/state', 'PUT', state, cookie);
assert.equal(saved.status, 200, await saved.clone().text());
const next = await saved.json();
assert.equal(next.revision, state.revision + 1);
assert.deepEqual(
  next.players.map((p) => p.id),
  state.players.map((p) => p.id),
);
assert.equal((await request('/admin/state', 'PUT', state, cookie)).status, 409);
const wa = await (await request('/admin/whatsapp', 'GET', null, cookie)).json();
assert.equal(wa.status, 'disconnected');
assert.equal(wa.qr, null);
assert.equal((await request('/register', 'POST', {}, cookie)).status, 503);
assert.equal((await request('/logout', 'POST', {}, cookie)).status, 200);
assert.equal((await request('/admin/state', 'GET', null, cookie)).status, 401);
console.log(
  'PASS: PostgreSQL health, admin login, HttpOnly cookie, CSRF protection, authorization, persistent revision, concurrent update rejection, WhatsApp disabled, logout. No WhatsApp messages sent.',
);
