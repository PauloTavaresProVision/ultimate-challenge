export async function probeOpenAI(key:string, request:typeof fetch=fetch) {
 try {
  const response=await request('https://api.openai.com/v1/models',{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok) return {ok:false,message:response.status===401?'A chave não foi aceite. Confirma se está correta e ativa.':response.status===403?'A chave não tem permissão para consultar os modelos.':response.status===429?'A OpenAI limitou o pedido. Tenta novamente mais tarde.':'A OpenAI não está disponível neste momento.'};
  const data=await response.json() as {data?:unknown[]};
  if(!Array.isArray(data.data)) return {ok:false,message:'A OpenAI devolveu uma resposta inesperada.'};
  return {ok:true,message:'Ligação confirmada. A chave permite consultar os modelos da OpenAI.'};
 } catch { return {ok:false,message:'Não foi possível contactar a OpenAI. Verifica a ligação e tenta novamente.'}; }
}
