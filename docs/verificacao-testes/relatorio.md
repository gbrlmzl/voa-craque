# Relatório de execução: testes automatizados (Jest + Cypress)

Execução de [plano-testes-automatizados.md](../plano-testes-automatizados.md) na branch `test/suite-jest-cypress`.
Como rodar e escrever: [guia-de-testes.md](../guia-de-testes.md).

## 1. Decisões aplicadas (D1 a D10) e desvios

Todas as decisões marcadas com `[x]` no plano eram a opção A; todas foram aplicadas.

| Decisão | Aplicada | Desvio ou observação |
| --- | --- | --- |
| **D1** migrar o Vitest | Os 23 arquivos foram para `tests/unit` sem mudar asserção; `vitest` e `vitest.config.ts` saíram. | `vi.stubEnv`/`unstubAllEnvs` viraram `tests/helpers/env.ts`. O `expect(valor, mensagem)` do Vitest não existe no Jest (3 usos em `mmr.test.ts`). Quatro arquivos estavam com CRLF no working tree e foram normalizados para LF. |
| **D2** Jest em CommonJS | Spike aprovado: `@/lib/prisma` faz `SELECT 1` no banco do worker. | Além do transform de `import.meta.url` (`tests/setup/transform-import-meta.cjs`) e do `transformIgnorePatterns` do plano, o runtime do Prisma 7 carrega o compilador de queries com `import()` dinâmico de um `.mjs`; um `moduleNameMapper` troca `query_compiler_fast_bg.<db>.mjs` pelo `.js` que o pacote já publica. |
| **D3** banco por worker | `db-test` (porta 55433, `tmpfs`), template `voacraque_test`, um banco por worker, `TRUNCATE` no `beforeEach`. | `db-global.ts` recusa banco que não termine em `_test` (testado em `tests/unit/db-guard.test.ts`). |
| **D4** limite de cobertura | Limites por pasta da seção 5.3 no `jest.config.ts` e total 70/65/60. | O Jest tira do `global` o que casa com um limite de pasta, então o total do projeto inteiro é conferido por `scripts/check-coverage.mjs` (roda depois do Jest em `test:ci` e `test:coverage`). |
| **D5** Cypress fora da cobertura | Aplicada. | — |
| **D6** Jest para componente, Cypress CT para ~10 | 10 specs de CT (47 testes + 1 `it.skip`). | Ver "Lacunas de acessibilidade". |
| **D7** login programático | `cy.entrarComo` + task `sessao`, sem rota de backdoor. | O plano validava a sessão com `GET /api/profile`, que não existe (a rota só tem `PUT`); a validação usa `GET /api/game-days` e aceita qualquer status diferente de 401 (em manutenção a API responde 403 a sessão válida). |
| **D8** E2E contra a imagem do deploy (B) | `cypress-e2e` constrói a imagem do `Dockerfile` da raiz (amd64) com cache GHA próprio, sobe `docker-compose.e2e.yml` (app + Postgres `voacraque_e2e`) com `up --wait`, roda o Cypress e derruba a stack com `down -v` (`if: always()`); log do app anexado em falha. Local: `npm run test:e2e` (`scripts/e2e.mjs`). | Decisão alterada de A para B depois da primeira entrega. O container não lê `.env`/`.env.e2e` (variáveis do compose, S3/SMTP/Google vazios) e `.dockerignore` passou a excluir `.env.*`. O `Dockerfile` ganhou `sed` que tira CRLF do `entrypoint.sh` (checkout Windows derrubava o container com 127). Saíram `build:e2e`, `start:e2e`, `e2e:db` e a dependência `start-server-and-test`; `scripts/with-env.mjs` ficou (carrega o `.env.e2e` para o compose e para o `docker compose` do CI sem sobrescrever o `AUTH_SECRET` do job). Medido local: imagem + subida ~30 s com cache, 61/61 verdes em ~2m47, `test:e2e` completo 3m30. O tempo do CI com build frio (~5 min previstos) não foi medido. |
| **D9** `mockFetch` + mock de Server Actions | Aplicada. | O jsdom não traz `Response`: `fetch-mock.ts` devolve uma resposta mínima (`ok`, `status`, `json()`, `text()`, `blob()`). |
| **D10** tudo em `tests/` | Aplicada (`unit`, `component`, `integration`, `helpers`, `setup`). | — |

Outros desvios do plano:

