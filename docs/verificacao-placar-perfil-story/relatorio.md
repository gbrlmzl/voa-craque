# Relatório: placar, perfil, data, story, ciclo da pelada e comprovante

Branch `feat/placar-perfil-data-e-story` (saiu da `main` em `ff672d2`). Nada foi enviado (sem push, sem PR).

## 1. Decisões da seção 2

Todas as opções marcadas com `[x]` foram seguidas: D1 A, D2 A, D3 A, D4 A, D5 A, D6 A, D7 A, D8 A, D9 A, **D10 B** (sem campanha partida a partida), D11 A, D12 (branch da `main`), D13 A, D14 A, D15 A, D16 A, D17 A, D18 A, **D19 B**, D20 A.

A D10 eu li errado na primeira passada: implementei a campanha (opção A) e só percebi na revisão final, porque a opção marcada era a B. Corrigi antes de entregar: tirei a campanha do cartão e dos dados (`buildGameDayStats` ficou como estava) e os números viraram uma grade 2×2 maior. Para o histórico não carregar o desvio, reescrevi os três commits locais do F6 (nada tinha sido enviado).

## 2. Commits

```
a71865f feat(gameday): pelada nova com 8 minutos e 4 por time                       F5
a8ec445 fix(live): placar com caixas e digitos de largura fixa                      F1
ffdee47 feat(gameday): seletor de data e hora                                       F4
364df71 test(gameday): calendario do seletor
30edfdc feat(profile): aviso ao sair sem salvar                                     F3
e7c7be1 feat(profile): foto ampliada e troca so ao salvar
0a23209 test(profile): regras do aviso de saida
7fbba6d feat(story): novo cartao de desempenho                                      F6
607acf5 test(story): destaque e selos do cartao
cd93614 feat(gameday): chave pix obrigatoria                                        F8
1d8e5e1 feat(gameday): iniciar pelada antes do painel                               F7
3e966f4 test(gameday): ciclo de vida da pelada
a3bc8a5 feat(gameday): status cancelada                                             F10
90b9d4b feat(gameday): cancelar pelada nas configuracoes
967ae57 test(gameday): cancelar e encerrar
a6a873d feat(registration): comprovante enviado so ao confirmar a inscricao         F9
```

Com D10 = B, o commit `feat(stats): campanha do jogador na pelada` não existe. O F3 tem o aviso de saída antes da foto porque `ProfileForm` usa os dois; o desenho do plano (foto primeiro) não compilaria no meio.

`npm run typecheck` limpo e `npm test` com 353 testes passando (eram 293).

## 3. Cenários BDD por funcionalidade

Tudo foi percorrido em 375×812, no Chromium do navegador embutido, com o app rodando no host contra o Postgres do `docker-compose.dev.yml`.

