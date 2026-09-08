import { db } from './db.ts';
import { config } from './config.ts';
import { checkPassword, hashPassword } from './security.ts';

// Keep the environment-managed account's identity stable when its email changes.
export async function syncEnvironmentAdmin() {
  await db.$transaction(async (tx) => {
    const email = config.ADMIN_EMAIL.trim().toLowerCase();
    const binding = await tx.setting.findUnique({ where: { key: 'environment_admin_id' } });
    let user = binding ? await tx.admin.findUnique({ where: { id: binding.value } }) : null;
    if (binding && !user) throw new Error('A conta administrativa configurada não existe.');
    if (!binding) {
      const users = await tx.admin.findMany();
      if (users.length === 1) user = users[0];
      else if (users.length > 1) {
        user = users.find((item) => item.email === email) ?? null;
        if (!user) throw new Error('Existem várias contas. Identifica a conta administrativa antes de alterar o email.');
      }
    }
    if (!user) {
      user = await tx.admin.create({ data: { email, passwordHash: hashPassword(config.ADMIN_PASSWORD) } });
    } else if (user.email !== email || !checkPassword(config.ADMIN_PASSWORD, user.passwordHash)) {
      await tx.admin.update({ where: { id: user.id }, data: { email, passwordHash: hashPassword(config.ADMIN_PASSWORD) } });
      await tx.session.deleteMany({ where: { adminId: user.id } });
      await tx.rateLimit.deleteMany({ where: { key: { startsWith: 'admin:' } } });
      await tx.audit.create({ data: { actor: user.id, action: 'Credenciais do administrador atualizadas pela configuração local.' } });
    }
    await tx.setting.upsert({ where: { key: 'environment_admin_id' }, create: { key: 'environment_admin_id', value: user.id }, update: { value: user.id } });
  });
}
