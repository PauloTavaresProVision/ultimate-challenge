import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retryZApi,zApiRetryDelay} from '../src/zapi-recovery.ts';
test('Provider disconnects and temporary outages retry; credentials and pairing do not',()=>{
 for(const error of [undefined,'A Z-API perdeu a ligação. Verifica a instância antes de voltar a ligar.','Z-API não respondeu com dados válidos dentro do prazo.',...['408','429','500','503'].map(code=>`Z-API respondeu HTTP ${code}. Verifica as credenciais e a instância.`)])assert.equal(retryZApi(error),true,error);
 for(const error of ['Z-API respondeu HTTP 401. Verifica as credenciais e a instância.','Z-API respondeu HTTP 403. Verifica as credenciais e a instância.','Configura as credenciais da Z-API.','Outra ligação WhatsApp está ativa.','Z-API: conclui a chave de acesso no painel Z-API e volta a ligar aqui.'])assert.equal(retryZApi(error),false,error);
});
test('Recovery backs off and remains bounded at a minute',()=>{
 assert.deepEqual([1,2,3,4,5,8,20].map(zApiRetryDelay),[4000,8000,16000,32000,60000,60000,60000]);
});
