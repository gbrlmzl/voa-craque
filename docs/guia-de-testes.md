# Guia de testes

Como rodar, como escrever e o que cada camada cobre. A especificação que originou esta suíte
está em [plano-testes-automatizados.md](plano-testes-automatizados.md); o resultado da execução,
em [verificacao-testes/relatorio.md](verificacao-testes/relatorio.md).

## Mapa

```
Jest (npm test)  ─────────────────────── conta para a cobertura
├── unit         node   tests/unit/**/*.test.ts         sem banco, sem rede
├── component    jsdom  tests/component/**/*.test.tsx   RTL + user-event, fetch mockado
└── integration  node   tests/integration/**/*.test.ts  Postgres real, rotas, services, actions, proxy

Cypress ──────────────────────────────── critério de aprovação, não de cobertura
├── component    cypress/component/**/*.cy.tsx          navegador real (CSS, foco, canvas, viewport)
└── e2e          cypress/e2e/**/*.cy.ts                 imagem Docker do deploy em :3100 + Postgres voacraque_e2e
```

## Rodar

| Comando | O que faz |
| --- | --- |
| `npm run test:db:up` / `test:db:down` | Sobe/derruba o Postgres dos testes (`db-test`, porta 55433, em `tmpfs`) |
| `npm test` | Os três projetos do Jest (precisa do `db-test`) |
| `npm run test:unit` | Unitário + componente, sem banco (o dia a dia) |
| `npm run test:integration` | Só integração |
| `npm run test:coverage` | `jest --coverage` e a conferência do total (`scripts/check-coverage.mjs`) |
| `npm run test:ci` | Como o CI: `--ci --coverage --maxWorkers=50%` |
| `npm run cy:component` | Cypress Component Testing |
| `npm run test:e2e` | Constrói a imagem do deploy, sobe app + banco (`docker-compose.e2e.yml`), roda `cypress run --e2e` e derruba tudo (mostra o log do app se falhar) |
| `npm run e2e:up` / `e2e:down` / `e2e:logs` | Sobe, derruba (apaga o banco) e lê o log da stack do E2E, para usar com `cy:open` ou `cy:run` |
| `npm run cy:open` | Cypress interativo (rode `e2e:up` antes para o E2E) |

Um spec isolado: `npx jest tests/unit/mmr` (o padrão vem **antes** de `--selectProjects`, que consome os
argumentos seguintes), `npm run test:e2e -- --spec cypress/e2e/times.cy.ts` (os argumentos vão para o `cypress run`).

O E2E exige Docker. A imagem é a mesma do deploy (o `Dockerfile` da raiz, em amd64 no runner; o deploy publica a
arm64): `next build`, entrypoint com `migrate deploy` e seed, `next start`. O primeiro build leva alguns minutos; as
camadas ficam em cache, mas qualquer mudança em `src/` refaz o `next build`. Para iterar só nos specs, deixe a stack
no ar (`npm run e2e:up` uma vez, depois `cy:open` ou `cy:run` quantas vezes quiser) e rode `e2e:down` no fim. O banco
do E2E (`db` do compose) publica a porta 55434 e é independente do `db-test` do Jest (55433); os dois podem estar no ar.

Em máquina Linux com desktop, rode o E2E com `--headed`; o Electron sem janela visível pinta
nada e o Cypress espera a página para sempre (o suporte já troca `requestAnimationFrame` por timer
para o streaming do Next revelar a página, mas o visual só é confiável com janela). No CI o Chrome
cuida disso.

## Convenções

1. **Troféu, não pirâmide.** O maior retorno está na integração (rota + service + Prisma + Postgres): é onde mora a
   regra de negócio. Unitário para lógica pura e densa; E2E para as jornadas principais.
2. **Comportamento, não implementação.** Asserte o que o usuário vê (texto, papel, URL) ou o que a API devolve
   (status, JSON, linhas no banco).
3. **Queries por papel e rótulo** (`getByRole`, `getByLabelText`; `findByRole` no Cypress via
   `@testing-library/cypress`). `data-cy` só onde não há nome acessível.
4. **Arrange / Act / Assert**, um comportamento por `it`, nome em português descrevendo a regra.
5. **Determinismo.** Datas fixas, `now` explícito nos services (`syncMatchClock(gameDayId, now)`), fake timers só
   onde não há I/O. Nada de `sleep` nem `cy.wait(ms)`: espere por asserção ou por alias de rede.
6. **Isolamento.** Cada arquivo de integração começa com o banco vazio; cada spec E2E, com o cenário do zero.
   A limpeza roda no `beforeEach`, nunca no `after`.
7. **Mockar só a fronteira.** Integração: Postgres real; mock de Google (arctic), e-mail (`mailbox`) e relógio.
   Componente: `fetch` e Server Actions. Nunca o módulo que está sendo testado.
8. **Cobertura é termômetro.** Denominador honesto (todo `src/`, exceto `page|layout|loading.tsx` e `generated`)
   e limites por pasta no `jest.config.ts`.
9. **Teste instável é bug.** Retentativa só no E2E em modo CI (`retries.runMode: 2`); quem precisou dela vira issue.

## Banco dos testes

`tests/setup/db-global.ts` aplica as migrations no banco-modelo `voacraque_test` e cria um banco por worker do
Jest (`voacraque_test_<n>`). `tests/setup/db-reset.ts` faz `TRUNCATE ... RESTART IDENTITY CASCADE` antes de cada
teste. O `globalSetup` aborta se o nome do banco não terminar em `_test`.

## Helpers (`tests/helpers`)