- **CI:** `ci.yml` não escuta `push` na `main`: o `deploy.yml` já o chama (`workflow_call`) e escutar nos dois rodaria a suíte duas vezes.
- **`GET /api/game-days` com visitante:** o plano esperava "visitante lista quando o site é aberto"; a rota exige usuário (401 sempre) e as páginas públicas leem direto do banco. O teste cobre o comportamento real.
- **Rotas inexistentes:** `GET`/`DELETE /api/game-days/[id]` e `GET /api/profile` não existem; só o que existe foi testado.
- **Upload inválido:** a rota devolve 400 (o plano dizia 422).
- **Aviso de descartar alterações:** o plano punha em `organizador-pelada`, mas só `ProfileForm` usa `useLeaveGuard`; o caso está em `perfil.cy.ts`.
- **Cypress CT:** o `webpackConfig.resolve.alias` é ignorado com `framework: "next"`; as Server Actions são trocadas por `NormalModuleReplacementPlugin` (webpack que o próprio Next traz). O style-loader do Next precisa de `<noscript id="__next_css__DO_NOT_USE__">` no `component-index.html`.
- **Cypress em navegador sem janela pintando (Electron):** `requestAnimationFrame` não dispara e o streaming do Next nunca revela a página (a `<div hidden>` do Suspense fica escondida). O `cypress/support/e2e.ts` troca `requestAnimationFrame` por timer; as animações CSS ficam desligadas no CT e no E2E. Localmente o E2E também roda com `--headed`; o Chrome do CI não precisa disso.
- **`tsconfig`:** o Cypress traz `expect` do chai, que colide com os tipos do Jest; `cypress/` e `cypress.config.ts` saem do `tsconfig.json` e têm o próprio (`cypress/tsconfig.json`); `npm run typecheck` roda os dois.

## 2. Tabela de progresso (11.2) e cobertura por pasta

| Momento | Statements | Branches | Functions | Lines | Suites | Testes |
| --- | --- | --- | --- | --- | --- | --- |
| Linha de base (23 testes migrados + spike) | 19,11% | 17,82% | 19,08% | 18,27% | 24 | 423 |
| Fim da Fase 2 (integração) | 54,33% | 46,31% | 47,50% | 54,44% | 53 | 741 |
| Fim da Fase 3 (unitário; `story-card` ainda sem teste) | 56,04% | 47,81% | 49,24% | 55,96% | 61 | 842 |
| Fim da Fase 4 (componentes) | 95,37% | 88,21% | 96,04% | 97,33% | 73 | 1120 |
| **Final** | **95,93%** | **88,43%** | **96,83%** | **97,92%** | **76** | **1135** |

A meta do plano era ≥ 70%; a projeção da seção 5.4 era ~72%. O resultado ficou bem acima porque o mock de
`next/headers`/`after()` permite testar rotas, actions, proxy e componentes inteiros com o código real, e o
denominador continua honesto (todo `src/`, menos `page|layout|loading.tsx` e `generated`).

| Pasta | Statements | Branches | Functions | Lines | Limite de linhas / branches |
| --- | --- | --- | --- | --- | --- |
| `src/actions` | 98,3% | 98,1% | 100% | 98,8% | 80 / 70 |
| `src/app/api` (em `src/app`) | 91,6% | 85,3% | 97,6% | 98,1% | 75 / 60 |
| `src/components` | 98,1% | 95,2% | 96,5% | 98,6% | 55 / 45 |
| `src/hooks` | 95,7% | 81,1% | 97,9% | 98,2% | 70 / 55 |
| `src/lib` | 97,0% | 91,2% | 96,8% | 97,6% | 85 / 75 |
| `src/lib/auth` | 95,8% | 91,2% | 98,6% | 96,9% | 90 / 80 |
| `src/lib/mail` | 100% | 75,0% | 100% | 100% | (dentro de `src/lib`) |
| `src/proxy.ts` | 98,3% | 98,2% | 100% | 100% | (total) |
| `src/services` | 94,1% | 77,6% | 94,6% | 97,2% | 75 / 60 |

Tamanho da suíte: **Jest** 76 suites e 1135 testes (unit 31/519, component 13/285, integration 32/331);
**Cypress CT** 10 specs, 47 testes (+1 pulado); **Cypress E2E** 13 specs, 61 testes.

## 3. Arquivos abaixo do limite da pasta

Nenhum arquivo ficou abaixo do limite da própria pasta. Os de menor cobertura de linhas:

- `src/lib/storage.ts` (69%): os ramos do driver S3 (`saveToS3`, `signedS3Url`, leitura no bucket) ficam sem teste de propósito; o plano deixa S3 real fora do escopo. Os ramos puros (local, limites, erros de configuração) estão cobertos.
- `src/lib/preferences.ts` (75%): o `catch` de `getTeamLabelModePromise` (falha ao ler o cookie) não é exercitado.

## 4. Bugs e lacunas encontrados pelos testes

Nada foi corrigido no app (seção 12 do plano). Cada item tem o teste que o prova.

