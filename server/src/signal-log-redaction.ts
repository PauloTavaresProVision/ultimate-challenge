// libsignal writes session keys directly to console, bypassing the Baileys logger.
const sessionLabels = new Set(['Closing session:', 'Opening session:', 'Removing old closed session:', 'Session already closed']);
for (const level of ['info', 'warn'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && sessionLabels.has(args[0])) {
      original('Signal: sessão criptográfica atualizada.');
      return;
    }
    original(...args);
  };
}
