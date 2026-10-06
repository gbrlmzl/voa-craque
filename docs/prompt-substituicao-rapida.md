<role>
Você é um engenheiro full-stack sênior trabalhando no Voa Craque, um app de gestão de peladas de futsal em Next.js 16 (App Router), React 19, TypeScript, Prisma 7 e PostgreSQL 17. Você vai implementar uma funcionalidade de ponta a ponta: schema, migration, serviço, API, interface e testes.
</role>

<context>
O Voa Craque organiza peladas: inscrição, sorteio de times equilibrados, painel ao vivo operado pelo organizador com o polegar (em pé, na beira da quadra, com uma mão) e ranking. Cada pelada tem vários times (A, B, C, D, E); dois jogam e os outros esperam numa fila. Quem vence fica, quem perde vai para o fim da fila.

O problema real, no teste beta numa pelada de verdade: um jogador do time C precisou sair durante a partida e entrou no lugar dele um jogador de um time que estava esperando na fila. Esse jogador fez gol e não havia como registrar: o painel só lista os jogadores do elenco fixo do time, e o servidor recusa gol de quem não pertence ao time. Hoje não existe substituição no app.

A causa está no modelo de dados. O elenco de um time (tabela `TeamPlayer`) é fixo para a pelada inteira e é usado para três coisas ao mesmo tempo: montar a lista do painel ao vivo, validar quem pode marcar gol e calcular jogos, vitórias, empates e derrotas de cada jogador nas estatísticas. As estatísticas são recalculadas a partir do elenco atual, então mexer no `TeamPlayer` no meio da pelada reescreveria o histórico: o substituto ganharia crédito por partidas que não jogou e quem saiu perderia crédito pelas que jogou. Por isso a solução passa a registrar quem jogou cada partida.

Quem vai usar: o organizador (papel ADMIN) no painel `/game-days/[id]/panel`, pelo celular, com a partida rolando. Espectadores veem a tela `/game-days/[id]/live`, que lê o mesmo snapshot.
</context>

<files_to_read>
Leia estes arquivos antes de editar qualquer coisa. Eles definem os padrões que a implementação deve seguir.

Modelo e regras:
- prisma/schema.prisma (modelos Team, TeamPlayer, GameDayReserve, Match, MatchEvent)
- prisma/migrations/20260101000200_match_queue_snapshot/migration.sql (estilo de migration escrita à mão, com comentário)
- src/lib/match-engine.ts e tests/match-engine.test.ts (módulo puro, testado, sem banco e sem relógio)

Serviços e API:
- src/services/match.ts (createMatch, finalizeMatch, recordMatchEvent, undoMatchEvent; uso de withLock e $transaction; padrão queueSnapshot para desfazer)
- src/services/live.ts (buildLiveSnapshot e os tipos LiveSnapshot, LiveMatch, LiveTeam, LivePlayer)
- src/services/teams.ts (loadPool, ratePlayers, como reservas são gravadas)
- src/app/api/matches/[id]/events/route.ts e src/app/api/matches/[id]/events/[eventId]/route.ts (padrão de route handler)
- src/lib/validation.ts, src/lib/http.ts, src/lib/realtime.ts, src/lib/audit-actions.ts

Estatísticas que hoje dependem de TeamPlayer:
- src/services/gameday-stats.ts
- src/services/ranking.ts
- src/app/api/players/[id]/route.ts
- src/app/(app)/page.tsx (o `teamPlayer.count`)

