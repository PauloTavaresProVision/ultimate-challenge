# Sessão WhatsApp no PostgreSQL

## Motor alternativo: WhatsApp Web

Em WhatsApp > Método de ligação, escolhe Baileys ou WhatsApp Web. A seleção é
guardada automaticamente. Mudar de motor encerra a ligação anterior; carrega
depois em Ligar por QR. A primeira associação de cada motor exige o seu QR.
Não há troca automática de motor quando uma ligação falha.

Baileys mantém as chaves no PostgreSQL. WhatsApp Web mantém o perfil Chromium
no volume `whatsapp_web_session`, separado do Baileys. Preserva ambos nos
backups. O navegador corre sem janela no servidor, com o utilizador `node`;
`init: true` recolhe os processos filhos. Não é necessário manter o computador
pessoal ligado. O Chromium consome memória adicional ao motor Baileys.

Os dois motores usam o mesmo bloqueio PostgreSQL para impedir utilização
simultânea nesta instalação, e a mesma fila, intervalo de convites e lógica
de inscrições. A troca pausa os envios até à próxima ligação. Envios já iniciados
sem confirmação ficam incertos para não serem repetidos automaticamente.

Teste isolado do adaptador: `node tests/whatsapp-web.mjs` (imagem local
`ultimate-webjs-test`). Usa um cliente simulado e PostgreSQL real, sem enviar
mensagens. A validação real de QR, receção e grupo exige associação pelo titular.

## Persistência do Baileys

A aplicação passa a guardar credenciais e chaves Signal cifradas nas tabelas
`WhatsAppAuthSession` e `WhatsAppAuthKey`. Mantém a mesma `MESSAGE_KEY` do ambiente.
Inclui estas tabelas no backup habitual do PostgreSQL e preserva a configuração
de forma segura; sem essa chave, os dados cifrados não podem ser recuperados.

Na primeira execução, importa a sessão ativa da raiz de `WA_AUTH_DIR` numa
transação. Não apaga os ficheiros originais, não importa backups e ignora uma
sessão marcada com `.requires-qr`. Após a importação, PostgreSQL é a fonte usada
para reconectar. Não voltes a executar versões antigas sobre os ficheiros que
ficaram guardados: deixam de acompanhar as atualizações da sessão.

A conexão PostgreSQL que grava as chaves mantém um advisory lock exclusivo.
Outro processo que use a mesma base de dados não pode abrir a mesma sessão.
Isto não controla outras aplicações, como Evolution, ligadas a bases diferentes.
Se a conexão ou uma gravação falhar, o socket é parado para impedir utilização
de chaves que não ficaram persistidas. As chaves de uma sessão rejeitada com
401 são arquivadas, nunca reutilizadas numa nova associação.

Atualização no servidor, mantendo o `.env` existente:

```sh
cd /opt/ultimate-challenge
git pull --ff-only
docker compose -p ultimate-challenge --env-file deploy/.env -f deploy/compose.yaml -f deploy/compose.server.yaml up -d --build app
```

O arranque aplica a migração automaticamente. Para verificar sem expor chaves:

```sh
docker logs --since 10m ultimate-challenge-app-1 2>&1 | grep -E 'WhatsApp: persistência|WhatsApp sessão:|WhatsApp desligado:'
```

Teste isolado de persistência: `node tests/whatsapp-postgres-auth.mjs`.
Cria uma base de dados temporária, testa importação, concorrência, transações,
reinícios, revogação e perda da conexão. Não liga ao WhatsApp nem envia mensagens.

Esta correção trata a persistência e concorrência da aplicação; não impede uma
revogação remota ou restrição aplicada pelo WhatsApp.
