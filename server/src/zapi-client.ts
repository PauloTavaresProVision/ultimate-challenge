export type ZCredentials={instanceId:string;token:string;clientToken:string};
export const zPhone=(jid:string)=>jid.replace(/@g\.us$/,'-group').replace(/@s\.whatsapp\.net$/,'');
export const zJid=(phone:string)=>phone.endsWith('-group')?phone.replace(/-group$/,'@g.us'):phone.includes('@')?phone:phone+'@s.whatsapp.net';
export const zMessageId=(instance:string,id:string)=>`zapi:${instance}:${id}`;
export function zReceipt(payload:{type?:string;status?:string;error?:unknown}){
  if(payload.type==='DeliveryCallback')return payload.error?0:2;
  if(payload.type!=='MessageStatusCallback')return null;
  return ({SENT:2,RECEIVED:3,READ:4,PLAYED:5} as Record<string,number>)[payload.status??'']??null;
}
export class ZApiClient{
  constructor(private credentials:ZCredentials,private request:typeof fetch=fetch){}
  async call<T=any>(path:string,method='GET',body?:unknown):Promise<T>{
    const {instanceId,token,clientToken}=this.credentials;
    try{
      const response=await this.request(`https://api.z-api.io/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(token)}/${path}`,{
        method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Client-Token':clientToken,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)
      });
      if(!response.ok)throw new Error(`Z-API HTTP ${response.status}`);
      return await response.json() as T;
    }catch(e){
      // Request URLs contain the instance token. Never expose fetch errors/URLs.
      const code=e instanceof Error?/^Z-API HTTP (\d{3})$/.exec(e.message)?.[1]:null;
      throw new Error(code?`Z-API respondeu HTTP ${code}. Verifica as credenciais e a instância.`:'Z-API não respondeu com dados válidos dentro do prazo.');
    }
  }
}