Interface:
- src/components/live/LivePanel.tsx, src/hooks/useLivePanel.ts, src/components/live/GoalAssistModal.tsx
- src/components/live/LiveBoard.tsx (tela do espectador, lista de lances)
- src/components/ui/* e src/lib/labels.ts (teamColor)
</files_to_read>

<decisions>
Estas decisões já foram tomadas. Siga-as; se o código contradizer alguma premissa, pare e me pergunte antes de seguir por outro caminho.

1. Escalação por partida. Crie o modelo `MatchPlayer` com `matchId`, `teamId`, `userId`, `isKeeper`, `starter` (true para quem começou a partida) e `onCourt` (true enquanto está em quadra), com `@@unique([matchId, userId])` e índice em `userId`. A escalação inicial é gravada dentro de `createMatch`, copiando o `TeamPlayer` dos dois times. `createMatch` é o único ponto onde partidas nascem, então todas as partidas ficam cobertas. O unique garante que ninguém joga pelos dois lados da mesma partida.

2. Registro da substituição. Crie o modelo `MatchSubstitution` com `matchId`, `teamId`, `outUserId`, `inUserId`, `fromTeamId` (time de onde o jogador que entra veio; null quando veio das reservas), `permanent`, `elapsedMs`, `rosterBefore` (Json, nulo quando a troca é só desta partida), `createdById` e `createdAt`. Ele alimenta a lista de lances, a auditoria e o desfazer. O `rosterBefore` segue o mesmo padrão do `queueSnapshot` que já existe em `Match`: guarda as linhas de `TeamPlayer` e `GameDayReserve` afetadas antes da troca, para o desfazer restaurar exatamente o estado anterior.

3. Duas modalidades, escolhidas no modal:
   - "Só nesta partida" (padrão, como no futebol): muda apenas a `MatchPlayer` da partida atual. O elenco fixo não muda; na próxima partida o time volta com o elenco original, e quem entrou volta para o time de origem.
   - "Até o fim da pelada": além da partida atual, troca os dois de lugar no elenco. Quem entra assume a vaga de quem sai no time em quadra, herdando o `isKeeper` dessa vaga; quem sai vai para o lugar de onde o outro veio (o time da fila ou as reservas). Se quem entra vinha das reservas, a força dele vem de `ratePlayers(await loadPool(gameDayId))`, igual a `setTeamsManually`. Recalcule `averageStrength` dos times afetados.
   - "Até o fim da pelada" só é permitido quando quem sai pertence ao elenco fixo do time em quadra e quem entra não pertence. Nos outros casos (por exemplo, devolver para a quadra quem saiu antes), o modal mostra a opção desabilitada com uma linha explicando o motivo.

4. Quem pode entrar num time em quadra: jogadores dos times que estão esperando na fila, jogadores em `GameDayReserve` e jogadores que saíram desta mesma partida por este mesmo time (reentrada, permitida no futsal). Ficam de fora todos os que estão em quadra agora e quem saiu desta partida pelo time adversário.

5. A partida não pausa sozinha na substituição. No futsal a substituição é volante, com a bola rolando; o gol pausa hoje só porque o modal de assistência precisa de atenção. O `elapsedMs` é calculado no servidor no momento da confirmação. A substituição é permitida com a partida SCHEDULED (antes do apito, para quem faltou), RUNNING e PAUSED, e recusada com a partida FINISHED ou a pelada FINISHED.

6. Gols e assistências passam a ser validados contra `MatchPlayer`: o jogador precisa ter linha nesta partida com o mesmo `teamId`. Não exija `onCourt`, para que um gol anotado com atraso, de quem já saiu, continue sendo aceito pelo servidor. A interface oferece o botão de gol só para quem está em quadra.

7. Estatísticas contam presença por `MatchPlayer`: todo jogador com linha numa partida encerrada recebe o jogo e o resultado do lado do seu `teamId`, tenha começado ou entrado depois. Troque o cálculo em gameday-stats.ts, ranking.ts e players/[id]/route.ts. Em page.tsx, troque o `teamPlayer.count` pela contagem de peladas distintas em que o jogador tem `MatchPlayer` numa partida encerrada, e confira o rótulo exibido para garantir que continua fazendo sentido.

8. Desfazer: só a substituição mais recente da partida, só com a partida não encerrada, e só se quem entrou não tem gol nem assistência nesta partida registrados depois da substituição (nesse caso responda 409 com "Desfaça antes o lance de {nome}."). Ao desfazer: quem saiu volta a `onCourt = true`; quem entrou vai para `onCourt = false` se era titular ou entrou por uma substituição anterior desta partida, senão a linha é apagada; se `permanent`, restaure o `rosterBefore`; apague a `MatchSubstitution`.

9. Concorrência: toda escrita roda dentro de `withLock` com a chave `clock:${gameDayId}` e de `prisma.$transaction`, como `recordMatchEvent`. Depois da escrita, chame `publishGameDay(gameDayId, "substitution")` ou `"substitution-undone"`.

10. As regras de elegibilidade e de quando a troca pode ser permanente ficam num módulo puro, `src/lib/substitution.ts`, no mesmo estilo de `match-engine.ts`: recebe estado, devolve resultado, sem banco. O serviço e o modal usam as mesmas funções, para que a interface nunca ofereça uma troca que o servidor recusaria.
</decisions>

<constraints>
- Escopo: substituição no painel ao vivo, com tudo o que ela exige no modelo, nas estatísticas e na tela do espectador. Mudanças no sorteio, na tela de montar times ou em inscrições de última hora ficam para outra tarefa; anote no relatório final se achar algo que mereça.
- Stack: use apenas as dependências que já estão no package.json. Ícones vêm de lucide-react.
- Interface: reutilize os componentes de src/components/ui e o padrão visual do GoalAssistModal (folha que sobe do rodapé no celular e centraliza no desktop, fundo `bg-black/70`, `Card` com `max-w-sm`). Use a paleta que já existe: verde `pitch` para quem entra, `rose` para quem sai, `night` para os fundos, `teamColor(nome)` para identificar times. Todo alvo de toque tem pelo menos 44px (classe `touch-target` ou `size="lg"`), porque o organizador opera com uma mão, de pé.
- Idioma: textos de interface e mensagens de erro em português com acentos ("Substituição", "Até o fim da pelada"). Comentários de código em português sem acentos, como no resto do repositório. Comente só o que não é óbvio, no tom dos comentários existentes.
- Migration: escreva o SQL à mão em `prisma/migrations/<timestamp>_match_lineups/migration.sql`, com comentário no topo. Inclua o backfill: para cada `Match` existente, insira uma `MatchPlayer` por jogador do `TeamPlayer` atual do mandante e do visitante, com `starter = true` e `onCourt = true`, gerando o id com `gen_random_uuid()::text`. Já existem dados reais do beta em produção, e sem o backfill as estatísticas deles zerariam ao trocar a fonte para `MatchPlayer`. Confira o SQL com `prisma migrate diff` contra o schema novo, usando uma pasta isolada.
- Auditoria: adicione `MATCH_SUBSTITUTION` ("Substituição registrada") e `MATCH_SUBSTITUTION_UNDONE` ("Substituição desfeita") em audit-actions.ts e `"MatchSubstitution"` em `AUDIT_ENTITIES`.
- Ambiente local (Windows): o Postgres nativo ocupa a 5432. Suba o banco do Docker na 5433 (`VOACRAQUE_DB_PORT=5433 docker compose -f docker-compose.dev.yml up -d db`) e aponte `DATABASE_URL` para ela num `.env.local`. O Docker Desktop costuma estar fechado; se `docker ps` falhar, me avise em vez de mexer no Postgres nativo. O banco de dev não tem SUPERADMIN, só o ADMIN `adminteste`. Antes de qualquer fluxo que mande e-mail, use `MAIL_DRIVER=console`.
- Git: trabalhe numa branch nova a partir do main (`feat/substituicao-rapida`). Faça commits pequenos e coerentes no estilo do histórico (`feat(db): ...`, `feat(live): ...`, `test(live): ...`, em português). Não faça push nem abra PR; eu reviso antes.
- Quando faltar informação: se for detalhe de implementação, decida, siga e registre a decisão no relatório final. Se for regra de negócio que contradiz as decisões acima, pare e pergunte.
</constraints>

<scenarios>
Estes cenários são os critérios de aceite. Cubra os que forem lógica pura com testes em `tests/substitution.test.ts` e verifique os outros no navegador.

<scenario name="o caso do beta">
Times A x C em quadra, D e E na fila, partida RUNNING aos 4 minutos. O organizador toca em "Substituição" no card do time C, escolhe "Sai: Bruno", "Entra: Caio (Time E)", deixa "Só nesta partida" e confirma. O cronômetro continua correndo. Caio aparece no card do C com botão de gol; Bruno some do card. Nos lances aparece "5' 🔁 Entra Caio, sai Bruno · Time C". Caio faz gol: o placar do C sobe e o gol aparece nos lances. Na partida seguinte, o C volta com Bruno e Caio volta para o E. Nas estatísticas da pelada, Bruno e Caio recebem os dois o jogo e o resultado dessa partida pelo time C, e o gol fica com Caio.
</scenario>

<scenario name="troca até o fim da pelada vinda das reservas">
Partida PAUSED. O goleiro Davi, do time A, se machuca. Entra Edu, das reservas, com "Até o fim da pelada". Edu passa a ser o goleiro do A nesta partida e nas próximas; Davi vai para `GameDayReserve`. A `averageStrength` do A é recalculada. As partidas que o A jogou antes continuam creditadas a Davi, não a Edu.
</scenario>

<scenario name="reentrada">
No time C, Bruno saiu e Caio entrou. Mais tarde o organizador abre a substituição do C de novo: Bruno aparece num grupo "Saíram desta partida" no topo da lista de quem entra. Sai Caio, entra Bruno. "Até o fim da pelada" aparece desabilitada, porque Bruno já é do elenco do C. A escalação final da partida tem Bruno e Caio, cada um com uma linha só.
</scenario>

<scenario name="desfazer bloqueado">
Caio entrou e fez gol. O organizador tenta desfazer a substituição pelo toast: o servidor responde 409 com "Desfaça antes o lance de Caio." e o toast de erro mostra essa mensagem. Depois de desfazer o gol, desfazer a substituição funciona e Bruno volta para o card.
</scenario>

<scenario name="entradas inválidas recusadas no servidor">
Chamadas diretas à API recebem 400 com mensagem clara quando: quem sai não está em quadra por aquele time; quem entra está em quadra; quem entra saiu desta partida pelo time adversário; quem sai e quem entra são a mesma pessoa; o time não está na partida; ou `permanent = true` num caso em que a troca permanente não é permitida. Com a partida FINISHED a resposta é 409 "A partida já foi encerrada.".
</scenario>
</scenarios>

<instructions>
1. Leia os arquivos de `<files_to_read>` e confirme que as premissas de `<decisions>` batem com o código. Se alguma não bater, pare e me diga qual e por quê.
2. Escreva `src/lib/substitution.ts` com as funções puras (elegibilidade de quem entra para um time numa partida, se a troca pode ser permanente, o novo elenco depois de uma troca permanente) e `tests/substitution.test.ts` cobrindo os cenários acima e os casos de borda que você identificar. Rode `npm test` até passar.
3. Atualize o `schema.prisma` com `MatchPlayer` e `MatchSubstitution` e as relações inversas em `User`, `Team` e `Match` (com nomes de relação explícitos onde houver mais de uma relação com o mesmo modelo). Escreva a migration com o backfill. Rode `npm run db:generate` e aplique a migration no banco local.
4. Em `src/services/match.ts`: grave a escalação em `createMatch`; troque a validação de `recordMatchEvent` para `MatchPlayer`; crie `recordSubstitution` e `undoSubstitution` seguindo as decisões 5, 8 e 9, com auditoria. Crie `substitutionSchema` em validation.ts e as rotas `POST /api/matches/[id]/substitutions` e `DELETE /api/matches/[id]/substitutions/[substitutionId]` no padrão das rotas de eventos, protegidas por `requireAdmin()`.
5. Em `src/services/live.ts`: o `LiveTeam.players` passa a vir das `MatchPlayer` com `onCourt = true`. Adicione a `LiveMatch` a lista `substitutions` (id, teamId, teamName, outName, inName, elapsedMs, permanent, createdAt) e a lista `bench` com os candidatos a entrar e a origem de cada um, no formato que o modal precisa para agrupar por "Saíram desta partida", times da fila na ordem da fila e "Reservas".
6. Troque o cálculo de estatísticas para `MatchPlayer` nos quatro arquivos listados na decisão 7.
7. Interface:
   - No cabeçalho de cada `TeamPanel`, um botão "Substituição" com o ícone `ArrowLeftRight`, desabilitado com a pelada encerrada, durante `busy` ou com outro modal aberto. Enquanto o modal de substituição está aberto, os botões de gol, pausar e encerrar ficam desabilitados, como já acontece com `pendingGoal`.
   - `src/components/live/SubstitutionModal.tsx`, inspirado na placa de substituição do futebol: no topo, uma faixa-resumo com a seta para baixo em `rose` e o nome de quem sai, e a seta para cima em `pitch` e o nome de quem entra (vazia até escolher). Abaixo, a seção "Sai" com os jogadores em quadra daquele time e a seção "Entra" com os grupos da decisão 4, cada time com o ponto de cor de `teamColor`. Depois, o seletor "Só nesta partida" / "Até o fim da pelada". Por último, o botão "Confirmar substituição", habilitado só com os dois escolhidos, e o "Cancelar". A lista rola dentro da folha, e o botão de confirmar fica sempre visível.
   - Em `useLivePanel`, o estado `pendingSubstitution` e as funções `startSubstitution`, `confirmSubstitution` e `cancelSubstitution`. Depois de confirmar, mostre o toast "Entrou {in}, saiu {out}" com a ação "Desfazer", com a mesma duração do toast de gol.
   - Na lista de lances do LivePanel e do LiveBoard, junte eventos e substituições, ordenados do mais recente para o mais antigo, com a substituição exibida como "🔁 Entra {in}, sai {out}" e o nome do time à direita.
8. Verifique: rode `npm run typecheck` e `npm test`. Suba o app pelo preview `voacraque-dev`, entre como `adminteste`, monte uma pelada com pelo menos quatro times e reservas e percorra os cinco cenários no painel em viewport mobile (375x812). Confira também a tela do espectador e a página de estatísticas da pelada. Tire screenshots do modal aberto e da lista de lances com uma substituição.
9. Você terminou quando os cinco cenários funcionam no navegador, `typecheck` e `test` passam e os commits estão feitos na branch.
</instructions>

<output_format>
Ao terminar, responda em português com:
- Um parágrafo curto dizendo o que foi entregue.
- A lista de arquivos criados e alterados, cada um com uma linha explicando a mudança.
- O resultado de `npm run typecheck` e `npm test` e, para cada cenário, se passou no navegador.
- As decisões de implementação que você tomou sozinho, com o motivo.
- Limitações conhecidas e sugestões de próximos passos, se houver.
Anexe as screenshots da verificação.
</output_format>

<task>
Implemente a substituição rápida no painel ao vivo do Voa Craque, com o modal de quem sai e quem entra, conforme as decisões e os cenários acima.
</task>
