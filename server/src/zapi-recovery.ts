// Retry transport/provider outages, never credential or pairing errors.
export function retryZApi(error?:string) {
 if (!error) return true;
 return error === 'A Z-API perdeu a ligação. Verifica a instância antes de voltar a ligar.' ||
 error === 'Z-API não respondeu com dados válidos dentro do prazo.' ||
 /^Z-API respondeu HTTP (408|429|5\d\d)\./.test(error);
}
export const zApiRetryDelay=(failures:number)=>Math.min(60000,2000*2**Math.min(failures,8));
