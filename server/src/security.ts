import {
  randomBytes,
  createHash,
  createHmac,
  scryptSync,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
export const randomToken = () => randomBytes(32).toString('base64url');
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export const codeDigest = (playerId: string, code: string, secret: string) =>
  createHmac('sha256', secret).update(`${playerId}:${code}`).digest('hex');
export function encrypt(text: string, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${data.toString('hex')}`;
}
export function decrypt(text: string, key: string) {
  const [iv, tag, data] = text.split('.');
  const cipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'hex'),
    Buffer.from(iv, 'hex'),
  );
  cipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([
    cipher.update(Buffer.from(data, 'hex')),
    cipher.final(),
  ]).toString('utf8');
}
export function phoneFromJid(jid: string | null | undefined) {
  if (!jid || !jid.endsWith('@s.whatsapp.net')) return null;
  const digits = jid.split('@')[0].split(':')[0];
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}
