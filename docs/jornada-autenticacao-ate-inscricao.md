# Da conta nova à inscrição na pelada — autenticação e autorização no Voa Craque

Documento descritivo do módulo de **autenticação** (quem é você) e **autorização** (o que você
pode fazer) do Voa Craque, contado como uma jornada: alguém que nunca abriu o site cria a conta,
monta o perfil de jogador e se inscreve numa pelada; do outro lado, quem organiza confirma o
pagamento.

> **Escopo:** descreve o código como ele está hoje (29/09/2026). Não é proposta. O *porquê* de
> cada peça do protocolo de sessão está em
> [`arquitetura-modulo-autenticacao.md`](arquitetura-modulo-autenticacao.md); este documento
> mostra *o que roda, em que ordem e em qual arquivo*, e registra o que a análise encontrou de
> frágil ([seção 10](#10-limites-encontrados-na-análise)).
>
> **Versões:** Next.js 16.3 (o `middleware` agora se chama `proxy`), React 19.3, Auth.js v5
> (`next-auth@5.0.0-beta.32`), Prisma 7.10, PostgreSQL.

**Personagens.** *Rafa* cria a conta pelo formulário (usuário `rafa`, id `u1`). A pelada é
`g1`, a inscrição que vai nascer é `r1`, e a conta admin que confirma o pagamento é `a1`.

---

## Índice

1. [O mapa em uma tela](#1-o-mapa-em-uma-tela)
2. [Quem é quem no código](#2-quem-é-quem-no-código)
3. [A jornada em uma tabela](#3-a-jornada-em-uma-tabela)
4. [Parte I — Criar a conta (passos 1 a 3)](#4-parte-i--criar-a-conta)
5. [Parte II — Primeiro acesso (passos 4 e 5)](#5-parte-ii--primeiro-acesso)
6. [Parte III — A inscrição (passos 6 a 10)](#6-parte-iii--a-inscrição)
7. [Parte IV — Quem organiza confirma o pagamento (passo 11)](#7-parte-iv--quem-organiza-confirma-o-pagamento)
8. [A autorização vista de cima](#8-a-autorização-vista-de-cima)
9. [Depois da inscrição: o resto do ciclo da sessão](#9-depois-da-inscrição-o-resto-do-ciclo-da-sessão)
10. [Limites encontrados na análise](#10-limites-encontrados-na-análise)
11. [O que os testes cobrem](#11-o-que-os-testes-cobrem)
12. [Referências](#12-referências)

---

## 1. O mapa em uma tela

Existe **um processo** no caminho: o Next.js é, ao mesmo tempo, o front e a API. Não há CORS,
repasse de cookie entre serviços nem access token de curta duração.

```
 Navegador                          Next.js 16 (um processo Node)                          PostgreSQL
┌──────────────────────┐          ┌──────────────────────────────────────────────────┐    ┌──────────────────┐
│ cookie httpOnly      │          │ ① src/proxy.ts      roteia; único que rotaciona  │    │ User             │
│ authjs.session-token │ ───────► │ ② page.tsx          pageUser*()  → redirect      │ ─► │ SessionToken     │
│ (JWE cifrado)        │          │ ③ src/actions/*     cadastro, login, logout      │    │ UserAuthProvider │
│                      │          │ ④ src/app/api/**    requireUser*() → 401/403     │    │ PlayerProfile    │
│ nenhum JS lê o token │          │ ⑤ /api/auth/*       Auth.js (retorno do Google)  │    │ GameDay          │
│                      │          │                                                  │    │ Registration     │
│                      │          │ getCurrentUser(): a única autoridade da sessão   │    │ AuditLog         │
└──────────────────────┘          └──────────────────────────────────────────────────┘    └──────────────────┘
```

| # | Entrada | Quem chama | O que faz com a sessão |
| :-- | :-- | :-- | :-- |
| ① | `src/proxy.ts` | O Next, antes de toda requisição que casa com o `matcher` | Decide roteamento por heurística ("o cookie decifra?") e é **o único lugar que rotaciona** o token. Não responde "pode?" |
| ② | `page.tsx` | Navegação | Primeira linha de cada página: `pageUser()`, `pageUserWithProfile()`, `pageAdmin()` ou `pageSuperadmin()`. Falha com `redirect` |
| ③ | `src/actions/*.ts` | `<form action>` | Cadastro, login, Google e logout. É o Auth.js, dentro da action, que grava o cookie |
| ④ | `src/app/api/**/route.ts` | `fetch` do cliente | Primeira linha: `requireUser()`, `requireAdmin()` ou `requireSuperadmin()`. Falha com 401/403 em JSON |
| ⑤ | `/api/auth/*` | O Google, no retorno do OAuth | Handshake OIDC do Auth.js |

Quatro regras que a jornada inteira obedece:

1. **O proxy roteia, não autoriza.** Ele só sabe que o cookie decifra. Toda página e toda rota
   perguntam de novo a `getCurrentUser()`, que consulta o banco.
2. **`getCurrentUser()` é a autoridade.** Uma consulta por requisição (`cache` do React): o token
   existe, está vivo ou em graça, pertence ao usuário que o cookie diz, e o usuário está ativo.
3. **Cookie só é gravado em dois lugares:** pelo Auth.js dentro das Server Actions de login e
   logout, e pelo proxy na rotação — e o proxy só rotaciona em `GET`.
4. **O servidor decide tudo o que importa.** `userId`, preço, status de pagamento e papel nunca
   vêm do corpo da requisição.

---

## 2. Quem é quem no código

| Arquivo | Papel na jornada |
| :-- | :-- |
| `src/proxy.ts` | Classifica a rota, barra quem não tem cookie, rotaciona e confirma o token (só em `GET`) |
| `src/lib/auth/routes.ts` | `classifyPath` (cinco tipos de rota) e `safeNextPath` (destino seguro pós-login) |
| `src/auth.ts` | Instância do Auth.js: `authorize` com rate limit, provedor Google, callbacks `signIn`/`jwt`/`session`, `events.signOut` |
| `src/lib/auth/config.ts` | Inatividade de 30 dias, rotação a cada 15 min, graça de 60 s, nome e atributos do cookie |
| `src/lib/auth/session-cookie.ts` | Cifra e decifra o cookie (o mesmo JWE do Auth.js) com os claims `sub`, `sid`, `rot`, `pend` |
| `src/lib/auth/session-store.ts` | `openSession`, `rotateSessionToken`, `acknowledgeSessionToken`, revogações e purga |
| `src/lib/auth/token-state.ts` | Classificação pura do token: `active`, `grace`, `reused`, `expired`, `unknown` |
| `src/lib/auth/credentials.ts` | `verifyCredentials`, com custo constante de bcrypt |
| `src/lib/auth/google.ts` | Achar, vincular ou criar o usuário que entra pelo Google |
| `src/lib/session.ts` | `getCurrentUser` (autoridade), `getSessionPromise`, guardas `require*` (API) e `page*` (páginas) |
| `src/actions/auth.ts` | Server Actions `registerAction`, `loginAction`, `googleSignInAction`, `logoutAction` |
| `src/components/providers/UserProvider.tsx` | Contexto com a *promise* da sessão; `useCurrentUser()` serve para desenhar, não para decidir |
| `src/lib/http.ts` | `route()` e `HttpError`: traduz erro de domínio e de Zod em JSON estável (401, 403, 404, 409, 422) |
| `src/lib/validation.ts` | Um schema Zod por entrada |
| `src/lib/rate-limit.ts`, `client-ip.ts`, `security-log.ts`, `audit.ts` | Limitadores, IP real atrás de proxy, eventos de segurança, trilha de auditoria |
| `src/app/api/uploads/route.ts`, `src/app/api/files/[...path]/route.ts` | Envio e leitura de foto e comprovante, com controle de acesso na leitura |
| `src/app/api/game-days/[id]/registrations/**` | Inscrição e cancelamento (jogador) e decisão de pagamento (admin) |

---

## 3. A jornada em uma tabela

| # | Quem | Requisição | Entrada | Guarda | Grava no banco |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | Rafa | `GET /` | proxy | Sem cookie → `/login` | — |
| 2 | Rafa | `GET /login`, `GET /register` | proxy + página | Rota só-de-deslogado | — |
| 3 | Rafa | `POST /register` (Server Action) | `registerAction` | `registerLimiter`, `registerSchema`, depois `authorize` | `User`, `AuditLog`, `SessionToken` |
| 4 | Rafa | `GET /onboarding` | página | `pageUser()` | — |
| 5 | Rafa | `POST /api/uploads`, `PUT /api/profile` | Route Handlers | `requireUser()`, `profileSchema` | `PlayerProfile`, `AuditLog` |
| 6 | Rafa | `GET /` | página | `pageUserWithProfile()` | — |
| 7 | Rafa | `GET /game-days/g1`, 20 min depois do login | proxy + página | Rotação no proxy; `pageUserWithProfile()` | `SessionToken` (sucessor pendente) |
| 8 | Rafa | `POST /api/uploads` (comprovante) | Route Handler | `requireUser()` | — (arquivo no disco ou no S3) |
| 9 | Rafa | `POST /api/game-days/g1/registrations` | Route Handler | `requireUser()` + regras de estado | `Registration`, `AuditLog` |
| 10 | Rafa | `router.refresh()` → `GET /game-days/g1` | proxy + página | Confirmação do sucessor | `SessionToken` (o anterior é aposentado) |
| 11 | a1 | `PATCH /api/game-days/g1/registrations/r1` | Route Handler | `requireAdmin()` | `Registration`, `AuditLog` |

---

## 4. Parte I — Criar a conta

### Passo 1 — `GET /` sem cookie

Rafa recebeu o link do grupo e abre `https://dominio/`. Nenhum cookie no navegador.

```
proxy(req)                                                          src/proxy.ts:27
  route  = classifyPath("/")          → "protected-page"
                                        ("/" não está em GUEST_ONLY nem em PUBLIC:
                                         não existe landing pública)
  cookie = undefined                  → claims = null, clear = false
  !claims && route === "protected-page"
                                      → 307 /login
                                        (sem ?proximo: o destino era "/", que já é o padrão)
```

Nenhuma linha de React roda e o banco não é consultado. Se Rafa tivesse aberto o link direto da
pelada, o redirect seria `/login?proximo=%2Fgame-days%2Fg1`: o `LoginForm` carrega o `proximo`
num campo oculto, e `safeNextPath` só o aceita se for caminho interno (`//evil.com` e
`/\evil.com` viram `/`).

`classifyPath` (`src/lib/auth/routes.ts:18`) divide o site em cinco tipos:

| Tipo | Caminhos | Sem sessão | Com cookie que decifra |
| :-- | :-- | :-- | :-- |
| `auth-endpoint` | `/api/auth/*` | Passa (o Auth.js cuida) | Passa; nunca rotaciona |
| `guest-only` | `/login`, `/register`, `/forgot-password` | Passa | Em `GET`, confirma no banco que a sessão vive e manda para `/` |
| `public` | `/maintenance`, `/reset-password`, `/game-days/:id/stats` | Passa | Passa |
| `protected-api` | Todo o resto de `/api/*` | **401** em JSON | Segue para a guarda da rota |
| `protected-page` | Todo o resto | `/login?proximo=…` | Segue para a guarda da página |

"Segue para a guarda" é literal: o proxy não sabe se a sessão ainda vale no banco (logout em
outra aba, usuário desativado). Quem descobre é a guarda.

### Passo 2 — `/login` → "Criar conta" → `/register`

```
GET /login      classifyPath → "guest-only"; sem claims → NextResponse.next()
GET /register   idem
```

O layout raiz (`src/app/layout.tsx`) chama `getSessionPromise()` **sem `await`** e entrega a
promise ao `UserProvider`. Sem cookie, `getCurrentUser()` devolve `null` antes de tocar no banco.
Por que o layout não espera a sessão está em
[`arquitetura-modulo-autenticacao.md` §5](arquitetura-modulo-autenticacao.md#5-estado-do-usuário-no-cliente-o-userprovider).

As duas páginas só mostram o botão do Google se `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET`
existirem (`isGoogleAuthEnabled()`); a mesma checagem tira o provedor do Auth.js, então não
existe um meio-termo em que o botão aparece e o provedor não.

> **Detalhe:** o link "Criar conta" não leva o `proximo`. Quem chega por um link de pelada e
> cria conta sempre termina em `/onboarding` e depois em `/`, não na pelada.

### Passo 3 — O cadastro: `registerAction`

#### 3.1 Do formulário até o banco

O `RegisterForm` usa `useActionState(registerAction)`. É Server Action, e não `fetch`, por um
motivo: o Auth.js grava o cookie com `cookies().set()` dentro da action, e um cookie alterado
numa action faz o Next rerenderizar os layouts na mesma resposta. O layout raiz cria uma
promise de sessão nova e o `UserProvider` já recebe Rafa logado, sem `router.refresh()`.

```
POST /register                                   (Server Action; o Next confere Origin × Host)
  proxy: "guest-only", POST, sem claims → next()  (o redirect de quem já tem sessão só vale em GET)
  registerAction(prev, formData)                                    src/actions/auth.ts:45
    1. ip = clientIp(headers())                  X-Forwarded-For lido da direita (TRUST_PROXY_HOPS)
    2. registerLimiter.retryAfter(ip) > 0        → "Muitos cadastros a partir desta rede…"
    3. registerSchema.safeParse(...)             → fieldErrors por campo
         username   3–24, [a-zA-Z0-9_.], vira minúsculo
         email      trim, formato, vira minúsculo
         password   8–72 (72 é o limite do bcrypt); passwordConfirm igual
    4. registerLimiter.hit(ip)                   conta toda tentativa válida, inclusive as que dão certo
    5. user.findUnique({ email })    existe?     → fieldErrors.email
       user.findUnique({ username }) existe?     → fieldErrors.username
    6. user.create({ username, email, passwordHash: bcrypt(senha, 10) })
         role = USER · active = true · emailVerifiedAt = null · image = null
    7. recordAudit(USER_CREATED)                 ator = o próprio usuário, com IP e user agent
    8. signIn("credentials", { username, password, redirectTo: "/onboarding" })
```

Três decisões que aparecem aqui:

- **O limitador conta sucessos** (10 por hora por IP). O risco do cadastro não é adivinhar
  senha, é criar contas em massa: cada cadastro custa um bcrypt e uma linha.
- **`emailVerifiedAt` nasce nulo.** O cadastro por senha não prova posse do e-mail, e é esse
  campo que decide o que acontece se um dia essa conta for vinculada ao Google (ver 3.4).
- **Usuário e e-mail são normalizados para minúsculas** aqui e no login (`credentialsSchema`),
  então o login não diferencia maiúsculas.

#### 3.2 O login automático: `signIn` sem HTTP

O passo 8 é o mesmo caminho de qualquer login por senha. O `signIn` do `next-auth`, chamado numa
Server Action, **não faz requisição HTTP**: monta um `Request` para
`/api/auth/callback/credentials` com os headers da própria action e chama `Auth()` no mesmo
processo, com `skipCSRFCheck` (a action já passou pela checagem de `Origin` do Next).

```
signIn("credentials")                            node_modules/next-auth/lib/actions.js
  → Auth(new Request(".../api/auth/callback/credentials"), { raw, skipCSRFCheck })
      → authorize(raw, request)                                     src/auth.ts:42
           credentialsSchema.safeParse
           loginLimiter.retryAfter(ip) > 0       → throw RateLimitedSignin (code "rate_limited")
           verifyCredentials("rafa", senha, ip)                     src/lib/auth/credentials.ts:20
              user.findUnique({ username })
              bcrypt.compare(senha, passwordHash)   (usuário inexistente: compara com um hash fictício)
              user.active?                          (conferido DEPOIS do bcrypt: mesmo tempo de resposta)
           → { id: "u1", username: "rafa" }
      → callbacks.signIn                         provider "credentials" → true
      → callbacks.jwt (trigger "signIn")                            src/auth.ts:79
           openSession("u1")                                        src/lib/auth/session-store.ts:60
             raw = 32 bytes aleatórios em base64url   ("S0")
             SessionToken.create({ familyId: uuid, tokenHash: sha256(S0), usedAt: agora,
                                   expiresAt: agora + 30 dias })
             purgeDeadSessionTokens({ userId })       faxina oportunista
           → { sub: "u1", sid: "S0", rot: agora }
      → Auth.js cifra o JWE (dir + A256CBC-HS512; chave derivada do AUTH_SECRET, salt = nome do cookie)
  → cookies().set("authjs.session-token", <JWE>, { httpOnly, sameSite: "lax", path: "/",
                                                    secure: se https, maxAge: 30 dias })
  → redirect("/onboarding")
```

- **O rate limit do login mora no `authorize`**, e não na `loginAction`, porque
  `/api/auth/callback/credentials` pode ser chamado direto, sem passar por action nenhuma. No
  cadastro isso tem um efeito colateral raro: se o IP já estourou as 8 falhas de login, a conta
  é criada mas o login automático falha, e Rafa vê "Conta criada. Entre com seu usuário e senha."
- **A senha é verificada duas vezes** (um bcrypt no `create`, outro no `authorize`). É o preço de
  usar a única porta que faz o Auth.js emitir o cookie.
- **O callback `jwt` só abre família no login.** Ele também roda a cada leitura da sessão pelo
  Auth.js, inclusive onde o cookie não pode ser gravado; rotacionar ali emitiria um token que
  nunca chegaria ao navegador.
- **O callback `session` devolve só `{ user: { id } }`.** Nada do token vai para
  `/api/auth/session`; quem pergunta "quem está logado?" pergunta a `getCurrentUser()`.

#### 3.3 O estado ao fim do passo 3

```
Cookie        authjs.session-token = JWE{ sub: "u1", sid: "S0", rot: T0 }        httpOnly · Lax · 30 dias
                                     (__Secure-authjs.session-token quando servido por https)

User          u1  username "rafa" · email "rafa@exemplo.com" · passwordHash bcrypt(10)
                  role USER · active true · emailVerifiedAt null · image null
SessionToken  t0  userId u1 · familyId f1 · tokenHash sha256(S0) · usedAt T0 · revokedAt null
                  expiresAt T0 + 30 dias
AuditLog          USER_CREATED · actorId u1 · ip · userAgent
PlayerProfile     (ainda não existe)
```

O valor `S0` existe **só dentro do cookie cifrado**. O banco guarda o SHA-256 (não bcrypt: o
valor já é aleatório de alta entropia), então um dump do banco não devolve sessão a ninguém. E o
cookie é cifrado, não só assinado: nem o próprio navegador lê o `sid`.

#### 3.4 Variante: "Continuar com o Google"

```
<form action={googleSignInAction}>   proximo = "/onboarding"
  → signIn("google")     o Auth.js grava cookies de state e PKCE e manda para accounts.google.com
                         (prompt=select_account)
Google → GET /api/auth/callback/google?code=…&state=…
  proxy: "auth-endpoint" → não rotaciona, não redireciona
  Auth.js: confere state + PKCE, troca o code, valida o id_token
  callbacks.signIn → signInWithGoogle(providerAccountId, profile)   src/lib/auth/google.ts:26
     e-mail ausente ou email_verified ≠ true → nega            (/login?error=AccessDenied)
     conta Google já vinculada               → entra            (desativada → nega)
     usuário com o mesmo e-mail              → vincula          (desativado → nega)
     ninguém                                 → cria: username a partir do e-mail, sem senha,
                                               emailVerifiedAt = agora, image = foto do Google
  callbacks.jwt → userIdForGoogleAccount (busca o vínculo; não confia no objeto do callback)
               → openSession → cookie → redirect /onboarding
```

**O vínculo por e-mail é o ponto delicado.** Como o cadastro por senha não verifica e-mail,
qualquer pessoa poderia ter criado a conta `rafa@exemplo.com` antes de Rafa chegar
(*pre-account hijacking*). Quando o Google prova a posse do e-mail e a conta tem senha com
`emailVerifiedAt` nulo, `linkGoogleAccount` **remove a senha e revoga todas as sessões** numa
transação, registra `google_account_linked` com `passwordDropped: true` e grava auditoria. Uma
redefinição de senha por e-mail preenche `emailVerifiedAt`, então quem já redefiniu a senha
mantém a senha ao vincular o Google. O raciocínio completo está em
[`arquitetura-modulo-autenticacao.md` §7.6](arquitetura-modulo-autenticacao.md#76-login-com-google).

---

## 5. Parte II — Primeiro acesso

### Passo 4 — `GET /onboarding`: a primeira página autenticada

```
GET /onboarding
  proxy: classifyPath → "protected-page"; claims decifram; rot recente → next()   (sem banco)
  RootLayout → getSessionPromise() (sem await) → UserProvider
  OnboardingPage                                                    src/app/onboarding/page.tsx
    pageUser()                                                      src/lib/session.ts:140
      getCurrentUser()                                              src/lib/session.ts:28
         readSessionCookie(cookie)             → { sub: "u1", sid: "S0", rot: T0 }
         sessionToken.findUnique({ tokenHash: sha256(S0) })  + user + authProviders + profile
                                               (uma consulta)
         token existe? token.user.id === claims.sub? user.active?
         resolveTokenState(token)              → "active"
      getSystemSettings().publicAccessEnabled? senão redirect /maintenance (superadmin passa)
    user.profileCompleted?                     → não; se sim, redirect "/"
    playerProfile.findUnique({ userId })       → null → EMPTY_PROFILE (+ foto do Google, se houver)
```

O que `getCurrentUser()` devolve para Rafa, e que é tudo o que o cliente chega a ver da sessão:

```ts
{ id: "u1", email: "rafa@exemplo.com", username: "rafa", name: null, role: "USER",
  profileCompleted: false, photoUrl: null, hasPassword: true, googleLinked: false }
```

Nenhum token, nenhum hash: `hasPassword` é um booleano derivado de `passwordHash !== null`.

**O funil do primeiro acesso é aplicado página a página.** `/onboarding` fica fora do grupo
`(app)`, então não tem `AppShell` nem navegação. Toda página dentro de `(app)` começa com
`pageUserWithProfile()`, que manda de volta para `/onboarding` enquanto o perfil não estiver
completo; digitar outro endereço não adianta. A guarda **não** está no `(app)/layout.tsx` de
propósito: um `await` na sessão ali bloquearia toda navegação do grupo e esconderia os
`loading.tsx`. E o próprio `/onboarding` usa `pageUser()`, e não `pageUserWithProfile()`, senão
entraria em loop.

### Passo 5 — Foto e perfil de jogador

```
fetch POST /api/uploads   multipart { file, tipo: "foto" }
  proxy: "protected-api", POST → não rotaciona; claims ok → next()
  route(async () => {                                               src/app/api/uploads/route.ts
    requireUser()                  401 sem sessão · 403 em manutenção
    FOLDERS["foto"]                → "fotos"   (tipo desconhecido → 400)
    saveUpload(file, "fotos")      JPEG/PNG/WebP · até MAX_UPLOAD_MB (5) · não vazio
                                   chave = fotos/<randomUUID>.<ext>
    → { url: "/api/files/fotos/<uuid>.jpg" }
  })

fetch PUT /api/profile   JSON { name, nickname, foot, position, age, heightCm, weightKg, photoUrl }
  route(async () => {                                               src/app/api/profile/route.ts
    requireUser()
    profileSchema.parse(body)      → 422 { details: { campo: mensagem } }
    playerProfile.upsert({ where: { userId: user.id }, ..., completed: true })
    recordAudit(PROFILE_COMPLETED)   (PROFILE_UPDATED quando o perfil já estava completo)
  })

cliente (useProfileForm): router.replace("/") + router.refresh()
```

Duas proteções que não aparecem como `if`:

- **Propriedade por construção.** `PUT /api/profile` não recebe id: o alvo é sempre `user.id`, que
  vem da sessão. Não existe "editar o perfil de outra pessoa" para barrar.
- **Lista branca no schema.** `profileSchema` não tem `stars` nem `completed`, e o Zod descarta
  chaves desconhecidas. Mandar `"stars": 5` no corpo não faz nada: estrela é avaliação do admin
  (`/api/players/:id/evaluation`, com `requireAdmin()`), e `completed: true` é o servidor que põe.

O `router.refresh()` aqui é necessário (o servidor precisa recalcular `profileCompleted`). Na
edição posterior do perfil ele não é: `useUpdateCurrentUser({ photoUrl })` aplica a foto nova
sobre o usuário do contexto, sem ida e volta.

---

## 6. Parte III — A inscrição

### Passo 6 — A home

```
GET /
  proxy: "protected-page"; claims ok; rot < 15 min → next()
  RootLayout → getSessionPromise()            (dispara getCurrentUser, sem esperar)
  (app)/layout → <AppShell>                   a casca aparece na hora; avatar e links de admin
                                              suspendem cada um no seu <Suspense>
  HomePage → pageUserWithProfile()            src/app/(app)/page.tsx:11
               getCurrentUser()               mesma promise do layout (cache do React): 1 consulta
             gameDay.findFirst({ status ≠ FINISHED, orderBy: scheduledAt asc })
               + registrations where userId = u1
```

O `AppShell` filtra os links extras pelo papel (`ExtraNav`), no cliente. Isso é aparência: Rafa
(USER) não vê "Avaliar jogadores", mas se digitar `/players` quem barra é o `pageAdmin()` da
página, que manda para `/`.

### Passo 7 — A página da pelada, e a rotação no meio do caminho

Rafa demorou 20 minutos preenchendo o perfil. O login foi em T0; agora são T0 + 21 min, e o
clique em "Ver a pelada" é a primeira navegação `GET` depois de o token passar da idade de
rotação.

```
GET /game-days/g1                cookie: { sub: "u1", sid: "S0", rot: T0 }
  proxy                                                             src/proxy.ts:36
    canRotate: GET · não é /api/auth · sem Purpose: prefetch → sim
    needsRotation(claims): agora − T0 ≥ 15 min → rotateSessionToken("S0")
      inspectForProxy: S0 → "active"
      $transaction:
        SELECT id FROM "SessionToken" WHERE id = t0 FOR UPDATE   (abas em paralelo: só uma emite)
        já há pendente com < 60 s nesta família? não
        revoga pendentes velhos (resposta perdida); cria t1 { tokenHash: sha256(S1), usedAt: null }
    → Set-Cookie { sub: "u1", sid: "S1", rot: agora, pend: true }
    O render desta mesma requisição já enxerga S1 (o Next repassa ao cookies() o que o proxy gravou)

  GameDayPage                                                       src/app/(app)/game-days/[id]/page.tsx:23
    pageUserWithProfile()        getCurrentUser(S1): pendente conta como "active" → Rafa
    isAdmin(Rafa)                → false
    gameDay.findUnique(g1, include: registrations + perfil, teams, reserves)
                                 → notFound() se não existe
    paymentRows                  montado com o receiptUrl de TODOS os inscritos...
    <PaymentList rows>           ...mas só renderizado para admin
    <RegistrationPanel registration={null} open={status === "OPEN"} full={inscritos ≥ maxPlayers}>
```

Estado da família depois desta requisição: `t0` (atual, usado) e `t1` (pendente). Nada foi
revogado ainda: se a resposta com `S1` se perder (aba fechada, rede do celular), o navegador
continua com `S0`, que continua valendo. A confirmação vem no passo 10. O protocolo completo, e
por que ele tem dois tempos, está em
[`arquitetura-modulo-autenticacao.md` §4](arquitetura-modulo-autenticacao.md#4-o-protocolo-de-sessão-rotativa).

**Visibilidade é decidida no Server Component.** O que a página não passa para um Client
Component não sai do servidor. Para Rafa, a lista "Quem vai" leva nome, foto e estrelas de cada
inscrito, mas nenhum `receiptUrl`; para admin, `PaymentList` leva os comprovantes. A diferença
não é CSS nem `if` no cliente.

**Não existe pertencimento.** Qualquer pessoa com conta e perfil vê e se inscreve em qualquer
pelada: o Voa Craque é de um grupo só, e os papéis são globais. Um 404 aqui significa "a pelada
não existe", não "você não faz parte".

### Passo 8 — O comprovante do PIX

O `RegistrationPanel` abre com PIX selecionado e a chave do organizador para copiar. Rafa paga e
anexa o comprovante:

```
fetch POST /api/uploads   multipart { file, tipo: "comprovante" }
  requireUser()
  saveUpload(file, "comprovantes")   → "/api/files/comprovantes/<uuid>.jpg"
                                       driver s3: bucket privado; a URL é sempre a do proxy /api/files
```

O arquivo ainda não pertence a nenhuma inscrição. Até o passo 9, só admin consegue abri-lo
por `/api/files` — nem Rafa, que receberia 403 (a posse é conferida pela inscrição).

### Passo 9 — A inscrição: `POST /api/game-days/g1/registrations`

```
fetch POST /api/game-days/g1/registrations
      { paymentMethod: "PIX", receiptUrl: "/api/files/comprovantes/<uuid>.jpg" }
      cookie: { sid: "S1", pend: true }

proxy
  classifyPath → "protected-api"; claims decifram
  canRotate? POST → não: nem rotaciona nem confirma. O pendente é aceito como está.
  → next()

route(async () => {                                   src/app/api/game-days/[id]/registrations/route.ts:11
  requireUser()                                       ① autenticação           → 401
    getCurrentUser(S1) → Rafa
    assertSiteOpen(): publicAccessEnabled?            manutenção              → 403 (superadmin passa)
  registrationSchema.parse(body)                      paymentMethod ∈ {PIX, ON_SITE} · receiptUrl ≤ 500
                                                                              → 422 { details }
  settings.registrationOpen?                          ② estado global         → 409 "inscrições fechadas"
  gameDay.findUnique(g1, _count.registrations)        existe?                 → 404
  gameDay.status === "OPEN"?                          ③ estado do recurso     → 409 "já foram encerradas"
  registration.findUnique({ gameDayId: g1, userId: u1 })
                                                      ④ já inscrito?          → 409
  _count.registrations ≥ maxPlayers?                  ⑤ lotação               → 409 "lotada"
  PIX sem receiptUrl?                                                         → 400 "Anexe o comprovante"
  registration.create({
      gameDayId: "g1",
      userId: user.id,                                ← da sessão, nunca do corpo
      paymentMethod, receiptUrl,
      amountCents: gameDay.pricePerPlayerCents,       ← preço do servidor, congelado neste momento
      // paymentStatus: PENDING (default do schema)
  })
  recordAudit(REGISTRATION_CREATED)                   ator u1 · after = a inscrição · IP · user agent
  publishGameDay("g1", "registration-created")        avisa as telas ao vivo abertas (SSE)
  → 200 { id: "r1" }
})
```

**O que o corpo da requisição não consegue decidir:**

| Campo | Quem decide | Por quê |
| :-- | :-- | :-- |
| `userId` | A sessão | Ninguém inscreve outra pessoa |
| `amountCents` | `gameDay.pricePerPlayerCents` | Rafa não escolhe quanto paga; o valor fica congelado mesmo que o preço mude depois |
| `paymentStatus`, `confirmedById`, `confirmedAt` | Default `PENDING`; só `requireAdmin()` muda | Não estão no `registrationSchema`, e o Zod descarta chaves desconhecidas |
| Se as inscrições estão abertas | `SystemSetting.registrationOpen` + `GameDay.status` | Estado do servidor, não do botão |

**CSRF.** A rota aceita JSON com cookie, sem token anti-CSRF próprio. A defesa é o cookie
`SameSite=Lax`: um `POST` vindo de outro site não leva o cookie, o proxy não vê sessão e
responde 401 antes de a rota rodar. As Server Actions ainda têm, além disso, a checagem de
`Origin` do Next.

### Passo 10 — A volta: `router.refresh()` confirma o sucessor

O `useRegistrationPanel` mostra o toast "Inscrição feita" e chama `router.refresh()`, que é um
`GET` de verdade (não é prefetch), então passa pelo proxy:

```
GET /game-days/g1 (RSC)          cookie: { sid: "S1", pend: true }
  proxy: GET → canRotate → claims.pend → acknowledgeSessionToken("S1")
    $transaction:
      t1.usedAt = agora                          (S1 passa a ser o atual)
      revoga o resto da família f1               (t0: revokedAt = agora)
    → Set-Cookie { sid: "S1", rot: (o mesmo), sem pend }
  GameDayPage → pageUserWithProfile() → myRegistration = r1
    <RegistrationPanel registration={r1}>        "Sua inscrição: Pendente · PIX" + "Ver meu comprovante"
```

O `pend` é a **prova de recebimento**: só um cookie que o navegador devolveu pode confirmar o
sucessor, e só o proxy vê o cookie de entrada. Uma requisição que já estava em voo com `S0` e
chega nos próximos 60 s cai na graça (a família tem `S1` vivo) e passa sem alarme; `S0`
reaparecendo depois disso é tratado como roubo e derruba a família.

Rafa abre o próprio comprovante:

```
GET /api/files/comprovantes/<uuid>.jpg                              src/app/api/files/[...path]/route.ts:16
  requireUser()
  segments[0] === "comprovantes" && !isAdmin(Rafa)
    registration.findFirst({ receiptUrl: "/api/files/comprovantes/<uuid>.jpg", userId: "u1" })
                                                 → r1 → pode
                                                 (sem inscrição com essa URL → 403 "Este comprovante não é seu.")
  STORAGE_DRIVER=s3    → 302 para uma URL assinada de 60 s
  STORAGE_DRIVER=local → bytes com Cache-Control: private
```

**Cancelar** usa a mesma rota com `DELETE`. Ela não recebe id de inscrição: busca por
`(gameDayId, user.id)`, então a posse é a própria chave de busca. Só funciona com a pelada em
`OPEN` (depois dos times montados, 409 "fale com o organizador"), apaga a linha e grava
`REGISTRATION_CANCELLED` com o `before`, de modo que o histórico sobrevive na auditoria.

---

## 7. Parte IV — Quem organiza confirma o pagamento

### Como alguém vira admin

O superadmin nasce no seed (`SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`). Ele promove outras contas
em `/admin/users`, que chama `PATCH /api/users/:id/role` com `requireSuperadmin()`; a rota
recusa rebaixar a própria conta. Como `getCurrentUser()` lê o papel do banco a cada requisição,
promoção e rebaixamento valem na requisição seguinte, sem token para reemitir e sem logout.

### Passo 11 — `PATCH /api/game-days/g1/registrations/r1`

```
a1 abre /game-days/g1
  pageUserWithProfile() + isAdmin(a1) → <PaymentList> com os comprovantes
  GET /api/files/comprovantes/<uuid>.jpg → requireUser(); isAdmin → sem checagem de posse

fetch PATCH /api/game-days/g1/registrations/r1   { paymentStatus: "CONFIRMED" }
route(async () => {                              src/app/api/game-days/[id]/registrations/[registrationId]/route.ts:18
  requireAdmin()                                 401 · 403 "Ação restrita aos organizadores."
  paymentDecisionSchema.parse(body)              PENDING | CONFIRMED | REJECTED
  registration.findUnique(r1)
  r1 existe E r1.gameDayId === "g1"?             → 404   (os dois ids da URL precisam concordar)
  REJECTED sem rejectedReason?                   → 400 "Diga o motivo da recusa."
  registration.update(r1, { paymentStatus: CONFIRMED, confirmedById: a1, confirmedAt: agora })
  recordAudit(PAYMENT_CONFIRMED, before/after)
  publishGameDay("g1", "payment-updated")
})
```

A página da pelada de Rafa não assina o canal ao vivo (só a tela `/live` usa `EventSource`);
o "Confirmado" aparece no próximo carregamento.

Se Rafa tentasse esse mesmo `PATCH` para confirmar o próprio pagamento, `requireAdmin()`
responderia 403 antes de ler o corpo.

---

## 8. A autorização vista de cima

### 8.1 As cinco camadas, no Voa Craque

O modelo de cinco camadas de
[`arquitetura-modulo-autenticacao.md` §6](arquitetura-modulo-autenticacao.md#6-autorização-em-cinco-camadas),
aplicado a este código:

| Camada | Pergunta | Onde mora aqui | Falha com | Na jornada |
| :-- | :-- | :-- | :-- | :-- |
| 1. Autenticação | Existe sessão válida? | `getCurrentUser()`, chamado por toda guarda | 401 / `/login` | Todos os passos a partir do 4 |
| 2. Pertencimento | Você faz parte deste recurso? | **Não existe**: um grupo só, papéis globais | — | — |
| 3. Papel | USER, ADMIN ou SUPERADMIN? | `requireAdmin`, `requireSuperadmin`, `pageAdmin`, `pageSuperadmin` | 403 / redirect `/` | Passo 11 |
| 4. Propriedade | O recurso é seu? | A chave de busca vem da sessão (`userId: user.id`); `/api/files` confere o dono do comprovante | 404 / 403 | Passos 5, 9, 10 |
| 5. Estado | O recurso aceita isso agora? | Na própria rota, depois de carregar o recurso | 409 | Passo 9 |

Duas checagens transversais completam o quadro:

- **Manutenção** (`assertSiteOpen`, `SystemSetting.publicAccessEnabled`): páginas vão para
  `/maintenance`, rotas respondem 403; o superadmin passa.
- **Perfil completo** (`pageUserWithProfile`): só nas páginas. As rotas de API não conferem
  (ver [10.1](#101-a-regra-do-perfil-completo-só-existe-nas-páginas)).

### 8.2 Mapa das guardas

| Guarda | Usada em | Sem sessão | Manutenção | Sem perfil | Papel insuficiente |
| :-- | :-- | :-- | :-- | :-- | :-- |
| `pageUser()` | `/onboarding` | `/login` | `/maintenance` | Passa | — |
| `pageUserWithProfile()` | `/`, `/game-days`, `/game-days/:id`, `/game-days/:id/live`, `/ranking`, `/profile` | `/login` | `/maintenance` | `/onboarding` | — |
| `pageAdmin()` | `/game-days/new`, `/game-days/:id/edit`, `/teams`, `/panel`, `/players` | `/login` | `/maintenance` | `/onboarding` | `/` |
| `pageSuperadmin()` | `/admin/users`, `/admin/system`, `/admin/audit` | `/login` | `/maintenance` | `/onboarding` | `/` |
| `requireUser()` | `/api/profile`, `/api/uploads`, `/api/files/*`, `POST`/`DELETE` de inscrição, `GET /api/game-days`, `/api/players/:id`, `/api/game-days/:id/live` | 401 | 403 | **Não confere** | — |
| `requireAdmin()` | Pagamento, criar/editar pelada, times, sorteio, encerrar, partidas e eventos, avaliação de jogador | 401 | 403 | Não confere | 403 |
| `requireSuperadmin()` | `/api/system`, `/api/users/:id/role` | 401 | 403 | Não confere | 403 |
| `getCurrentUser()` direto | `/api/game-days/:id/stream`, `/maintenance`, `changePasswordAction` | 401 / `null` | **Não confere** | Não confere | — |
| Nenhuma | `/game-days/:id/stats` (rota `public`) | Passa | Passa | — | — |

### 8.3 O que Rafa tenta, e onde é barrado

| Rafa tenta | Onde barra | Resposta |
| :-- | :-- | :-- |
| Abrir `/players` ou `/admin/users` | `pageAdmin()` / `pageSuperadmin()` | Redirect `/` |
| Confirmar o próprio pagamento (`PATCH …/registrations/r1`) | `requireAdmin()` | 403 |
| Mandar `paymentStatus: "CONFIRMED"` ou `amountCents: 0` no `POST` da inscrição | `registrationSchema` descarta; o servidor define | Ignorado |
| Mandar `stars: 5` no `PUT /api/profile` | `profileSchema` não tem `stars` | Ignorado |
| Inscrever outra pessoa | `userId` vem da sessão | Impossível pela rota |
| Cancelar a inscrição de outra pessoa | `DELETE` busca por `(gameDayId, user.id)` | 404 "Você não está inscrito" |
| Abrir o comprovante de outra pessoa | `/api/files` confere `Registration.receiptUrl` + `userId` | 403 |
| Se inscrever duas vezes | Checagem na rota + `@@unique([gameDayId, userId])` | 409 |
| Cancelar depois de os times estarem montados | `status !== "OPEN"` | 409 |
| Entrar numa pelada lotada ou com inscrições fechadas | `_count` × `maxPlayers`; `registrationOpen`; `status` | 409 |
| Usar a sessão depois de sair | `logoutAction` revoga a família; `getCurrentUser` recusa | `/login` ou 401 |
| Reapresentar um cookie antigo copiado | Rotação com detecção de reuso | Família inteira cai; `session_token_reuse` no log |
| Usar o site em manutenção | `pageUser()` / `requireUser()` | `/maintenance` / 403 |
| Chutar senhas em `/api/auth/callback/credentials` direto | `loginLimiter` dentro do `authorize` | `?error=CredentialsSignin&code=rate_limited` depois de 8 falhas em 15 min |

---

## 9. Depois da inscrição: o resto do ciclo da sessão

| Evento | O que acontece | Onde |
| :-- | :-- | :-- |
| Rafa entra pelo celular | `loginAction` → mesmo caminho do 3.2 → **outra família**; as duas sessões convivem | `src/actions/auth.ts:25` |
| 15 min de uso em cada aparelho | Rotação e confirmação independentes por família | `src/proxy.ts` |
| Rafa clica em "Sair" | `signOut` → `events.signOut` → `revokeSessionFamily`: cai a família **deste** aparelho, na hora | `src/auth.ts:96` |
| Troca de senha logada | Revoga as **outras** famílias; a deste aparelho continua sem reescrever o cookie | `src/actions/password.ts:57` |
| Redefinição por e-mail | Revoga **todas** as famílias, não abre nenhuma, marca o e-mail como verificado | `src/lib/auth/password-reset.ts:51` |
| Conta desativada | `getCurrentUser` confere `active`: acesso cai na próxima requisição | `src/lib/session.ts:54` |
| 30 dias sem uso | Cookie e linha expiram juntos; a purga apaga a linha um dia depois | `scripts/purge-sessions.ts` |

A tabela completa (incluindo vínculo com Google e troca de `AUTH_SECRET`) está em
[`arquitetura-modulo-autenticacao.md` §7.9](arquitetura-modulo-autenticacao.md#79-ciclo-de-vida-da-sessão-cenário-a).

---

## 10. Limites encontrados na análise

Pontos em que o comportamento atual difere do que a arquitetura promete, ou em que a proteção
depende de algo mais fraco do que parece. Nenhum deles é explorável de forma trivial hoje, mas
todos são baratos de fechar.

### 10.1 A regra do perfil completo só existe nas páginas

`pageUserWithProfile()` barra a navegação, mas `requireUser()` (`src/lib/session.ts:108`) não
olha `profileCompleted`. Quem chama `POST /api/game-days/:id/registrations` direto, logo depois
do cadastro, entra na pelada sem perfil. Nada quebra — `loadPool` (`src/services/teams.ts:49`)
cai no `username` e manda posição, altura, peso e estrelas como nulos para o balanceador —, mas
o sorteio passa a trabalhar com um jogador sem dados, e a regra "ninguém joga sem perfil" fica
dependendo de o cliente se comportar.

**Correção:** uma guarda `requireUserWithProfile()` nas rotas que criam participação.

### 10.2 Lotação e duplicidade são "confere, depois grava"

A rota de inscrição lê `_count.registrations` e só depois cria a linha, sem transação nem trava
(`src/app/api/game-days/[id]/registrations/route.ts:20-46`). Duas inscrições simultâneas na
última vaga passam as duas: a pelada fica com `maxPlayers + 1`. A duplicidade da mesma pessoa é
segurada pela constraint `@@unique([gameDayId, userId])`, mas a requisição perdedora recebe o
`P2002` do Prisma, que `toErrorResponse` (`src/lib/http.ts:33`) não traduz: vira 500 "Erro
interno" em vez de 409. O `registerAction` tem o mesmo padrão para usuário e e-mail repetidos.

**Correção:** contar e criar dentro de uma transação com `SELECT … FOR UPDATE` na linha da
pelada (a mesma técnica de `rotateSessionToken`) e mapear `P2002` para 409 em `toErrorResponse`.

### 10.3 `receiptUrl` é texto livre, e é dele que sai a posse do comprovante

`registrationSchema` (`src/lib/validation.ts:89`) só limita o tamanho de `receiptUrl`. Duas
consequências:

- A exigência "PIX precisa de comprovante" aceita qualquer string não vazia, e o `PaymentList`
  do admin a transforma em link — que pode apontar para fora do site.
- `/api/files` decide se um não-admin pode abrir um comprovante procurando uma inscrição **dele**
  com aquele `receiptUrl` (`src/app/api/files/[...path]/route.ts:21`). Como o próprio usuário
  escreve esse campo, quem souber a URL do comprovante de outra pessoa pode colocá-la na própria
  inscrição e passar a lê-la.

Hoje o nome do arquivo é um `randomUUID` e nenhum não-admin recebe URL de comprovante alheio (a
página só passa `paymentRows` ao `PaymentList` quando o usuário é admin). A proteção, portanto,
vem de o nome ser imprevisível, não do controle de acesso.

**Correção:** gravar o comprovante sob `comprovantes/<userId>/<uuid>.<ext>`, aceitar na inscrição
só URLs com o prefixo `/api/files/comprovantes/<user.id>/`, e conferir o `userId` do caminho em
`/api/files`.

### 10.4 O canal ao vivo não respeita a manutenção

`/api/game-days/:id/stream` chama `getCurrentUser()` direto
(`src/app/api/game-days/[id]/stream/route.ts:19`): confere a sessão, mas não passa por
`assertSiteOpen`. Com o site em manutenção, uma tela ao vivo já aberta continua recebendo
snapshots, e o tique de 1 s continua chamando `syncMatchClock`.

**Correção:** `await assertSiteOpen(user)` logo depois da checagem de sessão, mantendo o 401 em
JSON que o `EventSource` espera.

### 10.5 O cadastro diz quais e-mails e usernames já existem

O login é anti-enumeração (mesma mensagem para usuário inexistente e senha errada, custo constante
de bcrypt), mas o `registerAction` responde "Já existe uma conta com este e-mail."
(`src/actions/auth.ts:65-73`). Sem verificação de e-mail no cadastro, é difícil evitar: a
alternativa seria sempre responder "confira seu e-mail". O `registerLimiter` (10 por hora por IP)
limita a varredura. É um trade-off aceitável, mas vale estar escrito.

### 10.6 Rate limit por instância

Os limitadores são um `Map` em memória (`src/lib/rate-limit.ts`). Com uma instância só, como
hoje, funcionam; com duas, cada uma teria o próprio balde e o teto efetivo dobraria.

---

## 11. O que os testes cobrem

| Parte da jornada | Arquivo | O que trava |
| :-- | :-- | :-- |
| Classificação de rotas do proxy, destino pós-login | `tests/auth-support.test.ts` | Cada tipo de rota (menos o padrão público de `/game-days/:id/stats`, que não tem caso); `/api/authorize-algo` não é tratado como Auth.js; `//evil.com`, `/\evil.com` e `https://evil.com` viram `/` |
| IP do cliente, limitadores | `tests/auth-support.test.ts` | Entrada forjada à esquerda ignorada; N proxies; teto, janela, balde compartilhado |
| Patch do usuário no `UserProvider` | `tests/auth-support.test.ts` | Mescla sem apagar campos; edições acumulam; sem sessão, o patch não cria usuário |
| Cookie e estado do token | `tests/auth-session.test.ts` | Ida e volta dos claims; adulterado e segredo trocado não decifram; `AUTH_SECRET_1` ainda decifra; graça só com sucessor vivo; limite exato da janela |
| Redefinição de senha | `tests/password-reset.test.ts` | Classificação e hash do token, URL a partir de `AUTH_URL`, schemas, mailer |

Todos são testes de **funções puras**. Nada que toca o Prisma tem teste: `registerAction`,
`authorize`/`verifyCredentials`, `signInWithGoogle`, o próprio `proxy()`, `getCurrentUser()` e as
guardas, a rotação e a confirmação contra o banco, as rotas de inscrição e pagamento e
`/api/files`. A [§12](arquitetura-modulo-autenticacao.md#12-o-que-os-testes-precisam-travar) do
guia de desenho lista os casos de ponta a ponta que valem a pena; os itens 10.1 a 10.3 deste
documento são bons primeiros candidatos, porque um teste de cada teria falhado.

---

## 12. Referências

**Neste repositório**

- [`arquitetura-modulo-autenticacao.md`](arquitetura-modulo-autenticacao.md) — o guia de desenho:
  princípios, protocolo de sessão rotativa, `UserProvider`, cinco camadas, armadilhas do Next 16
- [`refatoracao-contexto-usuario.md`](refatoracao-contexto-usuario.md) — a medição que levou à
  promise no contexto
- [`arquitetura-autenticacao-e-autorizacao.md`](arquitetura-autenticacao-e-autorizacao.md) — o
  mesmo módulo no CRONOS (API externa), para comparação

**Código citado**, na ordem da jornada: `src/proxy.ts`, `src/lib/auth/routes.ts`,
`src/app/layout.tsx`, `src/actions/auth.ts`, `src/auth.ts`, `src/lib/auth/credentials.ts`,
`src/lib/auth/session-store.ts`, `src/lib/auth/session-cookie.ts`, `src/lib/auth/google.ts`,
`src/lib/session.ts`, `src/app/onboarding/page.tsx`, `src/app/api/uploads/route.ts`,
`src/app/api/profile/route.ts`, `src/app/(app)/game-days/[id]/page.tsx`,
`src/app/api/game-days/[id]/registrations/route.ts`, `src/app/api/files/[...path]/route.ts`,
`src/app/api/game-days/[id]/registrations/[registrationId]/route.ts`.

**Next.js 16** (a documentação vem no pacote, em `node_modules/next/dist/docs/01-app/`)

- `02-guides/data-security.md` — checagem de `Origin` × `Host` nas Server Actions
- `03-api-reference/03-file-conventions/proxy.md` — runtime Node, `matcher`, `has`/`missing`
