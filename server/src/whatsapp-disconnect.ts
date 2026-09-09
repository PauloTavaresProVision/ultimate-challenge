export function disconnectPolicy(code: number | undefined) {
  if (code === 401) return { invalidate: true, stop: true, message: 'O WhatsApp rejeitou a sessão (401). É necessária uma nova associação por QR.' };
  if (code === 500) return { invalidate: false, stop: true, message: 'A ligação terminou com erro de sessão (500). Os ficheiros foram preservados para diagnóstico; não foi iniciado um novo QR.' };
  if (code === 440) return { invalidate: false, stop: true, message: 'O WhatsApp informou que a ligação foi substituída. A sessão foi preservada; verifica os dispositivos associados antes de tentar novamente.' };
  if (code === 403) return { invalidate: false, stop: true, message: 'O WhatsApp recusou a ligação. A sessão foi preservada. Verifica o estado da conta no telemóvel.' };
  return { invalidate: false, stop: false, message: 'A ligação foi interrompida. A tentar reconectar com a sessão guardada.' };
}