| F | Capturas | Verificado | Não verificado ou verificado de outro jeito |
| --- | --- | --- | --- |
| F1 | `f1-placar-pausada.png` | Início, pausa, retomada, último minuto (vermelho), 9 → 10 gols (colunas, botão "Substituição" e caixa do placar não se mexem), fonte com algarismos proporcionais, leitura "07:42" | Leitor de tela só pelo DOM (texto único em `sr-only`, células `aria-hidden`); não testei com TalkBack/VoiceOver |
| F3 | `f3-foto-pendente`, `f3-zoom-foto`, `f3-descartar-alteracoes` | Zoom (Esc, X, fora), sem foto não abre nada, trocar foto sem enviar, desfazer, PDF, falha no envio, PUT que falha depois do envio (a retentativa não reenvia a foto), Cancelar com e sem alteração, saída pelo link da tab bar e do menu, logout, Ctrl+clique, depois de salvar a saída é livre, onboarding (conta de teste criada: a foto só sobe em "Salvar e entrar") | Recarregar a aba: disparei o evento `beforeunload` e vi `defaultPrevented`, mas não o diálogo nativo; Ctrl+clique idem, com evento sintético |
| F4 | `f4-folha-data` | Campo vazio, escolher dia/hora, mês seguinte (começa no domingo), Hoje e Amanhã, dias passados bloqueados, fechar sem confirmar, salvar sem data (sem requisição), corpo enviado `"scheduledAt":"2026-11-05T19:30"`, edição sem mexer mantém 16:07 (o 07 aparece como 13º minuto, e o dia gravado, passado, fica selecionável) | O plano parte de "hoje = 20/10"; testei no dia real (30/10), com as mesmas regras |
| F5 | `f5-padroes` | 8 e 4 no formulário, 480 s e 4 por time gravados, edição de pelada antiga não muda | |
| F6 | `f6-story.png`, `f6-story-*.jpg`, `f6-modal-compartilhar` | Prévia no modal, selos MVP e Artilheiro, "PARTIDAS JOGADAS" sem "0%", invicto, nome comprido, sem foto (iniciais), faixas do Instagram (`*-faixas.jpg`: nada importante fora de y = 250 a 1670), fluxo real pelo botão com um jogador do seed | "Mesma cara em qualquer celular": só vi no Chromium/Linux; a fonte que não carrega em 1,5 s é só lógica (não simulei) |
| F7 | `f7-iniciar-pelada`, `f7-modal-iniciar-pelada`, `f7-acompanhar-desabilitado` | Organizador vê "Iniciar pelada" e não o painel, Cancelar não muda nada, Iniciar leva ao painel com a partida 1 "Pronta para começar", depois só "Abrir painel ao vivo", jogador vê o botão desabilitado com a frase (clicar não navega) e habilitado quando a pelada está `LIVE`, painel e tela ao vivo antes do início voltam para a pelada, `START` da partida antes disso dá 409, times travados ao iniciar, 403 para jogador | Dois organizadores: simulei com duas requisições paralelas (as duas ok, uma `alreadyStarted`, uma entrada de auditoria) |
| F8 | `f8-pix-obrigatoria` | Campo `required`, servidor recusa sem chave ou só com espaços (`details.pixKey`), editar sem chave recusa, chave da última pelada do mesmo organizador vem preenchida, sem pelada anterior vem vazia | O servidor responde 422 (padrão do app para validação), não 400 como o plano escreve |
| F9 | `f9-previa-comprovante`, `f9-comprovante-preparado` | Prévia só abre com arquivo válido, Cancelar/Esc/Confirmar, linha com olho e X, mesmo arquivo de novo depois do X, PDF, 8 MB, PIX sem comprovante, nenhuma requisição até "Confirmar inscrição", envio + POST, falha do POST depois do envio (a retentativa não reenvia), "No local" com comprovante preparado não envia nada (conferi o disco) | |
| F10 | `f10-cancelar-pelada`, `f10-pelada-cancelada`, `f10-jogador-pelada-cancelada` | Sem "Encerrar" com inscrições abertas, times definidos e LIVE sem apito (página e painel); cancelar pelas configurações (Voltar não muda; Cancelar mesmo apaga times, reservas e partida e mantém as 20 inscrições); página da cancelada para organizador e para jogador com PIX; inscrição recusada; some da "próxima pelada" e fica por último em `/game-days`; depois do primeiro apito "Encerrar" aparece e "Cancelar" some (cancel dá 409); finish antes do apito dá 409 sem tocar em `ratedAt` nem na auditoria; PATCH 409; finish depois do apito aplica o MMR (`RATING_APPLIED`, 8 `RatingChange`); cancelada fica com `ratedAt` nulo, sem `RatingChange` e sem auditoria de MMR | A recomputação do MMR pelo painel do sistema não foi acionada (nenhuma pelada cancelada entra nela por construção: lê só `FINISHED`) |

## 4. Medidas, PNGs e SQL

### F1: `getBoundingClientRect()` (x e largura em px, 375 px de largura)

| Estado | Antes (time A \| relógio \| time B) | Depois |
| --- | --- | --- |
| Pronta para começar | 33 / 95,3 \| 136,3 / 102,3 \| 246,7 / 95,3 | 33 / 86,5 \| 127,5 / 120 \| 255,5 / 86,5 |
| Em andamento | 33 / 109 \| 150 / 75,1 \| 233 / 109 | 33 / 86,5 \| 127,5 / 120 \| 255,5 / 86,5 |
| Pausada | 33 / 109 \| 150 / 75,1 \| 233 / 109 | 33 / 86,5 \| 127,5 / 120 \| 255,5 / 86,5 |
| Último minuto (vermelho) | não medi antes | 33 / 86,5 \| 127,5 / 120 \| 255,5 / 86,5 |

O diagnóstico do plano se confirmou: o time B andava de x = 246,7 para 233 ao iniciar a partida. Com uma fonte de algarismos proporcionais (Georgia, `proportional-nums`) injetada, as células do relógio ficaram em x = 145,5 / 164,1 / 182,7 / 192,3 / 210,9 de "01:02" a "00:57". O placar 10 a 5: coluna do time A, botão "Substituição" (x = 170,7, largura 127,3) e caixa do placar do cartão (x = 306, largura 40) iguais a 9 a 5.

### F6

