# Arquitetura da sessão: access JWT stateless + refresh token rotativo

Como o Voa Craque mantém alguém logado: um cookie de sessão que é um **JWT de 15 minutos, sem
nenhuma linha no banco**, e um **refresh token opaco de 7 dias, guardado (só o hash) no banco**,
que troca a sessão por uma nova sem pedir a senha de novo. Este documento descreve o que existe
hoje no código; a proposta original, com o comparativo entre o modelo antigo e este, está em
[`plano-sessao-jwt-stateless.md`](plano-sessao-jwt-stateless.md).

Ele substitui o protocolo de sessão rotativa com `SessionToken` descrito em
[`arquitetura-modulo-autenticacao.md`](arquitetura-modulo-autenticacao.md) (seções 3, 4 e 7). O
restante daquele documento (autorização por papel, `UserProvider`, guardas) continua valendo.

## Índice

1. [O mapa](#1-o-mapa)
2. [Os cookies](#2-os-cookies)
3. [Decisões e o porquê](#3-decisões-e-o-porquê)
4. [Fluxos](#4-fluxos)
5. [O que mata o quê](#5-o-que-mata-o-quê)
6. [Limites conhecidos](#6-limites-conhecidos)
7. [Referência × Voa Craque](#7-referência--voa-craque)
8. [Onde os testes cobrem cada parte](#8-onde-os-testes-cobrem-cada-parte)
9. [Operação](#9-operação)

---

## 1. O mapa

```
                      ┌────────────────────────────────────────────┐
  navegador ────────▶ │ src/proxy.ts                               │
  (2 cookies)         │  • verifica o access (assinatura, só CPU)  │
                      │  • access ausente/vencendo + refresh?      │
                      │      → rotateRefreshToken (banco)          │
                      │      → par novo no Set-Cookie e na request │
                      └───────────────┬────────────────────────────┘
                                      ▼
        página / Server Action / route handler /api/*
                 │
                 └─ getCurrentUser(): verifica o access + lê o usuário no banco (ativo?)
                                      │
                                      ▼
                       Postgres: User, RefreshToken (só o hash do refresh)
```

- **Quem lê a sessão** (`getCurrentUser`, em `src/lib/session.ts`) só confere o access token e
  carrega o usuário. Nunca grava cookie e não consulta o refresh.
- **Quem grava cookie de sessão**: o proxy (renovação), as Server Actions de autenticação
  (`establishSession`, `endSession`) e os route handlers de `/api/auth/*`. Só esses três, porque
  são os únicos pontos que sempre conseguem entregar um `Set-Cookie` ao navegador.

Arquivos:

| Arquivo | Papel |
| :-- | :-- |
| `src/lib/auth/config.ts` | Constantes (validades, graça, margem), nomes e atributos dos cookies |
| `src/lib/auth/tokens.ts` | Puro. Assina/verifica o access e o state do OAuth (`jose`); `needsRefresh` |
| `src/lib/auth/refresh-token-state.ts` | Puro. Gera e hasheia o refresh; `classifyRefreshToken` |
| `src/lib/auth/refresh-tokens.ts` | Prisma. Emite, rotaciona, revoga, `isSessionAlive`, purga |
| `src/lib/auth/session-cookies.ts` | Puro. Os dois cookies como dados (`CookieWrite`) |
| `src/lib/auth/establish-session.ts` | `establishSession`, `endSession`, `clearSessionCookies` (usam `cookies()`) |
| `src/lib/auth/google-oauth-state.ts` | Puro. Escopos, redirect URI, leitura dos claims do `id_token` |
| `src/lib/auth/google-oauth.ts` | Handshake com o Google (`arctic`): `startGoogleSignIn`, `finishGoogleSignIn` |
| `src/lib/auth/google.ts` | Regras de conta do login Google (vincular, criar, conta desativada) |
| `src/app/api/auth/callback/google/route.ts` | Fecha o handshake e abre a sessão |
| `src/app/api/auth/refresh/route.ts` | Renovação explícita (`POST`) |
| `src/proxy.ts` | Guarda de rota heurística e único ponto de renovação |

---

## 2. Os cookies

| Cookie | Conteúdo | Validade | Banco |
| :-- | :-- | :-- | :-- |
| `voacraque.session` | JWT HS256 (`sub` = id do usuário, `iss`, `aud`, `iat`, `exp`) | 15 min (`Max-Age=900`) | Nada |
| `voacraque.refresh` | 40 bytes aleatórios em hex, opaco | 7 dias (`Max-Age=604800`) | Só o SHA-256, em `RefreshToken` |
| `voacraque.oauth` | JWT com `state`, `code_verifier` e destino do login Google | 10 min | Nada |

Atributos, nos três: `HttpOnly`, `SameSite=Lax`, `Path=/`.

- **`Secure` e prefixo `__Host-`** sempre que a aplicação é servida por https, ou seja, quando
  `AUTH_URL` começa com `https://` (ou, sem `AUTH_URL`, quando `NODE_ENV=production`). Os nomes viram
  `__Host-voacraque.session` etc. O prefixo exige `Secure`, `Path=/` e nenhum `Domain`: um
  subdomínio não consegue plantar o cookie.
- **Por que não forçar `Secure` em `http://localhost`**: Chrome e Firefox aceitam, mas o Safari
  não, e o acesso pela rede local (`http://192.168.x.x:3000`, celular testando) perderia a sessão.
- **`SameSite=Lax`, não `Strict`**: o retorno do Google chega por navegação de topo vinda de outro
  site, e com `Strict` o navegador descartaria os cookies.
- **JWS (assinado) em vez de JWE (cifrado)**: o `sub` não é segredo e o cookie é `HttpOnly`; a
  assinatura impede adulteração, e cifrar só esconderia o que não precisa de sigilo.
- **Apagar** um cookie exige os mesmos atributos da criação (`secure`, `path`): use sempre
  `expiredSessionCookies()`.

---

## 3. Decisões e o porquê

| # | Decisão | Motivo |
| :-- | :-- | :-- |
| D1 | Sem Auth.js; o Google é feito com `arctic` | Ver [abaixo](#por-que-não-manter-o-authjs) |
| D2 | Access = JWT HS256, 15 min, `iss` e `aud` exigidos; `HttpOnly` sempre; `Secure` + `__Host-` em https | Cookie de sessão fora do banco; mesma escolha da referência |
| D3 | Refresh opaco (40 bytes hex), 7 dias, só o hash SHA-256 no banco, por família, rotativo, com graça de 10 s e detecção de reuso | Porte direto do `rotateRefreshToken` da referência |
| D4 | `revokedReason` em `RefreshToken`: só token aposentado **por rotação** pode ser lido como reuso | Ver [abaixo](#por-que-revokedreason) |
| D5 | Refresh deslizante: cada rotação cria o sucessor com 7 dias cheios | A sessão cai após 7 dias **sem uso** |
| D6 | Só o proxy renova, e só quando o access falta, é inválido ou tem menos de 60 s | Uma Server Action com upload de até 6 MB passa pelo proxy no início e só lê o access no fim |
| D7 | O proxy renova em páginas, Server Actions e `/api/*` (exceto `/api/auth/*`, POST em rota só-de-deslogado e prefetch especulativo) | As rotas de API rodam no mesmo processo, os hooks fazem `fetch` direto e há `EventSource` (sem retry); cobrir `/api/*` no proxy evita retry no cliente |
| D8 | `getCurrentUser()` continua sendo a autoridade: verifica o access, carrega o usuário e exige `active`. O papel não vai no token | Desativação e troca de papel valem na hora |
| D9 | O access **não é revogável** nos seus 15 min | Consequência de a sessão ser stateless |
| D10 | Logout revoga a **família inteira** | Mata também os sucessores criados na janela de graça |
| D11 | Nomes `voacraque.session`, `voacraque.refresh`, `voacraque.oauth`, com `__Host-` em https | Ver seção 2 |
| D12 | Chaves derivadas por finalidade (HKDF-SHA256 do `AUTH_SECRET`): uma para o access, outra para o state do OAuth, com `aud` diferente | Um token de uma finalidade nunca valida como outra. `AUTH_SECRET_1..3` seguem aceitos na verificação |
| D13 | As variáveis de ambiente não mudam de nome; só `AUTH_TRUST_HOST` deixou de existir | Nenhuma mudança de infraestrutura em produção |
| D14 | O callback do Google fica no mesmo caminho de antes: `/api/auth/callback/google` | Nada muda no Google Cloud Console |

### Por que não manter o Auth.js

Tecnicamente daria para manter o Auth.js com JWT assinado em vez de JWE (a configuração aceita
`jwt: { encode, decode }`). O problema não é o formato, é o modelo: o Auth.js tem **uma** sessão, um
cookie que ele mesmo grava, com `maxAge` e renovação dele. Ele não tem refresh token para a própria
sessão (o "refresh" dele é o do provedor OAuth), nem família, rotação ou reuso. Montar access de 15
min + refresh rotativo em banco por cima significa conviver com dois sistemas de sessão, desligar o
cookie dele na mão e depender de callbacks (`jwt`, `signIn`) que rodam em pontos onde nem sempre dá
para gravar cookie. Usá-lo só para o Google funcionaria, mas o projeto seguiria preso a uma versão
beta (`next-auth@5.0.0-beta.32`) por causa de um handshake que a `arctic` resolve em poucas linhas
explícitas: gerar `state` + `code_verifier`, guardá-los num cookie assinado, trocar o `code` pelo
`id_token` e conferir `iss`/`aud`. As regras que importam (vincular só por e-mail verificado, derrubar
senha não verificada, conta desativada) continuam em `src/lib/auth/google.ts`.

### Por que `revokedReason`

Sem ela, um aparelho que ainda guarda um refresh revogado por **troca de senha** dispararia
`refresh_token_reuse` ("roubo confirmado"): alarme falso. Com ela, só `ROTATED` fora da janela de
graça (ou sem sucessor vivo) é roubo. Qualquer outro motivo (`LOGOUT`, `PASSWORD_CHANGED`,
`PASSWORD_RESET`, `GOOGLE_LINKED`, `REUSE_DETECTED`) é sessão encerrada, registrada como
`refresh_token_revoked_use`, sem alarme.

---

## 4. Fluxos

### Login por senha e cadastro

`loginAction` valida o formulário, confere o limite de tentativas por IP (`loginLimiter`), chama
`verifyCredentials` e, com sucesso, `establishSession(user.id)`: emite um refresh de **família nova**
(um login novo em um aparelho), assina o access e grava os dois cookies. Depois `redirect(proximo)`. Como o
cookie foi alterado dentro de uma Server Action, o Next rerenderiza a árvore na mesma resposta e o
`UserProvider` já recebe o usuário logado, sem `router.refresh()`. `registerAction` cria a conta e
faz o mesmo, indo para `/onboarding`.

### Login com Google (state + PKCE)

1. `googleSignInAction` → `startGoogleSignIn`: gera `state` e `code_verifier`, grava o cookie
   `voacraque.oauth` (JWT de 10 min) e redireciona para o Google com `code_challenge` (S256) e
   `prompt=select_account`.
2. O Google devolve para `GET /api/auth/callback/google`. A rota apaga o cookie de state (uso único),
   confere `state`, troca o `code` pelo `id_token` (`finishGoogleSignIn`) e confere `iss`/`aud`.
3. `signInWithGoogle` aplica as regras de conta; `userIdForGoogleAccount` acha o dono;
   `establishSession` abre a sessão e a rota redireciona ao destino guardado.
4. Qualquer falha volta para `/login?error=AccessDenied|OAuthCallback|Configuration`.

### Navegar, com renovação no proxy

O proxy verifica o access (só assinatura, sem banco). Se ele é válido e tem mais de 60 s de vida, a
requisição segue **sem nenhuma consulta ao banco**. Se falta, é inválido ou está vencendo, e existe
o cookie de refresh, o proxy chama `rotateRefreshToken`:

- **`active`** (vivo): aposenta o token com `ROTATED` e cria o sucessor na mesma família, numa
  transação. Devolve par novo (access + refresh), no `Set-Cookie` e nos cookies da própria requisição.
- **`grace`** (rotacionado há no máximo 10 s e a família tem sucessor vivo): concorrência normal
  (duas abas, requisições em paralelo). Registra `refresh_token_grace_reuse` e cria mais um sucessor.
- **`reused`** (rotacionado fora da graça, ou sem sucessor vivo): alguém guardou uma cópia. Revoga a
  família inteira (`REUSE_DETECTED`), registra `refresh_token_reuse` e a sessão cai.
- **`revoked`** (logout, troca/redefinição de senha, vínculo do Google): registra
  `refresh_token_revoked_use` e a sessão cai, sem alarme.
- **`expired` / `unknown`**: a sessão cai, sem log (é rotina).

Quando a sessão cai, o proxy apaga os cookies e manda para `/login?proximo=...` (página) ou
responde 401 (API). Se o banco estiver fora do ar, o proxy **não desloga ninguém**: segue com o que o
access diz.

O `revokedAt` de um token já rotacionado nunca é reescrito (`where: { revokedAt: null }`): senão a
janela de graça andaria para a frente a cada reapresentação e um token roubado viveria para sempre. E
`user.active` é conferido **antes** de revogar, porque revogar deixaria a família sem sucessor vivo e
a próxima tentativa viraria "reuso".

### Server Action e API com o access vencido

O proxy renova antes de a action ou o handler rodarem, então eles já encontram a sessão válida. Dois
detalhes do Next importam aqui:

- O Next mescla o `Set-Cookie` do proxy no `cookies()` do render e das **Server Actions**, mas **não** no
  dos **route handlers** (`x-middleware-set-cookie` só é lido de `IncomingMessage`, e o handler recebe
  uma `NextRequest`). Por isso o proxy também grava os cookies novos nos **headers da requisição**
  (`NextResponse.next({ request: { headers } })`, ver `nextWithSession` em `src/proxy.ts`). Sem isso, a
  primeira chamada a `/api/*` depois de o access vencer renovaria a sessão e ainda assim responderia 401.
- Quando uma Server Action grava cookie (login, cadastro, logout, troca de senha, início do Google), a
  resposta leva os `Set-Cookie` do proxy **e** os da action, nessa ordem, e o navegador fica com o
  último de cada nome. Por isso **toda action que grava cookie deixa os dois cookies de sessão
  coerentes sozinha** (grava ou apaga os dois), e o proxy não renova em POST de rota só-de-deslogado
  (a action de login/cadastro/Google de uma aba antiga não precisa de sessão).

### Logout

`endSession` lê o refresh do `cookies()` (que já traz o valor rotacionado pelo proxy nesta requisição,
se houve), revoga a família com `LOGOUT` e apaga os dois cookies. Depois `redirect("/login")`.

### Troca de senha (logado)

Exige a senha atual. Depois de gravar a senha nova e invalidar os links de redefinição pendentes,
`revokeAllUserRefreshTokens(user.id, "PASSWORD_CHANGED")` derruba todas as famílias e
`establishSession` abre uma nova neste aparelho. Os outros aparelhos caem na próxima renovação, em até
15 minutos.

### Redefinição por e-mail

`resetPasswordWithToken` troca a senha e revoga todos os refresh tokens (`PASSWORD_RESET`) na mesma
transação. Não abre sessão nem mexe em cookie. Se o navegador tinha uma sessão do mesmo usuário, o
`/login?senha=redefinida` aparece normalmente: numa navegação de topo, o proxy confere
`isSessionAlive` (o usuário existe e está ativo e o refresh vive), vê que não e apaga os cookies, em
vez de mandar para `/` (o que geraria um ciclo). Quando o redirect vem da própria Server Action, o
Next renderiza o destino internamente e o `Set-Cookie` do proxy não chega ao navegador; a sessão então
acaba na primeira navegação de topo ou quando o access vence, em até 15 minutos.

---

## 5. O que mata o quê

| Evento | Cookie de sessão (access) | Refresh token | Alcance |
| :-- | :-- | :-- | :-- |
| Login / registro / Google | Emitido, 15 min | Família nova | Este aparelho |
| Requisição com access ausente ou a < 60 s do fim | Reemitido pelo proxy | Rotacionado na mesma família (`ROTATED`) | Este aparelho |
| Logout | Apagado (uma cópia vale até expirar) | Família revogada (`LOGOUT`) | Este aparelho |
| Reuso detectado | — | Família revogada (`REUSE_DETECTED`) | Todos os aparelhos daquele login |
| Troca de senha logado | Reemitido | Todas revogadas (`PASSWORD_CHANGED`), família nova | Os outros caem em até 15 min |
| Redefinição por e-mail | — | Todas revogadas (`PASSWORD_RESET`), nenhuma emitida | Todos, em até 15 min |
| Google remove senha não verificada | — | Todas revogadas (`GOOGLE_LINKED`); o login do Google abre família nova | Os outros em até 15 min |
| Conta desativada | Recusado no `getCurrentUser` | Recusado na renovação | Imediato |
| Troca de `AUTH_SECRET` sem `AUTH_SECRET_1` | Inválido; o proxy renova pelo refresh | Não depende do segredo | Transparente |
| 7 dias sem uso | Expirado | Expirado | — |

---

## 6. Limites conhecidos

- **O access não é revogável nos 15 minutos** (D9). Logout, troca de senha e redefinição revogam o
  refresh na hora, mas uma cópia do cookie de sessão continua valendo até vencer.
- **`AUTH_SECRET` é chave-mestra:** quem o tiver assina sessão de qualquer usuário, inclusive o
  superadmin, até o segredo ser trocado. No modelo antigo o segredo sozinho não bastava (era preciso
  um `sid` que só existia como hash no banco).
- **Rede instável:** se a resposta que levava o sucessor se perder (rede do celular caindo) e o
  navegador reapresentar o token antigo depois de 10 s, isso é lido como reuso e a família cai. É o
  mesmo compromisso da referência; o protocolo antigo, com confirmação do sucessor, cobria esse caso.
- **Tokens criados na janela de graça** ficam vivos até expirar ou até o logout (o logout revoga a
  família inteira).
- **Rate limit em memória por instância** (`loginLimiter`, `refreshLimiter`...): com mais de uma
  instância, cada uma teria o próprio balde.
- **O proxy consulta o banco só na renovação** e em GET de rota só-de-deslogado. `getCurrentUser`
  consulta o usuário a cada requisição (é o que faz desativação e troca de papel valerem na hora).
- **Regra para Server Actions novas:** uma action que grave qualquer cookie em rota protegida precisa
  deixar os dois cookies de sessão coerentes (revogar o que leu de `cookies()` e gravar ou apagar os
  dois), porque a resposta leva o `Set-Cookie` do proxy e o dela, e vale o último.
- **`cookies().set` só funciona em Server Action e Route Handler.** Nunca rotacione refresh fora do
  proxy, das actions de autenticação e de `/api/auth/*`: rotacionar onde o cookie não consegue ser
  entregue queima o token.

---

## 7. Referência × Voa Craque

A arquitetura foi adaptada de `gbrlmzl/sistema-controle-despesas-api` (Express + Passport +
`jsonwebtoken`) e do front `gbrlmzl/sistema-controle-despesas-front` (Next 16). Na referência, o
`src/proxy.ts` decodifica o `exp` do JWT e, **só se ele já expirou**, chama `POST /auth/refresh` e
propaga os cookies novos; não há renovação a cada requisição.

| Peça na referência | No Voa Craque |
| :-- | :-- |
| `signToken`/`verifyToken` (HS256, `iss`/`aud`, 15 min) | `src/lib/auth/tokens.ts` (`signAccessToken`/`verifyAccessToken`), com `jose` |
| Model `RefreshToken` (`tokenHash` único, `familyId`, `expiresAt`, `revokedAt`) | Mesmo model, **mais** `revokedReason` (D4) |
| `createRefreshTokenRecord` / `issueRefreshToken` (40 bytes hex, SHA-256) | `issueRefreshToken` em `refresh-tokens.ts` |
| `rotateRefreshToken` (graça de 10 s com sucessor vivo, reuso derruba a família, não reescreve `revokedAt`) | `rotateRefreshToken` com a mesma lógica; classificação pura em `refresh-token-state.ts` |
| `revokeRefreshToken` (logout: só o token) | `revokeRefreshFamily(raw, "LOGOUT")` (D10) |
| `revokeAllUserTokens` (troca/redefinição de senha) | `revokeAllUserRefreshTokens(userId, reason)` |
| `purgeExpiredRefreshTokens` (retenção de 30 dias) + `runTokenPurge` | `purgeExpiredRefreshTokens` + `scripts/purge-tokens.ts` |
| `establishSession` / `clearSessionCookies` | `src/lib/auth/establish-session.ts` (`establishSession`, `endSession`, `clearSessionCookies`) |
| Cookies `JWT`/`REFRESH`: `httpOnly`, `lax`, `secure` em prod, `path: "/"` | `voacraque.session`/`voacraque.refresh` com os mesmos atributos + `__Host-` (D11) |
| `requireAuth` (verifica, `getUserById`, popula `req.user`) | `getCurrentUser()` + guardas `requireUser/requireAdmin/requireSuperadmin/page*` |
| `POST /auth/refresh` com `refreshLimiter` (30 / 15 min) | `POST /api/auth/refresh` com `refreshLimiter` igual |
| Proxy do front renova quando o JWT expirou, sem validar assinatura (o segredo é da API) | Proxy renova quando o access expirou ou está a < 60 s, **validando** a assinatura (o segredo mora no mesmo processo) |
| `apiClient.client.ts`: retry após 401 | Não necessário: o proxy cobre `/api/*` (D7) |
| Troca de senha: revoga tudo e reabre a sessão do aparelho atual | Igual |
| Redefinição por e-mail: revoga tudo, não abre sessão, não mexe em cookie | Igual |
| Eventos `refresh_token_reuse`, `refresh_token_grace_reuse` | Os mesmos, mais `refresh_token_revoked_use` (D4) |
| Google via `passport-google-oidc`, `session: false`, `cookie-session` só para o state | `arctic` (PKCE + state), state num cookie JWT assinado de 10 min |
| Aceita `Authorization: Bearer` | Não adotado (não há cliente fora do navegador) |

---

## 8. Onde os testes cobrem cada parte

| Parte | Teste |
| :-- | :-- |
| Constantes (900 s, 604800 s, 10 s, 60 s) | `tests/auth-tokens.test.ts` |
| Access JWT: ida e volta, expiração, adulteração, `alg: none`, segredo trocado, rotação de segredo, `AUTH_SECRET` curto | `tests/auth-tokens.test.ts` |
| State do OAuth (validade de 10 min, não valida como access) | `tests/auth-tokens.test.ts` |
| `needsRefresh` (margem de 60 s) | `tests/auth-tokens.test.ts` |
| Cookies: nomes, `maxAge`, atributos, `Secure` e `__Host-` em https, cookies expirados | `tests/auth-tokens.test.ts` |
| Refresh opaco (geração, hash), prazos, purga | `tests/refresh-token-state.test.ts` |
| Classificação `active`/`grace`/`reused`/`revoked`/`expired`/`unknown` | `tests/refresh-token-state.test.ts` |
| Redirect URI do Google e leitura do `id_token` | `tests/google-oauth.test.ts` |
| Classificação de rotas do proxy (inclui `/api/auth/refresh`) | `tests/auth-support.test.ts` |

O que depende de banco e do Next (rotação, proxy, actions, callback) não tem teste automático: foi
validado no navegador e por `curl` (login, registro, navegação sem renovação, logout, Google até a
tela do Google e erros do callback, troca de senha, redefinição por e-mail, expiração acelerada,
graça, reuso e revogação).

---

## 9. Operação

- **Variáveis:** `AUTH_SECRET` (mínimo de 32 caracteres; assina o access e o state do Google),
  `AUTH_URL` (define `Secure` e o prefixo `__Host-`, o redirect URI do Google e o link de
  redefinição), `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET`. Para trocar o segredo sem derrubar sessões,
  mova o antigo para `AUTH_SECRET_1` (até `AUTH_SECRET_3`) e ponha o novo em `AUTH_SECRET`.
- **Purga:** `npm run db:purge-tokens` remove refresh tokens expirados ou revogados há mais de 30 dias e
  links de redefinição expirados há mais de um dia. Roda no boot do container; vale agendar
  diariamente.
- **Eventos de segurança** (uma linha JSON no stderr, `"type":"security"`): `refresh_token_reuse`
  (alarme), `refresh_token_grace_reuse` (concorrência; volume anormal denuncia bug de renovação),
  `refresh_token_revoked_use` (não é alarme) e `google_login_denied` (`reason`: `email_not_verified`,
  `inactive`, `state_mismatch`, `invalid_id_token`).
- **Pós-deploy:** em produção, o `Set-Cookie` do login deve trazer `__Host-voacraque.session` e
  `__Host-voacraque.refresh` com `Secure; HttpOnly; SameSite=Lax; Path=/`. Na primeira publicação
  desta versão, todo mundo entra de novo uma vez (os cookies do Auth.js ficam órfãos e expiram sozinhos).