| Helper | Uso |
| --- | --- |
| `factories.ts` | `createUser`, `createPlayer`, `createAdmin`, `createSuperadmin`, `createGameDay`, `registerPlayers`, `createTeams`, `startLiveGameDay`, `finishGameDay`, `scoreGoals`... Dados únicos por contador. As de pelada montada usam os services reais. |
| `session.ts` | `actAs(user)` / `asVisitor()` (cookie de sessão no jar falso de `next/headers`), `cookieWrites()` |
| `route.ts` | `callRoute(handler, { method, path, body, params })` monta o `NextRequest` e devolve `{ status, json, headers }`; `readSse(response, n)` |
| `actions.ts` | `formData({...})`, `redirectOf(promise)` (o destino de um `redirect()`) |
| `next-env.ts` | Estado dos mocks de `next/headers` e `after()`: `flushAfter()`, `mailbox`, `setRequestHeader` |
| `mail.ts`, `logs.ts` | `lastResetLink()`, `securityEvents()` |
| `google.ts` | Mock do `arctic`: `googleMock.idToken`, `googleIdToken(claims)` |
| `fetch-mock.ts` | `mockFetch({ "POST /api/x": { status, body } })`; chamada não prevista falha o teste |
| `render.tsx` | `renderWithProviders(ui, { user, teamLabelMode })` com todos os providers |
| `fake-event-source.ts`, `fake-canvas.ts` | `EventSource` controlável e contexto 2D falso para o jsdom |
| `fixtures/` | `foto.jpg` (3000×2000), `comprovante.png`, `nao-imagem.txt`; o Cypress usa a mesma pasta |

IP por teste: o `x-forwarded-for` muda a cada teste, porque os limitadores de taxa vivem em memória no processo.

## Escrever um teste de integração

```ts
import { POST } from "@/app/api/game-days/[id]/registrations/route";
import { callRoute } from "../../helpers/route";
import { createGameDay, createPlayer } from "../../helpers/factories";
import { actAs } from "../../helpers/session";

it("inscreve no local", async () => {
  const gameDay = await createGameDay();
  await actAs(await createPlayer());
  const res = await callRoute(POST, { method: "POST", params: { id: gameDay.id }, body: { paymentMethod: "ON_SITE" } });
  expect(res.status).toBe(200);
});
```

Server Actions: `await loginAction({}, formData({ username, password }))`; `redirect()` vira exceção, use
`redirectOf(promise)`. O que a action agenda com `after()` só roda em `await flushAfter()`.

## E2E: cenários e sessão

- O banco do E2E é `voacraque_e2e` (`.env.e2e`, visto do host em `localhost:55434`). O container do app não lê `.env.e2e`
  nem `.env`: recebe as variáveis do `docker-compose.e2e.yml` (S3, SMTP e Google vazios; `.dockerignore` também deixa
  `.env.*` fora da imagem). O `AUTH_SECRET` é o mesmo para o container e para as tasks, que assinam a sessão. `cy.cenario("pelada-aberta")` zera e semeia pelas fábricas
  (`cypress/tasks/cenarios.ts`); devolve `{ gameDayId }`.
- Cenários: `base`, `pelada-aberta`, `pelada-lotada`, `times-definidos`, `ao-vivo`, `encerrada`, `site-privado`,
  `manutencao`. Para um novo, acrescente a função em `cenarios.ts`, o nome no tipo `Cenario` e no `switch`.
- `cy.entrarComo("jogador01")` grava os cookies emitidos pelas funções reais de `src/lib/auth`, sem passar pelo
  formulário (o `loginLimiter` permite 8 falhas por IP a cada 15 minutos). Só `autenticacao`, `recuperar-senha` e
  `site-publico` usam o formulário.
- `cy.task("sql", "select ...")` é só leitura. `cy.task("linkRedefinicao", email)` devolve o link da redefinição
  (o E2E não lê e-mail).
- Todas as tasks recusam rodar se o banco não terminar em `_e2e`.
- Os limitadores de taxa vivem na memória do servidor. Rodar o mesmo spec muitas vezes contra o **mesmo** servidor
  (por exemplo `recuperar-senha`, que pede link 1 vez por tentativa; o limite é 5 por hora por IP) acaba em
  "Muitas tentativas" e parece teste quebrado. `npm run test:e2e` sobe um container novo a cada execução; ao rodar
  specs soltos com `cy:run`, faça `npm run e2e:down && npm run e2e:up` de vez em quando.

## Cypress Component Testing

`cy.mount(<Componente />, { user, teamLabelMode, pathname })` envolve nos providers e num router falso
(`@push`, `@refresh`...). As Server Actions são trocadas por stubs no webpack (`cypress.config.ts`). O CSS entra com
`globals.css`; animações ficam desligadas (o Electron sem janela não avança quadros). Use `cy.pressEscape()` para o
Esc (o evento nasce no `<body>`, como no navegador).

## CI

`.github/workflows/ci.yml` (jobs `static`, `jest`, `cypress-component`, `cypress-e2e`) roda em todo pull request e é
chamado pelo `deploy.yml`: `build` e `deploy` dependem dos quatro. O `jest` usa Postgres como service container; o
`cypress-e2e` constrói a imagem do deploy (amd64, `docker/build-push-action` com cache GHA próprio), sobe
`docker-compose.e2e.yml` com `--wait`, roda o Cypress e derruba a stack (`if: always()`), anexando o log do app aos
screenshots e vídeos em caso de falha. O `AUTH_SECRET` é gerado no job e nenhum job tem credencial AWS. Em *Settings → Branches → main*, exija PR e os quatro
checks (configuração manual).
