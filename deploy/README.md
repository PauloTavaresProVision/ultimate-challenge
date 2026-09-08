# Instalação local e transferência para Docker

## Arrancar

1. Liga o Docker Desktop (motor Linux).
2. Na pasta do projeto: `node deploy/configure.mjs o-teu-email@dominio.com`.
3. `docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build`.
4. Abre `http://localhost:3100`. Consulta as credenciais geradas em `deploy/.env`.
5. No menu WhatsApp, clica em **Ligar por QR** e associa o número dedicado ao torneio. Carrega os grupos e seleciona apenas o grupo Escada. O número tem de ser administrador para obter o convite de entrada.
6. Cria convites individuais na mesma página. As inscrições precisam de WhatsApp ligado para enviar o código.

As alterações do backoffice exigem **Guardar alterações**. A aprovação gera o convite ao grupo; a publicação de rondas gera uma mensagem agregada. O modo Docker começa sem jogadores fictícios. Não há chamadas à OpenAI.

## Dados e sessão

Os volumes `postgres_data` e `whatsapp_session` preservam os dados e a sessão Baileys. Não uses `down -v` para reiniciar. Para backups, guarda os dois volumes e o ficheiro de configuração num local seguro. Preserva MESSAGE_KEY: a fila de mensagens é cifrada com essa chave. Um envio com resultado incerto não é repetido automaticamente para evitar mensagens duplicadas.

WA_AUTO_CONNECT fica false: cada arranque exige clicar em Ligar. Depois de associares o número, podes alterar para true para reconectar automaticamente. Desligar fecha a conexão sem apagar credenciais.

## Transferir para servidor

Copia o código e os lockfiles, instala Docker e cria uma nova configuração no destino. Para migrar dados existentes, transfere os volumes e a configuração de forma segura. Não copies node_modules. Coloca um proxy HTTPS à frente da porta 3100 e define APP_ORIGIN para a origem HTTPS exata antes de usar com jogadores. A porta fica ligada apenas ao localhost por defeito; o proxy deve conseguir chegar a essa porta. A base de dados não publica portas.

## Limites da etapa atual

- A IA foi adiada. `/escada` responde a jogadores aprovados no grupo configurado com o perfil e próximo jogo.
- O Baileys está fixado em 7.0.0-rc14 (pré-lançamento). A associação real exige ler o QR com o telemóvel; a compatibilidade real precisa de teste depois de emparelhar.
- A página dos jogadores permite consultar jogos; a submissão com confirmação por adversário ainda não está ligada.
- O fecho mensal e as subidas/descidas aguardam as regras pendentes. O backoffice local usa o mês atual.
- Esta instalação é uma base local em desenvolvimento. Verifica o fluxo completo com o número do torneio antes de abrir inscrições reais.
