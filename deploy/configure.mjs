import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const target = fileURLToPath(new URL('.env', import.meta.url));
if (existsSync(target)) {
  console.log('A configuração já existe. Nenhum segredo foi alterado.');
  process.exit(0);
}
const email = process.argv[2] ?? 'admin@escada.local';
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error('Email inválido.');
writeFileSync(
  target,
  `APP_ORIGIN=http://localhost:3100\nAPP_BIND=127.0.0.1\nDB_PASSWORD=${randomBytes(24).toString('hex')}\nSESSION_SECRET=${randomBytes(32).toString('hex')}\nMESSAGE_KEY=${randomBytes(32).toString('hex')}\nADMIN_EMAIL=${email}\nADMIN_PASSWORD=${randomBytes(24).toString('base64url')}\nWA_AUTO_CONNECT=false\n`,
  { mode: 0o600, flag: 'wx' },
);
console.log(
  'Configuração criada em deploy/.env. Consulta ADMIN_EMAIL e ADMIN_PASSWORD nesse ficheiro para iniciar sessão. Não partilhes nem publiques esse ficheiro.',
);
