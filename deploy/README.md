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

Para alterar o administrador, edita `ADMIN_EMAIL` e `ADMIN_PASSWORD` (mínimo de 8 caracteres) em `deploy/.env` e executa `docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --force-recreate app`. O arranque atualiza a mesma conta, preserva os dados do torneio e termina as sessões administrativas antigas. Um simples `restart` não recarrega as variáveis do ficheiro.

Os volumes `postgres_data` e `whatsapp_session` preservam os dados e a sessão Baileys. Não uses `down -v` para reiniciar. Para backups, guarda os dois volumes e o ficheiro de configuração num local seguro. Preserva MESSAGE_KEY: a fila de mensagens é cifrada com essa chave. Um envio com resultado incerto não é repetido automaticamente para evitar mensagens duplicadas.

WA_AUTO_CONNECT fica false: cada arranque exige clicar em Ligar. Depois de associares o número, podes alterar para true para reconectar automaticamente. Desligar fecha a conexão sem apagar credenciais.

## Transferir para servidor

Copia o código e os lockfiles, instala Docker e cria uma nova configuração no destino. Para migrar dados existentes, transfere os volumes e a configuração de forma segura. Não copies node_modules. Coloca um proxy HTTPS à frente da porta 3100 e define APP_ORIGIN para a origem HTTPS exata antes de usar com jogadores. A porta fica ligada apenas ao localhost por defeito; o proxy deve conseguir chegar a essa porta. A base de dados não publica portas.

## Limites da etapa atual

- A IA foi adiada. `/escada` responde a jogadores aprovados no grupo configurado com o perfil e próximo jogo.
- O Baileys está fixado em 7.0.0-rc14 (pré-lançamento). A associação real exige ler o QR com o telemóvel; a compatibilidade real precisa de teste depois de emparelhar.
- A página `/jogos` mostra os campos, horários e participantes. Um participante aprovado pode declarar vitória ou derrota com confirmação antes de guardar, a partir do dia do jogo. O primeiro resultado fica registado e altera a pontuação; correções ficam a cargo da organização. Não existe confirmação por adversário nesta etapa. Gravações antigas do backoffice são rejeitadas para proteger resultados novos.
- Validação isolada do fluxo de resultados: `node tests/player-results-api.mjs` (requer a imagem Docker atual, a base de dados local e a porta 3101 livre). Cria e remove uma base de dados de teste, sem mensagens nem alterações ao torneio real.
- O calendário automático é verificado a cada minuto, na hora de Luanda. Os ciclos de 14 dias começam na data do primeiro jogo publicado. Trocam o melhor e o pior de cada lado entre divisões adjacentes, conservando pontos. Os empates usam idade. A classificação e os três campeões mensais ficam congelados no histórico; jogos de meses encerrados não podem ser alterados. O novo mês começa sem pontos nem sequência de vitórias.
- Trocas são adiadas se faltarem resultados, jogadores suficientes por lado ou se houver jogos publicados incompatíveis após a troca. O motivo aparece em Configurações e Histórico. Uma divisão sem jogadores elegíveis não recebe campeão.
- Teste isolado do calendário: `node tests/competition-api.mjs`. Simula datas futuras e operações simultâneas numa base de dados temporária.
- Esta instalação é uma base local em desenvolvimento. Verifica o fluxo completo com o número do torneio antes de abrir inscrições reais.

### Mensagens e agendamento

Em WhatsApp, escolhe enviar os jogos ao publicar ou entre 1 e 168 horas antes do primeiro jogo (hora de Luanda). A preferência aplica-se às novas publicações; as mensagens já na fila mantêm o horário. O modo inicial continua a ser envio ao publicar. Ao publicar depois da hora prevista, o envio fica imediatamente disponível; jogos já iniciados não aceitam agendamento.

A lista mostra os últimos 50 registos, incluindo testes de ligação, sem conteúdo de códigos privados. Mensagens de jogos ainda pendentes podem ser canceladas. Envios sem confirmação não são repetidos automaticamente; verifica a receção antes de fazer outro envio. Mensagens agendadas não enviadas expiram no início do primeiro jogo. A mensagem conserva os dados da publicação original.

Teste isolado: `node tests/message-delivery-api.mjs`. Requer a imagem Docker atual e a porta 3101 livre. O WhatsApp fica desligado durante o teste.

### Chave OpenAI

Em Configurações → OpenAI, cola a chave e escolhe Guardar chave; depois usa Testar ligação. A chave fica cifrada na base de dados com MESSAGE_KEY e nunca é devolvida ao browser. Preserva MESSAGE_KEY juntamente com os backups para poder recuperar a configuração. Não é necessário colocar a chave no ficheiro .env.

O teste consulta o endpoint de modelos da OpenAI, apenas ao clicar, e não ativa o bot com IA nem verifica saldo ou geração de respostas. A chave pode ser substituída ou removida neste ecrã. Testes locais: `node tests/openai-settings-api.mjs`; usam uma chave fictícia numa base temporária, sem pedidos reais à OpenAI.