| # | Achado | Prova | Situação |
| --- | --- | --- | --- |
| 1 | **Não dá para tirar a nota de um jogador.** `starsSchema` usa `z.union([z.coerce.number(), z.null()])` e a coerção engole o `null` (`Number(null) = 0`), que a faixa 1..5 recusa: `PATCH /api/players/[id]/evaluation` com `{ "stars": null }` responde 422 e o ramo "tirar a nota" da rota nunca roda. | `tests/integration/api/players.test.ts` (`it.failing`) e `tests/unit/validation.test.ts` | Aberto. O botão "sem nota" da tela dá erro. |
| 2 | **Encerrar pelada duas vezes ao mesmo tempo:** o segundo pedido recebe o erro cru do Prisma (`P2025` em `deleteScheduledMatch`) e, pela rota, 500, em vez do 409 "Esta pelada já foi encerrada." O MMR é aplicado uma vez só (o requisito de dados está garantido). | `tests/integration/api/game-day-lifecycle.test.ts` ("dois pedidos ao mesmo tempo") | Aberto, baixa gravidade. |
| 3 | **`getSystemSettings` corre quando a linha `global` não existe:** duas requisições simultâneas tentam criá-la e uma falha com violação de unicidade. Em produção a linha existe (seed). | Contornado em `game-day-lifecycle.test.ts` com `ensureSettings()`. | Aberto, baixa gravidade. |
| 4 | **"Encerrar partida" na mão grava empate mesmo com placar parcial** (1 x 0 vira `DRAW`): `evaluateOutcome` devolve `result: null` e o serviço usa `?? "DRAW"`. | `game-day-lifecycle.test.ts`, `match-state.test.ts` | A confirmar se é a regra desejada. |
| 5 | `scheduledAt` inválido na API sai com a mensagem do zod em inglês ("Invalid date"): o `message` de `z.coerce.date()` só vale para tipo errado. | `tests/unit/validation.test.ts` | Aberto, cosmético. |
| 6 | **O delta de MMR da tabela do ranking está dentro de um comentário JSX:** nem o organizador vê os pontos da última pelada. | `tests/component/shell/shell.test.tsx` (`RankingTable`) afirma a ausência | A confirmar (desligado de propósito?). |
| 7 | **Lacunas de acessibilidade em `Modal` e `PhotoLightbox`:** não levam o foco ao diálogo, não prendem o `Tab` e não travam a rolagem do `body`; o lightbox não devolve o foco ao botão que o abriu. O plano (7.1) esperava esses comportamentos. | `cypress/component/PhotoLightbox.cy.tsx` (`it.skip` descrevendo o esperado) | Aberto. |
| 8 | `Field` embrulha o campo, a dica e o erro no mesmo `<label>`: o nome acessível do campo inclui o texto da dica/erro. | Consultas por `getByLabelText(/^Nome/)` nos testes de UI | Cosmético. |

Observação de ambiente: o E2E não é repetível indefinidamente contra o mesmo servidor, porque os limitadores de taxa
vivem na memória dele (o pedido de link de redefinição, por exemplo, permite 5 por hora por IP). `npm run test:e2e`
sobe um servidor novo a cada execução.

## 5. Tempos e tamanho da suíte

Medidos nesta máquina (os jobs do GitHub Actions não puderam ser cronometrados daqui: o workflow só roda no GitHub):

| Etapa | Tempo |
| --- | --- |
| `npm test` completo (3 projetos, 4 workers) | ~13 s |
| `npm run test:coverage` | ~15 s |
| Integração com `--maxWorkers=1` / `4` | 33 s / 12 s (mesmo resultado: 331 testes) |
| `cypress run --component` (10 specs) | ~9 s de execução (mais a compilação do webpack) |
| `npm run test:e2e` (migrations + `next build` + 13 specs) | 2 min 15 s de execução dos specs; o build soma cerca de 2 minutos |

Verificações extras da seção 11.3, todas feitas: `npm test` com o `.env` real desta máquina (`STORAGE_DRIVER=s3`) não
criou arquivo em `uploads/` (24 antes, 24 depois) e `tests/unit/db-guard.test.ts` prova o zeramento de
S3/SMTP/Google; integração duas vezes seguidas e com 1 e 4 workers deram o mesmo resultado; cada uma das 13 specs
E2E passou sozinha (`cypress run --spec`), sem retentativa.

## 6. Retentativas no E2E

Nenhum teste precisou de retentativa nas execuções completas (`retries.runMode: 2` não foi acionado) nem nas
execuções isoladas, desde que cada rodada use um servidor novo (ver o aviso da seção 4).

## 7. Lembrete: proteção da `main` (8.3, configuração manual)

Em *GitHub → Settings → Branches → main*: exigir pull request e os checks `static`, `jest`, `cypress-component` e
`cypress-e2e`. O plano não faz isso por API.
