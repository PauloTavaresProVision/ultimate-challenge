export type PublicRules = {title:string;intro:string;sections:{title:string;text:string}[]};
export const defaultRules: PublicRules = {
  "title": "As regras do jogo.",
  "intro": "Quatro jogos. Uma dupla. Um novo desafio a cada semana.",
  "sections": [
    {
      "title": "Participação e divisões",
      "text": "A inscrição é por convite, com validação do WhatsApp e aprovação da organização. Existem três divisões: M1+, M1 e M2. Cada jogador indica se joga à esquerda ou à direita."
    },
    {
      "title": "A ronda da semana",
      "text": "Cada jogador participa em quatro jogos de 20 minutos. A dupla mantém-se fixa durante os quatro jogos e muda de campo entre jogos. Os adversários variam sempre que as combinações e os campos o permitem. Os horários e campos são publicados após o sorteio."
    },
    {
      "title": "Sorteio das duplas",
      "text": "O sorteio é aleatório dentro de cada divisão, juntando um jogador de esquerda e um de direita. Não se repete o parceiro da semana anterior."
    },
    {
      "title": "Pontuação e bónus",
      "text": "Cada vitória vale 3 pontos e cada derrota vale 1 ponto, atribuídos individualmente aos dois jogadores da dupla. A partir da segunda vitória consecutiva, cada vitória acrescenta 1 ponto de bónus. Uma derrota interrompe a sequência. O bónus recomeça em cada semana; os pontos acumulam durante o mês.\n\nExemplos numa semana:\n4 vitórias consecutivas: 15 pontos.\n3 vitórias consecutivas + 1 derrota: 12 pontos.\n2 vitórias consecutivas + 2 derrotas: 9 pontos.\nVitória, derrota, derrota, vitória: 8 pontos."
    },
    {
      "title": "Subidas e descidas",
      "text": "A cada duas semanas, sobe o melhor pontuado de esquerda e o melhor de direita; descem o pior pontuado de cada lado, entre divisões adjacentes. Quem está em M1+ não sobe mais e quem está em M2 não desce mais. Os jogadores mantêm os pontos acumulados ao mudar de divisão."
    },
    {
      "title": "Campeões do mês",
      "text": "Há três campeões: o jogador com mais pontos de M1+, o de M1 e o de M2, independentemente do lado. Em caso de empate, vence o mais velho. Depois de apurados os campeões, o novo mês começa com os pontos a zero e o histórico fica guardado."
    },
    {
      "title": "Registo de resultados",
      "text": "Um participante regista a vitória ou derrota da sua dupla no link dos jogos. O resultado aplica-se aos quatro jogadores. Depois de confirmado, apenas a organização pode corrigir o resultado."
    },
    {
      "title": "Faltas e substituições",
      "text": "Comunica a ausência no grupo, indicando o dia ou a ronda. Os quatro jogos ficam a aguardar suplente. O administrador pode escolher um jogador aprovado do mesmo lado e divisão, ou aprovar um voluntário que se ofereça no grupo. Até à aprovação, ninguém ocupa a vaga. Os pontos pertencem a quem joga; o ausente recebe zero nessa ronda. Se já houver resultados, a situação é tratada pela organização, sem apagar resultados. Desistências durante os jogos devem ser comunicadas à organização."
    }
  ]
};
