# Z-API — integração Ultimate Challenge

Preparada em 10/09/2026. Terceiro adaptador, ao lado de Baileys e whatsapp-web.js.
Não foi validada com uma conta Z-API real. Os testes usam respostas controladas e PostgreSQL isolado.

## Configuração

1. Criar uma instância dedicada ao torneio no painel Z-API.
2. No backoffice, WhatsApp → Método de ligação → Z-API.
3. Introduzir ID da instância, token da instância e Client-Token (Segurança da conta).
4. Guardar e usar **Testar acesso**. Esse botão só consulta o estado; não envia mensagens.
5. Manter envios automáticos pausados durante testes com outro número.
6. Carregar em Ligar por QR. A aplicação configura os webhooks da instância para o domínio público HTTPS.
7. Se for solicitada uma chave de acesso, concluir a associação no painel/extensão da Z-API e voltar a ligar na plataforma.
8. Selecionar o grupo do torneio, confirmar o número associado e fazer um teste explícito.

Credenciais cifradas com MESSAGE_KEY no PostgreSQL. Não são devolvidas pelo endpoint de leitura.
Não é necessário alterar o Docker Compose ou instalar Chromium para este adaptador.
APP_ORIGIN tem de ser o domínio público HTTPS. Não usar localhost para receber webhooks reais.

## Contratos consultados

O índice completo enumera 246 páginas da API: https://developer.z-api.io/_llms/pt-br/api-reference.md.
Foram lidas as secções abaixo para os fluxos desta aplicação; não há implementação de catálogos, pagamentos, chamadas ou comunidades.

- Autenticação: https://developer.z-api.io/security/client-token
- Ligação: https://developer.z-api.io/instance/status e https://developer.z-api.io/instance/device
- QR e challenge: https://developer.z-api.io/instance/qr-code e https://developer.z-api.io/instance/qr-code-image
- Envio de texto: https://developer.z-api.io/message/send-text
- Menções: https://developer.z-api.io/group/mention-participant
- Grupos: https://developer.z-api.io/group/get-groups e https://developer.z-api.io/group/metadata-group
- Adição: https://developer.z-api.io/group/add-participant
- Convites: https://developer.z-api.io/group/get-invitation-link
- Receção: https://developer.z-api.io/webhooks/on-message-received e https://developer.z-api.io/webhooks/on-message-received-examples
- Confirmação de envio: https://developer.z-api.io/webhooks/on-message-send-examples
- Recibos: https://developer.z-api.io/webhooks/on-whatsapp-message-status-changes
- Configuração: https://developer.z-api.io/webhooks/update-every-webhooks
- Identificadores privados: https://developer.z-api.io/tips/lid

## Semântica

- POST send-text devolve messageId (WhatsApp) e zaapId (Z-API). A resposta é entrada na fila do fornecedor, não entrega.
- DeliveryCallback sem erro / SENT confirma envio ao WhatsApp; RECEIVED confirma entrega; READ confirma leitura.
- READ_BY_ME não é leitura pelo destinatário e é ignorado.
- IDs guardados com namespace da instância. zaapId é associado ao messageId para erros de entrega.
- Recibos persistidos mesmo quando o adaptador não está ativo. Duplicados e eventos fora de ordem não reduzem entrega/leitura confirmada.
- O webhook exige segredo aleatório na URL e instanceId correto. É uma credencial bearer, não uma assinatura do fornecedor. A URL não deve ser partilhada nem publicada em logs.
- Receção do bot limitada ao grupo configurado e ao adaptador Z-API selecionado. Payloads recebidos são cifrados na caixa de entrada antes do HTTP 200.
- LID não é tratado como número. O par participantPhone/participantLid é guardado quando disponibilizado.
- Adicionar participantes usa autoInvite=false. Só confirma entrada depois de verificar os membros do grupo. value:true sozinho não basta.
- Pausa e espaçamento dos convites usam a fila existente. Pedidos já aceites pelo fornecedor podem terminar depois de pausar.
- Ao ativar, configura `disableEnqueueWhenDisconnected=true` para não acumular novos envios na fila remota durante uma desconexão. Não elimina mensagens já aceites pela Z-API.
- Desligar na plataforma termina o adaptador local e liberta o bloqueio de exclusividade; não revoga a associação remota. A sessão pode ser removida no painel Z-API.

## Limitações e validação real pendente

É necessário validar com a instância do utilizador: QR/challenge, callbacks HTTPS através de Cloudflare/Nginx, mensagens, menções, entrada no grupo e identificação dos jogadores. Não há promessa de ausência de restrições do WhatsApp.
Se a API não confirmar a inclusão de um membro, a entrada fica por confirmar; a aplicação não inventa um sucesso nem envia um segundo convite automaticamente.
Se a chamada de envio perder a resposta, não há reenvio automático: a documentação consultada não fornece uma chave de idempotência para send-text.

Testes: `npm test --prefix server`, `node tests/zapi.mjs`, verificações TypeScript do servidor e frontend.
