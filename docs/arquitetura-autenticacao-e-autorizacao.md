# Arquitetura de autenticação e autorização — CRONOS

Documento descritivo do módulo de **autenticação** (quem é você) e **autorização** (o que você pode
fazer) do CRONOS, atravessando os três repositórios: `-front` (Next.js), `-api` (Express + Prisma) e
o desenho de borda do `-deploy`.

> **Escopo:** descreve o sistema **como ele está implementado hoje** (03/09/2026). Não é proposta.
> Cada afirmação aponta o arquivo e a decisão (`SEC-xx`, `D-xx`, `RN-xxx`) que a sustenta.

---

## Índice

1. [O mapa em uma tela](#1-o-mapa-em-uma-tela)
2. [As sete decisões que definem o módulo](#2-as-sete-decisões-que-definem-o-módulo)
3. [Peças e responsabilidades](#3-peças-e-responsabilidades)
4. [Modelo de dados da sessão](#4-modelo-de-dados-da-sessão)
5. [Fluxo A — o primeiro clique de quem não está logado](#5-fluxo-a--o-primeiro-clique-de-quem-não-está-logado)
6. [Fluxo B — o login](#6-fluxo-b--o-login)
7. [Fluxo C — navegar logado e renovar a sessão](#7-fluxo-c--navegar-logado-e-renovar-a-sessão)
8. [Fluxo D — uma ação autorizada: cadastrar despesa](#8-fluxo-d--uma-ação-autorizada-cadastrar-despesa)
9. [O modelo de autorização em cinco camadas](#9-o-modelo-de-autorização-em-cinco-camadas)
10. [Fluxos secundários](#10-fluxos-secundários)
11. [Defesas transversais](#11-defesas-transversais)
12. [Ciclo de vida da sessão: o que mata o quê](#12-ciclo-de-vida-da-sessão-o-que-mata-o-quê)
13. [Limites conhecidos e trade-offs assumidos](#13-limites-conhecidos-e-trade-offs-assumidos)
14. [Onde os testes cobrem cada parte](#14-onde-os-testes-cobrem-cada-parte)

---

## 1. O mapa em uma tela

Existem **três processos** no caminho de qualquer requisição autenticada, e o navegador só fala com
o primeiro deles:

```
┌───────────┐   https://dominio         ┌──────────────────────────────┐        ┌─────────────────┐
│ Navegador │ ────────────────────────► │  FRONT — Next.js (Node)      │        │  API — Express  │
│           │                           │                              │        │                 │
│ cookies:  │   /login, /dashboard/*    │  ① src/proxy.ts (middleware) │ ──────►│  requireAuth    │
│  JWT      │ ─────── páginas ────────► │  ② layout + Server Components│ fetch  │  services       │
│  REFRESH  │                           │     (lib/apiClient.ts)       │ server │  Prisma         │
│           │   /api/*                  │  ③ app/api/[...path]/route.ts│ ─────► │                 │
│           │ ─────── XHR ────────────► │     (proxy same-origin)      │        └────────┬────────┘
└───────────┘                           └──────────────────────────────┘                 │
                                                                                 ┌───────▼────────┐
                                                                                 │   PostgreSQL   │
                                                                                 │ User, Refresh  │
                                                                                 │ Token,         │
                                                                                 │ Membership...  │
                                                                                 └────────────────┘
```

Três entradas no front, com papéis diferentes:

| # | Caminho | Quem chama | O que faz com a sessão |
| :-- | :-- | :-- | :-- |
| ① | `src/proxy.ts` | O Next, antes de **toda** navegação de página | Decide "tem sessão ou não" para rotear, e é **o único lugar que renova o par de tokens** |
| ② | `src/lib/apiClient.ts` | Server Components e Server Actions | Repassa os cookies do navegador para a API; **nunca** renova |
| ③ | `src/app/api/[...path]/route.ts` | O navegador, em `fetch` do client | Encaminha para a API e devolve os `Set-Cookie` intactos |

O ponto arquitetural que amarra tudo: **o navegador nunca fala com a API diretamente**. Tudo passa
pelo domínio do front. Isso tem duas consequências que explicam metade do código do módulo:

- **Não existe CORS no caminho do usuário.** O `cors()` da API (`app.ts`) só serve o acesso direto
  em desenvolvimento; em produção o `Origin` é sempre o próprio front.
- **Os cookies de sessão pertencem ao domínio do front**, não ao da API. É por isso que o
  `proxy.ts` consegue lê-los — e é por isso que ele *precisa* conseguir, já que é ele quem decide
  o roteamento antes do render.

---

## 2. As sete decisões que definem o módulo

| # | Decisão | Onde vive | Por quê |
| :-- | :-- | :-- | :-- |
| 1 | **Sessão em dois tokens**, não um | `services/auth/authService.ts` | O access token é barato de verificar (stateless) mas não é revogável; o refresh é revogável mas caro (bate no banco). Cada um paga o preço na frequência certa |
| 2 | **Access token = JWT de 15 min**, HS256, com `iss` e `aud` | `signToken` / `verifyToken` | Se vazar, expira sozinho rápido. `SEC-12`: exigir emissor e público na verificação impede que um token de outro serviço com o mesmo segredo passe |
| 3 | **Refresh token = valor opaco de 40 bytes**, 7 dias, guardado só como hash SHA-256 | `RefreshToken` + `createRefreshTokenRecord` | Não carrega claim nenhuma, então não precisa ser JWT. Um dump do banco não devolve sessão a ninguém |
| 4 | **Rotação com detecção de reuso**, agrupada por `familyId` | `rotateRefreshToken` | Cada renovação queima o token anterior. Reapresentar um token já queimado é roubo confirmado — derruba a família inteira |
| 5 | **Cookies `httpOnly`**, `secure` em produção, `sameSite: 'lax'` | `lib/session.ts` | JavaScript da página nunca toca no token. `lax` (e não `strict`) porque o callback do Google chega por navegação de topo vinda de outro site |
| 6 | **A API é stateless**: nenhuma sessão em servidor | `config/passport.ts` (`session: false`) | Não há store de sessão para escalar nem para invalidar. O `cookie-session` do `app.ts` existe **só** para o `state` anti-CSRF do handshake OAuth, por 10 minutos |
| 7 | **Autorização mora nos services, não em middleware** | `loadUserResidenceContext` e as regras de cada service | A rota recebe um `:code` público, não um `residenceId`. Resolver residência + vínculo + papel é a mesma consulta que a regra de negócio já precisa fazer — um middleware faria a consulta duas vezes |

E a regra que governa todas as outras:

> **O front nunca é autoridade.** O `proxy.ts` decide roteamento e o `UserProvider` decide o que
> desenhar, mas os dois são **heurística de experiência**. Quem responde "esse token é válido?" e
> "essa pessoa pode fazer isso?" é a API, em toda chamada, sem exceção.

---

## 3. Peças e responsabilidades

### API (`sistema-controle-despesas-api`)

| Arquivo | Responsabilidade |
| :-- | :-- |
| `src/app.ts` | Ordem dos middlewares: `trust proxy` → helmet → `/health` → rate limit global → `/ready` → CORS → body parser → cookie parser → `cookie-session` (só OAuth) → passport → rotas |
| `src/config/env.ts` | Valida o ambiente com Zod e deriva as chaves de funcionalidade (`googleAuthEnabled`, `mailEnabled`, `rateLimitDisabled`, `storageEnabled`) |
| `src/config/passport.ts` | Registra a estratégia Google OIDC. Sem `serializeUser`/`deserializeUser` — não há sessão de passport |
| `src/middlewares/auth.ts` | **`requireAuth`**: extrai o token, verifica, carrega o usuário, popula `req.user` |
| `src/middlewares/rateLimit.ts` | Os seis limitadores (`SEC-01`), com os tetos e a razão de cada um |
| `src/middlewares/validate.ts` | `validateBody(schema)` — Zod antes do controller |
| `src/lib/session.ts` | Emissão do par de tokens e escrita/limpeza dos cookies (`establishSession`, `clearSessionCookies`) |
| `src/services/auth/authService.ts` | Registro, login por credencial, Google, assinatura/verificação de JWT, ciclo completo do refresh token |
| `src/services/auth/passwordResetService.ts` | Recuperação de senha por email, com anti-enumeração e teto por conta |
| `src/controllers/auth/authController.ts` | `register`, `login`, `refresh`, `logout`, `forgotPassword`, `resetPassword`, `googleCallback` |
| `src/routes/auth/authRoutes.ts` | Monta limitador → validação → controller, nessa ordem |
| `src/schemas/usuarios.ts` | Regra de senha compartilhada pelos três pontos que a aplicam (registro, troca, redefinição) |
| `src/utils/logger.ts` | `logSecurityEvent` — eventos de segurança em JSON de uma linha (`SEC-10`) |
| `src/utils/tokenPurge.ts` | Limpeza agendada das linhas mortas de token (`SEC-09`) |
| `src/types/express.d.ts` | Faz `req.user` ser tipado como `AuthUser` |

### Front (`sistema-controle-despesas-front`)

| Arquivo | Responsabilidade |
| :-- | :-- |
| `src/proxy.ts` | Guarda de rota **e** renovação de sessão. Roda antes de toda página |
| `src/app/api/[...path]/route.ts` | Proxy same-origin `/api/*` → API. Trata `Set-Cookie` e redirects manualmente |
| `src/lib/apiClient.ts` | `fetch` server-side com repasse de cookies. **Não** renova (o comentário longo no arquivo explica por quê) |
| `src/lib/apiClient.client.ts` | `fetch` client-side, com uma tentativa de refresh no 401, promise compartilhada e cooldown de 30 s |
| `src/lib/session.ts` | `getCurrentUser()` — "quem está logado" é sempre `GET /users/me` |
| `src/components/providers/UserProvider.tsx` | Guarda a **promise** da sessão no contexto; `useCurrentUser()` suspende |
| `src/hooks/useLogin.ts` / `useLogout.ts` | Disparam as chamadas e atualizam o contexto sem `router.refresh()` |

---

## 4. Modelo de dados da sessão

```
User ──┬── UserAuthProvider     (provider + providerId; 'local' ou 'google')
       ├── RefreshToken         (tokenHash único, familyId, expiresAt, revokedAt)
       ├── PasswordResetToken   (tokenHash único, expiresAt, usedAt)
       ├── PasswordResetAttempt (contador do teto por conta — D-07)
       └── Membership           (userId + residenceId, role: OWNER | MEMBER)
```

Três observações que valem mais que o diagrama:

- **`User.password` é anulável.** Conta criada pelo Google não tem senha local, e é isso que a
  recuperação de senha usa para decidir o ramo `D-11` (email explicando que a conta é do Google, sem
  emitir token).
- **`Membership` é a tabela inteira da autorização.** Não há tabela de permissão, papel global ou
  ACL. O papel é uma coluna com dois valores, por residência.
- **Nem `RefreshToken` nem `PasswordResetToken` guardam o valor em texto puro.** Só o SHA-256. Não é
  bcrypt porque os dois já são aleatórios de alta entropia — não são senhas escolhidas por humanos.

---

## 5. Fluxo A — o primeiro clique de quem não está logado

Cenário: alguém abre `https://dominio/` pela primeira vez. Nenhum cookie no navegador.

### Passo 1 — a requisição chega no front

A borda (Cloudflare → ALB → task do front) entrega o `GET /` ao processo Next.

### Passo 2 — `src/proxy.ts` roda antes de qualquer render

O `matcher` cobre o site inteiro (`/((?!api/|_next/|.*\.).*)`), excluindo `/api`, assets internos e
qualquer path com ponto. Prefetches do router também são excluídos, pelo bloco `missing`.

```
pathname          = "/"
precisaLogin      = false   // "/" não está em ["/dashboard", "/profile"]
somenteDeslogado  = false   // "/" não está em ["/login", "/register", "/forgot-password"]
jwt               = undefined
estaLogado        = false
cookie REFRESH    = ausente → não tenta renovar
→ NextResponse.next()
```

Nada é redirecionado. O visitante deslogado passa direto.

### Passo 3 — o layout raiz cria a promise da sessão, **sem await**

`src/app/layout.tsx` chama `getSessionPromise()` e passa a promise ao `UserProvider`. O `await` foi
removido de propósito: no App Router, um layout que lê dado de runtime bloqueia a navegação inteira
até terminar de renderizar, e nenhum `loading.tsx` aparece enquanto isso. Como este é o layout raiz,
**toda página do app pagaria esse bloqueio** — foram 354 ms medidos de tela congelada.

### Passo 4 — `GET /users/me` sai do front para a API

`getCurrentUser()` chama `apiFetch("/users/me")`, que monta o header `Cookie` com o que o navegador
mandou. Aqui, nada.

### Passo 5 — a API responde 401

`usersRoutes` faz `router.use(requireAuth)`. Dentro do middleware:

```ts
extractToken(req)  // cookie 'JWT'? não. header 'Authorization: Bearer'? não.
→ null
→ throw new AppError(401, 'Não autenticado.')
→ next(err) → errorHandler → 401 { message: 'Não autenticado.' }
```

### Passo 6 — o 401 vira `null`, não vira erro

`getCurrentUser()` captura, chama `unstable_rethrow` (para não engolir os erros de controle de fluxo
do Next), reconhece o 401 como "sessão encerrada" e devolve `null` sem logar. Qualquer outra falha —
API fora do ar, timeout de 10 s — também vira `null`, mas **com** log. A landing nunca quebra porque
a API caiu.

### Passo 7 — a interface desenha o estado deslogado

`Inicio.tsx` é um Client Component. `AcoesCabecalho` e `AcoesHero` chamam `useCurrentUser()`, que
**suspende** enquanto a promise não resolve; cada um está dentro do seu `<Suspense>`, com um
skeleton do tamanho do estado deslogado. Resolvido como `null`, aparecem "Entrar" e "Criar conta".

### Passo 8 — o clique em "Entrar"

Navegação para `/login`. O `proxy.ts` roda de novo:

```
somenteDeslogado = true   // "/login" está na lista
estaLogado       = false
→ passa: NextResponse.next()
```

Se houvesse sessão, este é o ponto que redirecionaria para `/`.

> **Detalhe deliberado:** `/change-password` **não** está em `ROTAS_SOMENTE_DESLOGADO`. O link do
> email de recuperação precisa funcionar mesmo com sessão ativa — o caso comum é quem está logado no
> computador mas esqueceu a senha do celular (`F-03` do plano de recuperação de senha).

---

## 6. Fluxo B — o login

### 6.1 Do formulário até a API

`LoginForm` usa `useLogin()`, que usa `useActionState`. A ação **roda no client**, não é Server
Action: o cookie vem no `Set-Cookie` da resposta e o próprio navegador o grava — não há nada para
repassar manualmente.

```
useLogin → apiFetchClient("/auth/login", { method: "POST", skipAuthRetry: true, body })
         → fetch("/api/auth/login", { credentials: "include" })      ← mesma origem
         → app/api/[...path]/route.ts
         → fetch(`${API_URL}/auth/login`, { redirect: "manual", ... })
```

`skipAuthRetry: true` importa: sem ele, uma senha errada (401) dispararia uma tentativa de refresh,
que também falharia. O `apiFetchClient` já ignora paths que começam com `/auth`, e a flag documenta
a intenção no ponto de chamada.

### 6.2 O caminho dentro da API

```
POST /auth/login
  │
  ├─ globalLimiter            120 req/min por IP
  ├─ loginLimiter             8 falhas / 15 min por IP  (skipSuccessfulRequests: true)
  ├─ validateBody(loginSchema)
  └─ authController.login
       └─ loginWithCredentials(username, password, { ip })
            ├─ prisma.user.findUnique({ where: { username: normalizado } })
            ├─ se não existe OU não tem senha local:
            │     logSecurityEvent('login_failed', { reason: 'user_not_found' })
            │     throw AppError(401, 'Credenciais inválidas.')
            ├─ bcrypt.compare(password, user.password)
            └─ se não bate:
                  logSecurityEvent('login_failed', { reason: 'invalid_password' })
                  throw AppError(401, 'Credenciais inválidas.')
```

**A mesma mensagem nos dois ramos** é o que impede enumeração de usernames. Mas o log registra a
diferença, e a diferença é o que dá sentido ao alerta: `user_not_found` repetido do mesmo IP é
varredura de nomes; `invalid_password` repetido no mesmo username é força bruta de senha. São
ataques distintos, e essa distinção **só existe dentro do service** — por isso o log mora ali, não
no controller.

`skipSuccessfulRequests: true` no `loginLimiter` faz o teto contar só o que falhou: quem acerta a
senha nunca gasta cota.

### 6.3 A emissão da sessão

```ts
// lib/session.ts
export async function establishSession(res, user) {
  const accessToken  = signToken(user);                  // JWT HS256, 15 min, iss + aud
  const refreshToken = await issueRefreshToken(user.id); // 40 bytes aleatórios, familyId novo
  setAccessTokenCookie(res, accessToken);                // httpOnly, lax, maxAge 15m
  setRefreshTokenCookie(res, refreshToken.raw);          // httpOnly, lax, path '/', maxAge 7d
}
```

Duas escolhas que parecem detalhe e não são:

- **`path: '/'` no cookie de refresh** (e não `/auth`). O navegador só enxerga `/api/auth/refresh`,
  nunca `/auth/refresh` — um cookie restrito a `/auth` jamais seria anexado. E o `proxy.ts` precisa
  lê-lo em requisições de página, que também não começam com `/auth`. `httpOnly` já impede leitura
  por JavaScript; `Path` aqui não somaria proteção, só quebraria o mecanismo.
- **`sameSite: 'lax'` no refresh** (e não `strict`). O callback do Google emite esse mesmo cookie
  num redirect de topo iniciado em `accounts.google.com`; com `strict`, o `Set-Cookie` é descartado
  em silêncio. `lax` ainda barra CSRF de verdade — `POST`, `fetch` e XHR cross-site continuam sem
  enviar o cookie.

`establishSession` é compartilhado por `register`, `login`, `googleCallback` e pela troca de senha.
Ele mora em `lib/`, e não no `authController`, porque a troca de senha vive no controller de
usuários — mantê-lo privado no auth forçaria um controller a importar o outro.

### 6.4 A volta: os cookies chegam ao navegador

O `Set-Cookie` precisa atravessar o Route Handler sem ser corrompido. `new Headers(res.headers)` ou
`headers.set()` agrupariam múltiplos valores da mesma chave numa string separada por vírgula — e
`Expires` já usa vírgula. Por isso o handler trata esse header à parte:

```ts
for (const cookie of apiRes.headers.getSetCookie()) headers.append("set-cookie", cookie);
```

Se isso quebrar, o login para de funcionar — está escrito assim no arquivo.

### 6.5 O fecho no client

A API devolve o `AuthUser` no corpo. `useLogin` chama `setUser(state.data)` e `router.push("/")` —
o contexto é atualizado direto, sem um `router.refresh()` de ida e volta ao servidor. O
`UserProvider` marca essa alteração como **autoritativa**: login troca de identidade, então o valor
substitui o do servidor em vez de ser mesclado com ele.

---

## 7. Fluxo C — navegar logado e renovar a sessão

O access token dura 15 minutos; a sessão, 7 dias. A ponte entre os dois é a renovação, e ela
acontece **em um lugar só**.

### 7.1 Por que só o `proxy.ts` pode renovar

Um refresh disparado durante o render de um Server Component **não consegue persistir o cookie
novo**: o Next proíbe `cookies().set()` fora de Server Action ou Route Handler, e a chamada lança.
Com refresh token rotativo, isso não é apenas inútil — é destrutivo. O token velho é revogado no
banco, o novo nunca chega ao navegador, e a renovação seguinte é lida pela API como **reuso**, ou
seja, roubo: a família inteira cai, o usuário é deslogado de todos os dispositivos e um alerta falso
é emitido. Isso aconteceu de verdade, e é a razão do bloco de comentário mais longo do
`apiClient.ts`.

O `proxy.ts` roda **antes** do render e é o único ponto do fluxo que consegue escrever cookie.

### 7.2 O algoritmo do proxy

```
1. lê o cookie JWT
2. jwtExpirado(jwt)?
     decodifica só o payload (base64url), sem validar assinatura
     considera expirado 5 s antes do exp real (margem para o tempo até a chamada real)
     qualquer erro de parse → true
3. estaLogado = !!jwt && !jwtExpirado(jwt)
4. se !estaLogado && existe cookie REFRESH:
     POST ${API_URL}/auth/refresh, repassando o header Cookie, timeout de 5 s
     sucesso → cookiesRenovados = [JWT, REFRESH]; estaLogado = true
5. rota protegida e sem sessão → redirect /login + limparSessao()
6. rota só-deslogado e com sessão → redirect / (levando os cookies renovados)
7. renovou → propagarCookies()
```

A assinatura **não** é validada no passo 2, e isso é deliberado: o segredo pertence à API e não deve
existir no front. Quem diz se o token é legítimo é a API, a cada chamada. Aqui é só heurística de
"provavelmente expirado".

`limparSessao()` no passo 5 não é cosmético. Uma sessão morta que continua no navegador faz toda
navegação seguinte gastar até 5 s tentando renovar e, pior, **reapresentar um refresh token já
revogado** — que a API lê como reuso.

### 7.3 `propagarCookies` — os dois lados

Escrever o `Set-Cookie` na resposta atualiza o navegador para a **próxima** requisição. Mas
`cookies()` de `next/headers` — usado por `getCurrentUser`, `residenceApi` e todo o resto — lê o
header `Cookie` do **request** desta passada. Por isso o proxy reescreve os dois:

```ts
const response = NextResponse.next({ request: { headers: novosHeaders } }); // request desta passada
for (const { name, value, options } of cookiesRenovados)
    response.cookies.set(name, value, options);                             // navegador
```

Com uma sutileza de codificação: o mapa interno trabalha em texto decodificado e reencoda ao
serializar o header `Cookie`; já o `Set-Cookie` da resposta vai com o valor **original**, ainda
encodado, porque `ResponseCookies.set` grava literalmente.

### 7.4 A rotação do lado da API

```
POST /auth/refresh  →  refreshLimiter (30 / 15 min)  →  authController.refresh
  └─ rotateRefreshToken(rawToken, { ip })
       1. tokenHash = sha256(raw); busca a linha
       2. não existe            → 401 'Sessão inválida.'
       3. revogado?
            dentro da janela de graça (10 s) E existe sucessor vivo na família?
              → refresh_token_grace_reuse  (evento medível, não alerta)
            senão
              → refresh_token_reuse        (ROUBO CONFIRMADO)
              → revoga a família inteira → 401
       4. expirado             → 401 'Sessão expirada.'
       5. revoga o token atual (só se ainda não estava revogado)
       6. cria um sucessor no MESMO familyId
       7. devolve { user, refreshToken } → controller emite JWT novo e seta os dois cookies
```

**A janela de graça de 10 segundos** é o ponto mais sutil do módulo. Sem ela, "reuso" e
"concorrência" viram a mesma coisa: um cliente normal dispara requisições em paralelo o tempo todo
(várias abas, prefetch, um `fetch` que toma 401 no mesmo instante de uma navegação), e todas carregam
o **mesmo** refresh token porque nenhuma viu ainda o `Set-Cookie` das outras. A primeira rotaciona; a
segunda chega milissegundos depois com um token recém-revogado e derrubava a família inteira.

E a graça vale **só para quem foi revogado por rotação**. Tempo sozinho não serve como critério:
logout, troca de senha e a própria detecção de reuso também gravam `revokedAt = agora`, e uma janela
puramente temporal ressuscitaria por 10 s exatamente as sessões que esses três fluxos existem para
matar. O que distingue os casos, sem coluna nova no banco: **rotação legítima deixa um sucessor vivo
na mesma família** — é o token que o cliente acabou de receber. Revogação em massa não deixa nenhum.

### 7.5 O caminho client-side

`apiFetchClient` tem sua própria recuperação, para chamadas disparadas depois do render:

```
resposta 401 && !skipAuthRetry && !path.startsWith("/auth")
  → tryRefresh()
      cooldown de 30 s desde a última falha? → desiste
      já existe uma promise em andamento?    → espera aquela (não duplica)
      POST /api/auth/refresh
  → se renovou, repete a chamada original UMA vez
```

A promise compartilhada é o que impede duas chamadas simultâneas de renovarem duas vezes — o que,
com rotação, seria exatamente o cenário que a janela de graça precisa absorver.

---

## 8. Fluxo D — uma ação autorizada: cadastrar despesa

Usuário logado, dentro de `/dashboard/residences/CASA123/expenses`, clica em "Nova despesa",
preenche e envia.

### Passo 1 — o modal (client)

`CadastrarDespesaModal` usa `useActionState(cadastrarDespesaAction, null)` e um `<form action=...>`.
O envio é uma **Server Action** — diferente do login, aqui o trabalho é no servidor.

### Passo 2 — a Server Action revalida a sessão

```ts
// cadastrarDespesaAction.ts
const user = await getCurrentUser();          // GET /users/me na API
if (!user) return { success: false, message: 'Usuário não autenticado' };
```

Não é redundância inútil: a Server Action é um endpoint HTTP como qualquer outro e pode ser chamada
sem passar por página nenhuma. Ainda assim, esta checagem é **conveniência de mensagem** — a
autorização real vem no passo 5.

### Passo 3 — validação no front

O valor digitado (`"180,50"`) vira centavos **antes** do Zod, porque depende do formato digitado. Só
então `despesaSchema.safeParse`. Erros voltam como texto no `ActionState`, sem chegar na API.

### Passo 4 — a chamada server-side

```ts
apiFetch(`/residences/${data.code}/expenses`, { method: "POST", body: payload });
```

Este `fetch` sai do processo Next **direto para a API**, não pelo Route Handler `/api/*` — esse
existe para o navegador. O `apiFetch` monta o header `Cookie` a partir de `cookies()`, que já traz
os valores renovados pelo proxy nesta mesma passada.

### Passo 5 — autenticação na API

```ts
// middlewares/auth.ts — montado como router.use(requireAuth) em expensesRoutes
const token = extractToken(req);               // cookie 'JWT', ou 'Authorization: Bearer'
if (!token) throw new AppError(401, 'Não autenticado.');
const payload = verifyToken(token);            // assinatura + exp + issuer + audience
const user = await getUserById(payload.sub);   // consulta o banco
if (!user) throw new AppError(401, 'Não autenticado.');
req.user = user;
```

Duas coisas valem nota. Primeira: a verificação **exige** `issuer` e `audience`, não só assina com
eles — assinar sem exigir não protegeria nada (`SEC-12`). Segunda: há uma consulta ao banco em toda
requisição autenticada. O custo é um índice primário; o ganho é que um usuário removido perde acesso
**imediatamente**, sem esperar o JWT expirar.

### Passo 6 — validação de corpo

`validateBody(expenseSchema)` roda depois do `requireAuth` e substitui `req.body` pelo dado
**parseado** — o controller recebe valor já tipado, nunca o corpo cru.

### Passo 7 — a autorização, dentro do service

```ts
// services/expenses/expensesService.ts
export async function createExpense(code, userId, input) {
  const context = await loadUserResidenceContext(code, userId);   // ← aqui
  if (context.isArchived) throw new AppError(409, 'Esta residência está arquivada...');
  const competency = await getOpenCompetency(context.residence.id);
  return prisma.expense.create({
    data: { ...input, residenceId: context.residence.id, createdById: userId, ...competency },
  });
}
```

E `loadUserResidenceContext` é o coração do modelo de autorização:

```
1. normaliza o code; se inválido        → 404 'Residência não encontrada'
2. busca a residência pelo code;
     não existe                         → 404 'Residência não encontrada'
3. busca Membership(userId, residenceId);
     não existe                         → 404 'Residência não encontrada'   ← MESMA mensagem
4. devolve { residence, membership, isOwner, isArchived }
```

**O 404 no passo 3 é deliberado, não um erro.** Um 403 ali contaria a quem não é membro que a
residência existe — e o `code` é curto e público. A mensagem idêntica nos três ramos torna
indistinguível "não existe" de "existe e você não faz parte".

### Passo 8 — a competência é decidida pelo servidor

`RN-020`: a despesa cai sempre na competência **aberta**, calculada por `getOpenCompetency`. O
cliente não escolhe o mês. Nem envia — não há campo para isso no schema.

### Passo 9 — a volta

O controller responde `201 { expense }`. A Server Action chama `revalidatePath` nas duas telas
afetadas e devolve `{ success: true, message: "Despesa lançada em setembro de 2026!" }`. O modal
fecha, a lista recarrega.

### O caminho completo, condensado

```
clique
  → Server Action                     [front]  sessão existe? valida forma
  → GET /users/me                     [api]    requireAuth
  → POST /residences/:code/expenses   [api]
       requireAuth                             autenticado?                    → 401
       validateBody(expenseSchema)             o corpo é válido?               → 400
       createExpense
         loadUserResidenceContext              é membro DESTA residência?      → 404
         isArchived                            a residência aceita escrita?    → 409
         getOpenCompetency                     em qual mês isso cai?
         prisma.expense.create
  → 201
  → revalidatePath
```

---

## 9. O modelo de autorização em cinco camadas

Não existe RBAC global, nem tabela de permissões, nem middleware de papel. A autorização é resolvida
em cinco perguntas, cada uma no seu lugar:

| Camada | Pergunta | Onde | Falha com |
| :-- | :-- | :-- | :-- |
| **1. Autenticação** | Existe uma sessão válida? | `requireAuth`, em `router.use` de todo router protegido | **401** |
| **2. Pertencimento** | Você é membro **desta** residência? | `loadUserResidenceContext` | **404** (anti-enumeração) |
| **3. Papel** | Você é o `OWNER`? | Cada service, logo após carregar o contexto | **403** |
| **4. Propriedade** | O recurso é seu? | Filtro na própria query (`createdById`) ou comparação de id | **404** ou **403** |
| **5. Estado** | O recurso aceita esta operação agora? | Cada service | **409** |

### Camada 3 — o que só o `OWNER` faz

| Ação | Service |
| :-- | :-- |
| Fechar o mês | `closeMonth` |
| Reabrir um mês | `reopenMonth` |
| Renomear / arquivar / desarquivar | `updateResidence` |
| Regenerar o código de acesso | `regenerateResidenceCode` |
| Dispensar um acerto (`D-07`) | `waiveSettlement` |
| Remover membro, transferir posse | `residencesService` |

Tudo o mais é de qualquer membro: lançar despesa (`RN-018`), ver despesas, ver relatórios, ver e
liquidar os próprios acertos.

### Camada 4 — por que o código de status muda

Duas formas diferentes, e a diferença é intencional:

```ts
// Despesa — o filtro está na query. "Não é sua" e "não existe" são a mesma resposta.
prisma.expense.findFirst({ where: { id, residenceId, createdById: userId, deletedAt: null } })
  → não achou → 404 'Você só pode editar as despesas que você mesmo lançou.'
```

```ts
// Acerto — o recurso é legitimamente visível a todos os membros; o que muda é o lado do par.
if (settlement.payerId !== userId)
  throw new AppError(403, 'Você não é o devedor deste par de acerto.');   // RN-074
```

No primeiro caso esconder a existência tem valor. No segundo não tem: o membro já vê aquela linha na
tela de acertos. Um 404 ali seria mentira sem ganho.

### Por que isso não é um middleware

Seria tentador escrever `requireMember` e `requireOwner`. O motivo de não existirem: a rota recebe
um `:code` público, não um `residenceId`. Um middleware teria de resolver residência + vínculo +
papel — exatamente a consulta que o service faz logo em seguida. O resultado seria a mesma consulta
duas vezes por requisição, ou um objeto de contexto pendurado no `req` que o service teria de
confiar cegamente. Concentrar tudo em `loadUserResidenceContext`, chamado como **primeira linha** de
cada operação, resolve os dois problemas com uma consulta só.

---

## 10. Fluxos secundários

### 10.1 Registro

```
POST /auth/register → registerLimiter (10/hora, contando SUCESSOS)
                    → validateBody(registerSchema)
                    → registerUser: checa email, checa username, bcrypt.hash (10 rounds),
                      cria User + UserAuthProvider('local')
                    → establishSession → 201 { user }
```

O `registerLimiter` **não** usa `skipSuccessfulRequests`. O risco aqui não é adivinhar senha, é criar
conta em massa: cada cadastro gasta `bcrypt.hash` e ocupa uma linha. Limitar só o que falha deixaria
a fazenda de contas passar livre.

### 10.2 Google OIDC

```
navegador → GET /api/auth/google
          → Route Handler com redirect: "manual"   ← sem isso o fetch seguiria o 302 sozinho
                                                     e o navegador nunca veria o Location
          → 302 accounts.google.com
usuário autoriza
          → GET /auth/google/callback
          → passport.authenticate('google', { session: false })
               verify callback → findOrCreateGoogleUser(profile)
                   conta nova   → cria User (password: null) + provider 'google',
                                  gera username a partir do email
                   conta existe → vincula o provider se faltar, preenche profilePic e
                                  username se estiverem vazios
          → googleCallback: establishSession + res.redirect(FRONTEND_URL)
```

O `cookie-session` de `app.ts` existe **só** para este handshake: o `state` anti-CSRF do
`passport-oauth2` exige `req.session`. Dura 10 minutos e não guarda usuário nenhum. Se as quatro
variáveis do Google não estiverem configuradas, nem a estratégia nem as rotas nem o `cookie-session`
são montados — `googleAuthEnabled` governa os três.

Note a assimetria: o callback responde com **redirect**, não JSON, porque o navegador chegou ali por
navegação de topo, não por `fetch`.

### 10.3 Recuperação de senha

```
POST /auth/forgot-password  → 200 SEMPRE, com a mesma mensagem            (D-03)
     ramos internos:
       email não existe          → sai em silêncio, sem log, sem email
       teto de 3/hora estourado  → password_reset_throttled, sem email    (D-07)
       conta só-Google           → email explicativo, SEM emitir token    (D-11)
       conta com senha local     → invalida tokens anteriores (D-05),
                                   emite token de 32 bytes (hash no banco, TTL 30 min),
                                   despacha email SEM await               (D-04)

POST /auth/reset-password/verify  → o token é válido? (mesma mensagem para
                                    inexistente / usado / expirado)
POST /auth/reset-password         → transação: troca a senha + marca usedAt
                                  → revokeAllUserTokens
                                  → 200, SEM cookie: o usuário vai para o login  (D-06)
```

Três detalhes que o resto do sistema herda:

- **O 200 uniforme inclui a falha inesperada.** Se o service explodir (banco fora), o controller
  loga e responde 200 mesmo assim. Um 500 seletivo seria mais um canal de enumeração.
- **O email é despachado sem `await`.** Aguardar o SMTP criaria um oráculo de tempo: conta que
  existe leva o round trip do envio, conta que não existe responde quase instantaneamente. O
  despacho fica registrado em `pendingEmails` para o shutdown gracioso poder esperá-lo (`D-04`).
- **`forgotPasswordLimiter` nunca pode usar `skipSuccessfulRequests`.** Como o endpoint responde 200
  por design, toda requisição é "bem-sucedida" para o limitador — a opção o desarmaria por completo,
  em silêncio. Está anotado com um aviso no próprio arquivo (`D-07`).

Detalhe do front: `/change-password` é uma rota pública mas **não** está na lista de rotas
só-para-deslogado, para que o link do email funcione com sessão ativa.

### 10.4 Troca de senha por quem já está logado

```
PATCH /users/me/password → requireAuth → validateBody(changePasswordSchema)
  → changeUserPassword (confere a senha atual)
  → revokeAllUserTokens(user.id)     ← derruba TODAS as sessões, de todos os dispositivos
  → establishSession(res, updated)   ← e reabre a sessão DESTE dispositivo
```

A ordem importa e está comentada no código: revogar primeiro, emitir depois. Invertido, o par novo
nasceria e seria revogado na mesma requisição — o próprio usuário cairia. `SEC-06`: trocar a senha é
o gesto universal de "expulsar o invasor"; sem isso, um refresh token roubado continuaria
rotacionando por até 7 dias.

---

## 11. Defesas transversais

### 11.1 Rate limiting (`SEC-01`)

| Limitador | Teto | Janela | Particularidade |
| :-- | --: | :-- | :-- |
| `global` | 120 | 1 min | Rede de proteção da instância inteira |
| `login` | 8 | 15 min | `skipSuccessfulRequests` — só falhas contam |
| `register` | 10 | 1 h | Sucessos **contam** (fazenda de contas) |
| `refresh` | 30 | 15 min | Generoso: várias abas renovam sozinhas |
| `forgot-password` | 5 | 1 h | Cada chamada custa um email real |
| `reset-password` | 10 | 1 h | Contra adivinhação de token e gasto de bcrypt |

Os limitadores vêm **antes** do `validateBody` nas rotas: uma tentativa de força bruta não deve
gastar nem o custo da validação do schema. `/health` fica antes do limitador global (um 429 ali
derrubaria uma instância saudável do balanceamento); `/ready` fica depois, porque custa um round trip
no Postgres.

Tudo isso depende de `app.set('trust proxy', 1)` (`SEC-02`). O valor é `1`, nunca `true`: confiar na
cadeia inteira deixaria qualquer cliente forjar o `X-Forwarded-For` e escapar do limite trocando o
header a cada requisição.

### 11.2 Eventos de segurança (`SEC-10`)

`logSecurityEvent` emite JSON de uma linha no stderr. O formato importa mais que o conteúdo: uma
linha, um objeto, chaves estáveis — é isso que permite um metric filter no CloudWatch
(`{ $.event = "refresh_token_reuse" }`) com um alarme pendurado.

| Evento | Significado |
| :-- | :-- |
| `refresh_token_reuse` | **Roubo confirmado.** O alerta mais valioso da aplicação |
| `refresh_token_grace_reuse` | Concorrência normal. Não alerta, mas volume anormal denuncia o front multiplicando renovações |
| `login_failed` | Com `reason` distinguindo varredura de username de força bruta de senha |
| `rate_limit_exceeded` | Com `limiter` identificando **qual** teto barrou |
| `rate_limit_override` | No boot, quando um teto subiu por variável de ambiente |
| `password_reset_token_reuse` | Mesmo peso do reuso de refresh |
| `password_reset_throttled` | Único lugar onde o teto por conta fica visível (a resposta é sempre 200) |
| `receipt_content_mismatch` | O arquivo enviado não bate com o tipo declarado |

Nada aqui carrega segredo: nunca a senha tentada, nunca o valor do token. Só identificadores
(`username`, `userId`, prefixo de 12 caracteres do hash) e o IP.

### 11.3 Superfície HTTP

| Defesa | Onde | Nota |
| :-- | :-- | :-- |
| Helmet + HSTS 180 dias | `app.ts` | CSP desligado — a API só devolve JSON. `preload: false` (é praticamente irreversível) |
| CORS com `credentials` | `app.ts` | `origin` fixo no `FRONTEND_URL`; com credenciais, `*` não é permitido |
| Corpo limitado a 32 kb | `app.ts` | `SEC-11`. O maior corpo legítimo é uma lista de ids de notificação |
| 500 genérico em produção | `errorHandler.ts` | `SEC-04`. Um erro do Prisma entrega tabela, coluna e constraint; o detalhe fica só no log |
| Erros de body-parser tratados | `errorHandler.ts` | JSON malformado vira 400, corpo grande vira 413 — não 500 |

### 11.4 Higiene de dados (`SEC-09`)

`utils/tokenPurge.ts`, rodado por uma task agendada, limpa `RefreshToken` (retenção de 30 dias) e
`PasswordResetToken` + `PasswordResetAttempt` (7 dias). Um usuário ativo gera cerca de 96 linhas de
refresh token por dia com access token de 15 minutos, e nada some sozinho.

A retenção não é arbitrária: uma linha revogada **ainda serve** para detectar reuso — é ela que faz
`rotateRefreshToken` reconhecer um token roubado em vez de responder "não existe". Passados 30 dias
o token já expirou de qualquer forma.

---

## 12. Ciclo de vida da sessão: o que mata o quê

| Evento | Access token (JWT) | Refresh token | Alcance |
| :-- | :-- | :-- | :-- |
| **Login / registro / Google** | Emitido, 15 min | Família nova | Este dispositivo |
| **Refresh** | Novo | Rotacionado na **mesma** família | Este dispositivo |
| **Logout** | Cookie limpo (mas o token segue válido até expirar) | **Este** token revogado | Este dispositivo |
| **Reuso detectado** | — | **Família inteira** revogada | Todos os dispositivos daquele login |
| **Troca de senha** (logado) | Reemitido | **Todos** revogados, família nova | Todos, exceto o dispositivo atual |
| **Redefinição por email** | — | **Todos** revogados, nenhum emitido | Todos, inclusive quem redefiniu |
| **Usuário removido do banco** | Segue assinado, mas `getUserById` devolve `null` | Cascade | Imediato |

---

## 13. Limites conhecidos e trade-offs assumidos

Cinco pontos que quem for mexer no módulo precisa saber. Nenhum é bug; todos são consequência de uma
escolha registrada.

**1. O access token não é revogável dentro dos 15 minutos.** Logout limpa os cookies e revoga o
refresh token, mas um JWT já copiado continua sendo aceito até o `exp`. É o preço de ser stateless.
O que reduz a janela: `requireAuth` consulta o banco a cada requisição, então um usuário **removido**
perde acesso na hora — só não perde quem apenas deslogou.

**2. Os rate limiters são por instância.** `express-rate-limit` usa store em memória, sem Redis. Com
duas tasks no ECS, o teto efetivo dobra e o balde de um IP depende de qual task o atendeu. Hoje roda
uma task só; o dia em que escalar horizontalmente, o teto precisa de um store compartilhado.

**3. A janela de graça de 10 s é uma abertura explícita.** Quem roubar um refresh token tem esses 10
segundos, contados da rotação legítima, para usá-lo. É o mesmo compromisso que o OAuth 2.0 Security
BCP descreve para rotação com clientes concorrentes, e a alternativa (sem graça) produzia logout em
massa e alerta falso em uso normal.

**4. `GET /users/me` é chamado várias vezes por página.** `getCurrentUser()` roda no layout raiz e em
várias páginas, e não há cache de requisição por cima dele. Cada chamada é um round trip front→API
mais uma consulta ao banco. Barato hoje, mensurável se as telas crescerem.

**5. O `proxy.ts` decodifica o JWT sem validar assinatura.** Correto e deliberado (o segredo pertence
à API), mas significa que um cookie `JWT` forjado com `exp` no futuro faz o proxy tratar o visitante
como logado — e ele entra na página, onde a primeira chamada real à API devolve 401 e a sessão cai.
O efeito é uma tela de erro, nunca acesso a dado.

---

## 14. Onde os testes cobrem cada parte

| Arquivo de teste | O que trava |
| :-- | :-- |
| `tests/unit/auth.service.test.ts` | Assinatura/verificação de JWT, ciclo do refresh token, rotação e reuso |
| `tests/unit/passwordReset.service.test.ts` | Os quatro ramos do `forgot-password` e a invalidação de tokens |
| `tests/unit/usuarios.schemas.test.ts` | Regra de senha, username e avatar |
| `tests/unit/rateLimitLimits.test.ts` | Os tetos e o `resolveLimit` |
| `tests/integration/auth.test.ts` | Registro, login, refresh, logout ponta a ponta |
| `tests/integration/authRateLimit.test.ts` | Que os limitadores **reais** continuam montados nas rotas reais |
| `tests/integration/security.test.ts` | Cabeçalhos, limite de corpo, mensagem de erro em produção |
| `tests/integration/securityEvents.test.ts` | Formato e emissão dos eventos do `SEC-10` |
| `tests/integration/passwordChange.test.ts` | `SEC-06`: troca de senha derruba as outras sessões |
| `tests/integration/passwordReset.test.ts` | Anti-enumeração e teto por conta |
| `tests/integration/refreshTokenPurge.test.ts` | A purga do `SEC-09` |
| `src/proxy.test.ts` (front) | Guarda de rota, decisão de renovar e propagação de cookies |

O `authRateLimit.test.ts` merece destaque: sem ele, dá para provar que a biblioteca de rate limit
funciona, mas não que ela **continua ligada** em `/auth/login`. Um refactor poderia desarmar a
proteção sem nenhum teste acusar.

---

## Referências dentro do repositório

- `sistema-controle-despesas-api/docs/plano-recuperacao-de-senha.md` — decisões `D-01` a `D-11` do fluxo de recuperação
- `sistema-controle-despesas-api/docs/revisao-seguranca-deploy-aws.md` — origem dos `SEC-01` a `SEC-17`
- `sistema-controle-despesas-front/docs/refatoracao-contexto-usuario.md` — por que o layout raiz não dá `await` na sessão
- `sistema-controle-despesas-front/docs/decisao-sincronizacao-usuario-pos-acao.md` — por que login e logout não usam `router.refresh()`
- `sistema-controle-despesas-deploy/docs/arquitetura-aws.md` — a borda por onde a requisição chega
