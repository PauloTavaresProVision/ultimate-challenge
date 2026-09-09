import 'dotenv/config';
import { z } from 'zod';
export const config = z
  .object({
    DATABASE_URL: z.string().startsWith('postgresql://'),
    APP_ORIGIN: z.url(),
    PORT: z.coerce.number().int().default(3100),
    HOST: z.string().default('127.0.0.1'),
    SESSION_SECRET: z.string().min(32),
    MESSAGE_KEY: z.string().regex(/^[a-f0-9]{64}$/),
    ADMIN_EMAIL: z.email(),
    ADMIN_PASSWORD: z.string().min(8),
    WHATSAPP_GROUP_INVITE: z.string().default(''),
    WA_WEB_AUTH_DIR: z.string().default('.web-session'),
    WA_WEB_EXECUTABLE: z.string().default(''),
    WA_AUTH_DIR: z.string().default('.session'),
    WA_AUTO_CONNECT: z.enum(['true', 'false']).default('false'),
  })
  .parse(process.env);
