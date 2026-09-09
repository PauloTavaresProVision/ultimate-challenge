// Classify locally; never return Chromium's raw error (may contain profile paths,
// page content, cookies or command-line arguments).
export function webStartupError(error:unknown){
  const message=error instanceof Error?error.message:String(error);
  if(/Singleton|profile.*(in use|another)|ProcessSingleton|already running/i.test(message))
    return 'O perfil do Chromium está bloqueado por outro processo ou por um encerramento anterior.';
  if(/EACCES|permission denied/i.test(message))return 'O Chromium não tem permissão para abrir ou guardar o perfil.';
  if(/executable.*(exist|found)|Could not find Chrome|ENOENT/i.test(message))return 'O executável do Chromium não foi encontrado no container.';
  if(/auth timeout|ready timeout|TimeoutError|timed out|timeout/i.test(message))return 'O WhatsApp Web não concluiu o carregamento dentro do tempo limite.';
  if(/net::ERR_|ENOTFOUND|ECONN|certificate/i.test(message))return 'O navegador não conseguiu carregar o WhatsApp Web: verifica rede, DNS e certificados.';
  if(/Failed to launch|Target closed|browser.*closed|Session closed/i.test(message))return 'O Chromium falhou ao arrancar ou encerrou durante a inicialização.';
  return 'Falha ao inicializar o WhatsApp Web. O perfil foi preservado; é necessário verificar o navegador.';
}