`f6-story.png` (1080×1920, com foto, MVP e Artilheiro), mais três em JPEG (`sem-foto-sem-gols`, `textos-longos`, `invicto`) e as quatro conferências das faixas (`*-faixas.jpg`, 540×960, com o topo e a base pintados).

### F10: migration `20261030202237_gameday_canceled`

```sql
-- AlterEnum
ALTER TYPE "GameDayStatus" ADD VALUE 'CANCELED';

-- AlterTable
ALTER TABLE "GameDay" ADD COLUMN     "canceledAt" TIMESTAMP(3);
```

Criada com `prisma migrate dev --create-only` e aplicada com `migrate deploy` no banco de dev (fiz `pg_dump` antes).

## 5. Decisões minhas

- **Datas sem `Intl`:** nomes de dia e mês em listas fixas pt-BR. O formato do `Intl` muda de navegador para navegador ("qui." / "qui"). O plano dá "Qui, 23 de out." como exemplo, mas 23/10/2026 é sexta; o código calcula o dia da semana de verdade (22/10 é quinta) e os testes usam 22.
- **`DateTimePicker`** sobe o modal num portal para o `body`: o `Field` é um `<label>`, e um clique no fundo do modal reativaria o botão do campo. O rodapé "Confirmar" é `sticky -bottom-4` (o fundo do `Modal` tem `p-4`).
- **`FixedDigits`** usa um texto `sr-only` com o valor inteiro (e as células `aria-hidden`) em vez de `aria-label` num `span`, que leitores de tela ignoram.
- **Aviso de saída:** o link segurado é refeito com um clique no próprio `<a>` (o `<Link>` navega e o menu do celular fecha pelo `onClick` dele; com `router.push` o menu ficava aberto). O `DiscardChangesModal` vai num portal: o menu do celular (z-50, depois do `<main>`) cobria o modal.
- **`NEW_GAMEDAY`** foi para `src/lib/gameday-defaults.ts`. Com o spread `{ ...NEW_GAMEDAY, pixKey }` num Server Component, o valor vindo de um módulo `"use client"` chegava vazio (a mesma armadilha do `profile-defaults.ts`).
- **Fonte do story:** a checagem de "carregou" olha só a família principal. A face de fallback que o `next/font` acrescenta (`local(Arial)`) dá erro em Linux sem Arial e derrubava tudo para `system-ui`.
- **`startGameDay`:** ajuda `getGameDayStatus` (consulta leve) e `canWatchLive` para o redirect do painel e da tela ao vivo. `cancelGameDay` confere de novo o primeiro apito dentro da transação.
- **F10:** `assertTeamsEditable` responde "A pelada foi cancelada." quando for o caso (em vez de "já começou"). A engrenagem some da página da cancelada, e a edição redireciona para a página.
- **`LivePanel`:** o "Fim de papo" usa `canFinish` com o `matchStarted` tirado do snapshot (`lastFinished` ou partida fora de `SCHEDULED`).
- **Commits:** autor `Gabriel Mizael <gabriel.sousa@dcx.ufpb.br>` (o dos últimos commits do repositório) passado por variável de ambiente, porque este computador não tem identidade git configurada. Nenhuma configuração foi gravada.

## 6. Limitações conhecidas

- O `next build` precisa baixar a Barlow Condensed uma vez (D11); sem internet no build, falha.
- Os itens da seção 15 do plano seguem fora: fuso de `scheduledAt`, foto antiga e órfã no bucket, "Remover foto", aviso em outros formulários, página da pelada sem SSE, desfazer "Iniciar", reabrir cancelada, converter as já encerradas sem partida, e-mail e devolução de PIX, comprovantes órfãos.
- Dois efeitos do F7 que o plano já previa: depois de "Iniciar pelada" os times não se refazem mais (D15 = A), e a pelada `LIVE` sem partida só tem a saída "Cancelar" (D19 = B).
- Não rodei nenhum teste em celular de verdade nem em Safari.

## 7. Sugestões

1. Plano próprio para o fuso de `scheduledAt` (hoje 19:00 vira 16:00 em Brasília nas telas renderizadas no navegador).
2. Apagar a foto antiga do bucket ao trocar, e o botão "Remover foto".
3. Atualizar a página da pelada pelo SSE quando o organizador inicia ou cancela.
4. Script para marcar como `CANCELED` as peladas antigas encerradas sem partida.
5. Teste de ponta a ponta (Playwright) para o ciclo `OPEN` → `TEAMS_SET` → `LIVE` → `FINISHED`/`CANCELED`: hoje a regra está em módulos puros e em serviços, mas o fluxo todo só foi conferido à mão.
