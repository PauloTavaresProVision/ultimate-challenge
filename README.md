# Escada — backoffice

Primeira versão interativa para validar o design e os fluxos de gestão do torneio.

## Executar

`npm install` e `npm run dev`. Verificação: `npm run build`, `npx tsc --noEmit` e `node --experimental-strip-types --test tests/tournament.test.mjs`.

## Implementado

- Interface em português, responsiva, com navegação e formulários acessíveis.
- Inscrições: revisão, aprovação de candidatos já validados, rejeição com motivo e verificação de número duplicado.
- Jogadores: pesquisa, filtros e edição de perfis.
- Campos: criação, edição e disponibilidade.
- Rondas: escolha de participantes, sorteio aleatório com restrições, agendamento e revisão da mensagem.
- Jogos: edição de horário/campo, conflitos, resultados administrativos e classificação recalculada.
- Classificação individual, vitória 3, derrota 1, bónus de sequência e desempate por nascimento.
- Histórico de ações da sessão; estados explícitos para integrações não configuradas.

## Limites desta entrega

Todos os dados são fictícios e ficam apenas na memória da sessão. Recarregar a página reinicia a demonstração. Não há autenticação própria, PostgreSQL, envio WhatsApp, geração de códigos, convite real, inscrição pública ou link real de resultados ainda. A publicação privada de demonstração não é o alojamento final do serviço WhatsApp.

O frontend usa o scaffold Sites (Vinext/React/TypeScript). A arquitetura de produção prevista mantém PostgreSQL/Prisma e um processo Node separado para o conector WhatsApp não oficial; o runtime de publicação Sites não executa esse processo de sessão persistente. Não usa Supabase.

A demonstração usa setembro de 2026 e rondas de um dia com duração inicial de 90 minutos. O sorteio usa matching aleatorizado com backtracking, sem garantia de distribuição uniforme sobre todos os matchings possíveis. Ausências que impeçam formar grupos válidos são bloqueadas, sem inventar regras de folgas. Finalizar uma ronda altera apenas o estado local e não envia mensagens.

Por definir: quantidades de subidas/descidas, pontos e elegibilidade mensal após mudar de divisão, sequência de vitórias entre meses e faltas. Não há fecho mensal nem mudanças automáticas. O cálculo de demonstração usa a divisão atual e sequências dentro do mês.

## Verificação

Testes do domínio cobrem sorteios, combinações impossíveis, pontuação, correções, desempates e conflitos. O browser não foi usado para testes visuais nesta entrega. A integração WebMCP opcional expõe apenas leitura da classificação; não foi verificada num contexto WebMCP compatível.

## WhatsApp: grupo único

Todos os jogadores entram no mesmo grupo Escada. A mensagem semanal agrega M1+, M1 e M2. O conector futuro associa o número validado ao perfil e consulta a divisão atual, o lado e o jogo; a IA não infere a identidade. O link partilhado continua a exigir sessão autenticada para submeter resultados.