### Rondas semanais e acesso
O ecrã de acesso usa a identidade Ultimate Challenge e adapta-se ao telemóvel. As novas rondas têm quatro jogos de 20 minutos por jogador, com parceiro fixo, mudança de campo e preferência por adversários ainda não enfrentados nessa sessão. São necessários pelo menos dois campos. Cada divisão é organizada em sessões de 80 minutos; se os campos não chegarem para todas as duplas, há sessões sucessivas. A rotação obrigatória de campos pode exigir repetir adversários, mesmo quando existem outras duplas. O sorteio informa os confrontos repetidos.
Vitória: 3 pontos; derrota: 1. Cada vitória consecutiva depois da primeira dá mais 1 ponto, apenas dentro da mesma ronda/data. Um resultado em falta interrompe provisoriamente a sequência, que é recalculada quando o resultado é registado. O mês mantém a acumulação de pontos; os meses arquivados não são reabertos. Os jogos antigos de formato anterior permanecem registados.

### Envio de convites por WhatsApp
Em WhatsApp → Enviar convites, escolhe o indicativo, introduz até 50 números (um por linha, vírgula ou ponto e vírgula) e revê a mensagem. Números internacionais começam por + ou 00; os restantes usam o país selecionado. Duplicados são eliminados. Cada destinatário recebe um link individual válido por sete dias, associado ao seu número, e continua sujeito a validação por código e aprovação administrativa.
Os envios usam a fila cifrada existente. O popup acompanha o estado; a lista de mensagens identifica os convites de inscrição. Um envio sem confirmação não é repetido automaticamente. Repetir o mesmo pedido no popup reutiliza o lote original, incluindo após uma falha de rede. Teste isolado: `node tests/invite-sending-api.mjs` (Docker local; sem mensagens reais).

### Entrada automática no grupo
Ao aprovar e guardar uma inscrição, fica em fila uma tentativa de entrada no grupo associado. O bot verifica se o jogador já está no grupo antes de o adicionar. Uma rejeição explícita compatível com convite faz enviar o link por mensagem privada; erros de transporte ficam sem confirmação, sem repetição automática. Em WhatsApp → Mensagens aparecem o nome e o resultado: Adicionado ao grupo, Já pertence ao grupo, Convite enviado ou Sem confirmação. Se a aprovação for revogada ou o grupo associado mudar antes do processamento, a tentativa é cancelada. O número ligado precisa de permissões de administrador. Aplica-se às novas aprovações; não adiciona retroativamente os jogadores existentes.

### Boas-vindas e regras públicas
A página /regras é pública, sem login. Um evento de entrada no grupo associado, ou a confirmação de uma adição automática, prepara as boas-vindas para jogadores ativos com WhatsApp validado. A mensagem usa nome, divisão e lado aprovados; não anuncia horários ou jogos individuais. O acesso às regras é um link clicável: a API normal da versão oficial instalada do Baileys não oferece um botão URL suportado. Não foram introduzidos forks ou mensagens interativas experimentais.
Uma marca persistente por grupo/jogador evita repetições de eventos e reconexões. Não se enviam boas-vindas retroativas a todos os membros. Envios incertos continuam sem repetição automática. O histórico identifica Boas-vindas ao grupo. Teste isolado: node tests/welcome-api.mjs; não envia mensagens reais.

### Ausências e suplentes
Em Rondas e sorteios → Ausências e suplentes, o administrador pode registar uma ausência e escolher manualmente um substituto, ou aprovar um voluntário identificado no grupo. As operações ficam guardadas imediatamente e a lista atualiza automaticamente. Guarda outras alterações antes de usar estas ações e atualiza a página após concluir para carregar os jogos mais recentes.
O bot reconhece frases diretas como “hoje não posso jogar” e “não posso jogar esta semana”. Sem uma ronda inequívoca, pede “confirmo falta ronda N”. Ofertas como “posso substituir” são candidaturas, nunca aprovações. Um “sim” exige resposta direta à mensagem original de ausência. Havendo várias vagas, o jogador deve responder à mensagem original do ausente. Este reconhecimento é determinístico; não constitui ainda a IA geral de conversação.
A ausência fica registada separadamente para preservar histórico. Nos jogos aparece “Aguarda suplente”, com resultados bloqueados. O administrador pode cancelar a ausência ou aprovar um jogador ativo e validado do mesmo lado/divisão, sem jogos no mesmo dia ou ronda e sem repetir o parceiro da ronda anterior. A aprovação substitui o ausente nos quatro jogos numa única transação e anuncia a decisão no grupo. Os pontos futuros pertencem ao suplente. Nenhuma substituição automática é permitida se já houver resultados; rondas antigas e meses encerrados ficam protegidos. Os convites e aprovações de inscrição existentes permitem integrar novos suplentes na lista de jogadores.
Teste isolado: node tests/substitutions-api.mjs. Cobre ambiguidades, mensagens repetidas, candidatos pendentes, elegibilidade, aprovação concorrente e proteção dos resultados; sem mensagens reais.
