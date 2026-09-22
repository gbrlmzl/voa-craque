# Arquitetura do módulo de autenticação, autorização e estado do usuário

Modelo para estruturar, em projetos **Next.js (App Router) + React**, as três peças que
sempre andam juntas:

- **Autenticação**: quem é você (login por senha e por Google, sessão, logout).
- **Autorização**: o que você pode fazer (papéis, pertencimento, propriedade, estado).
- **Estado do usuário no cliente**: como a interface sabe quem está logado sem travar a
  navegação (`UserProvider`).

Dois cenários, com a mesma espinha dorsal:

| | Cenário A — API embutida no Next.js | Cenário B — API externa |
| :-- | :-- | :-- |
| Quem guarda os dados | O próprio Next (Route Handlers, Server Actions, Prisma) | Um serviço separado (Express, Nest, Spring...) |
| Implementação de referência | **Voa Craque** (este repositório) | **CRONOS** (`docs/arquitetura-autenticacao-e-autorizacao.md`) |
| Biblioteca de auth | Auth.js v5 (`next-auth@5`) no Next | Passport/openid-client na API; o Next só repassa |
| Quem emite a sessão | O Next | A API |

> **Base de versões:** Next.js 16 (o antigo `middleware` agora se chama `proxy`), React 19,
> Auth.js v5 (`next-auth@5.0.0-beta.32`, a versão mais nova do Auth.js — a tag `latest` do
> npm ainda aponta para a v4 legada), Prisma 7. Onde o comportamento depende da versão,
> o texto diz qual e aponta a fonte.

---

## Índice

1. [Escolhendo o cenário](#1-escolhendo-o-cenário)
2. [Os princípios que valem para os dois](#2-os-princípios-que-valem-para-os-dois)
3. [Modelo de dados](#3-modelo-de-dados)
4. [O protocolo de sessão rotativa](#4-o-protocolo-de-sessão-rotativa)
5. [Estado do usuário no cliente: o UserProvider](#5-estado-do-usuário-no-cliente-o-userprovider)
6. [Autorização em cinco camadas](#6-autorização-em-cinco-camadas)
7. [Cenário A — API embutida no Next.js](#7-cenário-a--api-embutida-no-nextjs)
8. [Cenário B — API externa](#8-cenário-b--api-externa)
9. [A e B lado a lado](#9-a-e-b-lado-a-lado)
10. [Defesas transversais](#10-defesas-transversais)
11. [Armadilhas do Next.js que custaram tempo](#11-armadilhas-do-nextjs-que-custaram-tempo)
12. [O que os testes precisam travar](#12-o-que-os-testes-precisam-travar)
13. [Checklists de implementação](#13-checklists-de-implementação)
14. [Referências](#14-referências)

---

## 1. Escolhendo o cenário

**Cenário A** quando o Next.js *é* o backend: um deploy só, o banco é acessado direto de
Server Components, Route Handlers e Server Actions, e não existe (nem vai existir tão cedo)
outro cliente além do navegador.

**Cenário B** quando a API já existe ou precisa existir por conta própria: outro time, outra
linguagem, app mobile consumindo a mesma API, escala independente. O Next vira uma camada
de apresentação que conversa com a API em nome do navegador.

A decisão muda **onde** cada peça mora, não **o que** cada peça faz. As seções 2 a 6 valem
para os dois; 7 e 8 são específicas.

---

## 2. Os princípios que valem para os dois

| # | Princípio | Consequência prática |
| :-- | :-- | :-- |
| 1 | **O front nunca é autoridade.** | O proxy decide *roteamento* e o `UserProvider` decide *o que desenhar*. Os dois são heurística de experiência. Quem responde "essa sessão vale?" e "essa pessoa pode?" é o servidor que guarda os dados, em toda chamada. |
| 2 | **A sessão é revogável no servidor.** | Existe uma linha no banco por sessão. Logout, troca de senha, desativação e roubo detectado matam a sessão sem esperar um token expirar. |
| 3 | **O navegador guarda um valor opaco, em cookie `httpOnly`.** | JavaScript da página nunca toca no token. No banco fica só o hash (SHA-256: o valor já é aleatório de alta entropia, não precisa de bcrypt). Um dump do banco não devolve sessão a ninguém. |
| 4 | **Cookie `Secure` em https, `SameSite=Lax`.** | `Lax` e não `Strict`: o retorno do Google chega por navegação de topo vinda de outro site, e com `Strict` o navegador descarta o `Set-Cookie` em silêncio. `Lax` ainda barra CSRF de verdade (POST, `fetch` e XHR cross-site não levam o cookie). |
| 5 | **Um lugar só renova a sessão: o proxy.** | Server Component não consegue gravar cookie. Renovar durante o render emite um token que nunca chega ao navegador; com rotação, isso vira falso alarme de roubo e logout em massa. |
| 6 | **Rotação com detecção de reuso.** | Cada renovação troca o token. Um token já aposentado que volta é uma cópia que alguém guardou: a família inteira cai e um alerta é emitido. |
| 7 | **O layout não espera a sessão.** | O layout raiz entrega uma *promise* ao `UserProvider`. Um layout que dá `await` em dado de runtime bloqueia toda navegação e impede o `loading.tsx` de aparecer. |
| 8 | **Autenticação na borda, autorização perto da regra.** | Toda entrada (página, Route Handler, Server Action, rota da API) confirma a sessão. A pergunta "pode fazer isto com este recurso?" mora no service, junto da consulta que a regra já faz. |
| 9 | **Anti-enumeração por padrão.** | Mesma mensagem para "e-mail não existe" e "senha errada"; 404 (e não 403) quando revelar a existência de um recurso já é vazamento. A diferença vai para o log, não para a resposta. |
| 10 | **Evento de segurança é dado estruturado.** | JSON de uma linha, chaves estáveis, nunca segredo. É o que permite pendurar filtro de métrica e alarme. |

---

## 3. Modelo de dados

```
User ──┬── UserAuthProvider   (provider + providerAccountId: 'google', ...)
       ├── SessionToken       (tokenHash único, familyId, expiresAt, usedAt, revokedAt)
       └── Membership         (só em sistema multi-inquilino: userId + recursoId + papel)
```

| Campo | Por quê |
| :-- | :-- |
| `User.passwordHash` **anulável** | Conta criada pelo Google não tem senha local. É também o que decide a mensagem de recuperação de senha, quando ela existir. |
| `User.emailVerifiedAt` | O cadastro por senha normalmente não prova posse do e-mail. É esse campo que decide o que fazer no vínculo com Google (ver [7.6](#76-login-com-google)). |
| `User.image` | Foto do provedor; a foto que o usuário escolher no app tem prioridade. |
| `UserAuthProvider` | Uma linha por provedor externo. Login por senha não precisa de linha: existe quando `passwordHash` não é nulo. Únicos: `(provider, providerAccountId)` e `(userId, provider)`. |
| `SessionToken.familyId` | Uma família por login em um dispositivo. Rotação cria o sucessor na mesma família; reuso derruba a família inteira; logout derruba a família daquele dispositivo. |
| `SessionToken.usedAt` | Distingue o token **atual** (o navegador já usou) do **pendente** (emitido, ainda não confirmado). Ver [seção 4](#4-o-protocolo-de-sessão-rotativa). |
| `SessionToken.revokedAt` | Linhas revogadas **não são apagadas** na hora: são elas que permitem reconhecer o reuso. |

No Cenário B o `SessionToken` se chama `RefreshToken` e mora no banco da API; o papel é o
mesmo.

**Purga:** uma linha só precisa existir enquanto algum cookie ainda puder apresentá-la.
Se o cookie expira junto com a linha (mesmo `maxAge`), dá para apagar logo depois do
`expiresAt` — um dia de folga cobre a tolerância de relógio. Rode no boot e num cron diário
(`npm run db:purge-sessions` no Voa Craque). Com rotação a cada 15 min, um usuário ativo
gera dezenas de linhas por dia e nada some sozinho.

---

## 4. O protocolo de sessão rotativa

É a peça mais sutil do módulo, e a que mais tem jeito de dar errado em uso normal (não em
ataque). Vale ler inteira antes de implementar.

### 4.1 O que a rotação compra

Um token de sessão de longa duração, se copiado, dá acesso até expirar. Com rotação, cada
renovação troca o valor; se o dono e o ladrão continuarem usando, um dos dois vai apresentar
um token já aposentado, e isso é detectável. Sem rotação, o roubo é invisível.

### 4.2 Os três problemas de uso normal

1. **Concorrência.** Um cliente normal dispara requisições em paralelo (abas, `fetch`s,
   navegação) e todas carregam o **mesmo** token, porque nenhuma viu ainda o `Set-Cookie` das
   outras. Sem tratamento, a segunda requisição apresenta um token recém-aposentado e é lida
   como roubo.
2. **Resposta perdida.** O servidor rotacionou, mas a resposta com o token novo nunca chegou
   (aba fechada, navegação abortada, rede do celular caindo). O navegador segue com o token
   antigo. Se a rotação já revogou o antigo, a próxima requisição é lida como roubo.
3. **Requisição lenta.** Um upload grande sai com o token *T0*, e enquanto ele sobe o token
   é rotacionado por outra requisição. Quando o upload chega, *T0* já foi aposentado.

### 4.3 O protocolo

O CRONOS resolve o problema 1 com uma janela de graça. O Voa Craque resolve 1, 2 e 3 com
uma regra a mais: **o token atual só é aposentado quando o navegador prova que recebeu o
sucessor.**

```
login ─────► [T0 atual]
                 │  proxy, GET, token com ≥ 15 min
                 ▼
             [T0 atual] + [T1 pendente]          resposta: Set-Cookie { sid: T1, pend: true }
                 │  navegador devolve o cookie com `pend` (prova de recebimento)
                 ▼
             [T0 revogado] + [T1 atual]          resposta: Set-Cookie { sid: T1 }   (sem pend)

resposta perdida:  o navegador segue com T0, que continua valendo.
                   Depois de 60 s, a próxima rotação revoga o T1 perdido e emite T2.
```

Regras, na ordem em que o código as aplica:

| Token apresentado | O que o proxy faz | O que a autoridade (quem lê a sessão) faz |
| :-- | :-- | :-- |
| Atual, emitido há < 15 min | Nada (não toca no banco) | Aceita |
| Atual, emitido há ≥ 15 min | Emite um pendente. Se já existe um pendente com < 60 s, não emite outro (ele está a caminho pela resposta de outra requisição) | Aceita |
| Pendente (cookie com `pend`) | Confirma: marca `usedAt`, revoga o resto da família, reemite o cookie sem `pend` | Aceita |
| Revogado há ≤ 60 s **e** a família tem token vivo | Graça: deixa passar, sem emitir nada | Aceita |
| Revogado fora disso | **Reuso**: revoga a família inteira, emite `session_token_reuse`, limpa o cookie | Recusa |
| Expirado ou inexistente | Limpa o cookie | Recusa |

Quatro detalhes que parecem acessórios e não são:

- **A graça exige um token vivo na família.** Tempo sozinho não serve: logout e a própria
  detecção de reuso também gravam `revokedAt = agora`, e uma janela puramente temporal
  ressuscitaria exatamente as sessões que esses fluxos existem para matar. Rotação legítima
  deixa um token vivo; revogação em massa não deixa nenhum.
- **A rotação trava a linha do token apresentado** (`SELECT ... FOR UPDATE` dentro da
  transação). Seis requisições simultâneas com o mesmo token emitem **um** pendente; as
  outras cinco saem pela graça. Sem a trava, cada uma emitiria o seu, e o cookie do navegador
  ficaria alternando entre sucessores.
- **A prova de recebimento tem que vir do cookie de entrada.** No Next 16, o cookie que o
  proxy grava na resposta é repassado automaticamente ao `cookies()` do render da mesma
  requisição (ver [11.5](#11-armadilhas-do-nextjs-que-custaram-tempo)). Se a confirmação
  acontecesse no render, o servidor "usaria" o sucessor em nome do navegador antes de saber
  se ele chegou — e o problema 2 voltaria. Por isso o cookie do pendente carrega `pend`, e só
  o proxy, que vê o cookie que o navegador mandou, confirma.
- **Só `GET` rotaciona ou confirma.** Um upload lento chega ao proxy muito depois de sair do
  navegador; Server Actions de login e logout reescrevem o próprio cookie, e dois
  `Set-Cookie` com o mesmo nome na mesma resposta não têm ordem garantida. O pendente é aceito
  normalmente enquanto isso.

A janela de 60 s tem dois usos com a mesma ideia de "requisição em trânsito": quanto tempo um
token recém-aposentado ainda é aceito, e quanto tempo um pendente recém-emitido é considerado
"a caminho" antes de ser dado como perdido. O CRONOS usa 10 s porque lá o token rotativo só
aparece na renovação; no Cenário A o mesmo token autentica cada requisição.

### 4.4 O que ainda escapa

Um ladrão com uma cópia do token atual usa a sessão até a próxima rotação (≤ 15 min de uso do
dono), exatamente como um access token roubado no Cenário B. A detecção acontece quando os
dois disputam a família. A rotação não substitui `httpOnly`, `Secure` e a ausência de XSS;
ela transforma um roubo silencioso num roubo com prazo e alarme.

---

## 5. Estado do usuário no cliente: o UserProvider

### 5.1 A ideia em uma frase

**O contexto guarda a promise da sessão, não a sessão.**

```tsx
// app/layout.tsx — sem async e sem await
export default function RootLayout({ children }: { children: ReactNode }) {
  const session = getSessionPromise(); // dispara, não espera
  return (
    <html lang="pt-BR">
      <body>
        <UserProvider session={session}>{children}</UserProvider>
      </body>
    </html>
  );
}
```

O layout termina de renderizar no mesmo tick. A casca (navegação, tab bar, a página e o
`loading.tsx` dela) vai para o navegador na hora; quem lê o usuário suspende no próprio
`<Suspense>`.

### 5.2 Por que não `await` no layout

Duas regras do App Router se combinam (confirmadas na documentação do Next 16):

1. Sem Cache Components, rota dinâmica **não é pré-carregada** a menos que tenha um
   `loading.js` (`02-guides/prefetching.md`).
2. Se o layout acessa dado de runtime (`cookies()`, `headers()`, `fetch` sem cache), o
   `loading.js` **não aparece**: a navegação bloqueia até o layout terminar
   (`03-file-conventions/loading.md`).

O CRONOS mediu 354 ms de tela congelada, zero mutações no DOM, por causa de um `await
getCurrentUser()` no layout raiz. O `await` num layout de grupo (`(app)/layout.tsx`) tem o
mesmo efeito para todas as páginas do grupo.

### 5.3 `getSessionPromise` no servidor

```ts
export function getSessionPromise(): Promise<CurrentUser | null> {
  return getCurrentUser().catch((error: unknown) => {
    unstable_rethrow(error);             // redirect / render dinâmico não são falha
    console.error("falha ao carregar a sessão", error);
    return null;                         // a casca nunca quebra por causa da sessão
  });
}
```

O valor resolvido precisa ser serializável e não carregar nada sensível: ele vai para o
cliente. Tipo sugerido:

```ts
type CurrentUser = {
  id: string; email: string; name: string; role: Role;
  photoUrl: string | null;
  hasPassword: boolean;      // para "Alterar senha" / "Formas de entrar"
  googleLinked: boolean;
  // ...o que a interface precisa para desenhar, e nada além disso
};
```

### 5.4 O Provider

```tsx
"use client";
export function UserProvider({ session, children }) {
  const [local, setLocal] = useState<{ origin: Promise<…>; patch: UserPatch } | null>(null);

  // Promise nova = o servidor rerenderizou o layout (login, logout, router.refresh).
  // O valor dele já contém o que foi editado aqui: o patch local caduca sozinho.
  const patch = local && local.origin === session ? local.patch : null;

  const update = useCallback((next: UserPatch) =>
    setLocal((prev) => ({
      origin: session,
      patch: { ...(prev && prev.origin === session ? prev.patch : {}), ...next },
    })), [session]);

  return <UserContext.Provider value={{ session, patch, update }}>{children}</UserContext.Provider>;
}

export function useCurrentUser(): CurrentUser | null {
  const { session, patch } = useContext(UserContext);
  const server = use(session);                     // suspende até resolver
  return server && patch ? { ...server, ...patch } : server;
}
```

- **A mescla acontece na leitura, não na escrita.** No momento da escrita o Provider não tem
  o usuário resolvido, só a promise.
- **`use()` não é Hook**: pode ficar dentro de `if`. O CRONOS aproveita isso para não tocar
  na promise quando já sabe a resposta (ver 5.6).

### 5.5 Onde ficam as fronteiras de Suspense

Colocar `useCurrentUser()` num componente grande anula tudo: o boundary mais próximo sobe e a
casca volta a esperar. Reduza cada leitor ao menor componente possível:

| Onde | O que suspende | Fallback |
| :-- | :-- | :-- |
| Cabeçalho | Só o avatar | Bloco com a medida exata do avatar |
| Navegação | Só os links que dependem de papel | Nada (os links comuns já estão lá) |
| Menu do usuário | Nome e papel | Duas linhas com as medidas do texto |
| Landing | Botões "Entrar"/"Minha conta" | Os botões do estado deslogado |

Regras dos skeletons (`loading.tsx` e fallbacks), valendo para todos:

- **Mesma medida do conteúdo real.** Skeleton de outro tamanho troca tela parada por salto de
  layout.
- **Menos linhas, não mais.** Skeleton mais alto que a lista real faz a página encolher.
- **Server Components.** Sem `"use client"` num bloco cinza.
- Um `role="status"` anunciando "Carregando…" uma vez; blocos `aria-hidden`; animação
  desligada com `prefers-reduced-motion`.
- **Um `loading.tsx` por rota com dado de servidor.** Um só no topo não basta: navegar entre
  rotas aninhadas suspende abaixo dele, numa fronteira que já estava revelada, e o React mantém
  a tela antiga em vez de mostrar o fallback.

### 5.6 Escritas no contexto: depende de onde o login acontece

| Situação | Cenário A (Voa Craque) | Cenário B (CRONOS) |
| :-- | :-- | :-- |
| Login / logout | **Server Action** que mexe no cookie. O Next rerenderiza página e layouts na mesma resposta (`01-getting-started/07-mutating-data.md`), o layout raiz cria uma promise nova e o Provider descarta o patch. Nenhuma escrita local é necessária. | **`fetch` no cliente** (o cookie vem da API). O hook chama `setUser(valor, { autoritativo: true })` e navega, sem `router.refresh()`. |
| Edição de perfil | `update({ photoUrl })`: mescla sobre o servidor, sem ida e volta. | Idem, não autoritativa. |

No Cenário B o patch precisa de uma marca de **autoritativo**: login e logout trocam de
identidade, e mesclar deixaria campos órfãos (a foto de quem saiu grudada em quem entrou).
Autoritativo substitui e nem toca na promise:

```ts
interface AlteracaoLocal { autoritativo: boolean; valor: AuthUser | null }

export function useCurrentUser() {
  const { sessao, alteracao } = useContext(UserContext);
  if (alteracao?.autoritativo) return alteracao.valor;   // não suspende de novo
  const servidor = use(sessao);
  if (!alteracao) return servidor;
  return servidor ? { ...servidor, ...alteracao.valor } : alteracao.valor;
}
```

### 5.7 Testes de componentes que leem o contexto

`useCurrentUser()` suspende, então todo teste precisa de `<Suspense>` em volta **e** de
renderizar dentro de `act()` — com `IS_REACT_ACT_ENVIRONMENT` ligado (a Testing Library liga),
a retomada do Suspense só é descarregada dentro de um `act`:

```tsx
await act(async () => {
  utils = renderHook(() => useCurrentUser(), { wrapper });
});
```

Renderizar fora e esperar depois (com `waitFor`, `act` vazio ou `await` na promise) deixa o
componente suspenso para sempre. Casos que valem teste: fallback enquanto a sessão não
resolve; edições seguidas se acumulando; login depois de logout não herdando campos.

---

## 6. Autorização em cinco camadas

Não precisa de RBAC global, tabela de permissões nem motor de políticas para a maioria dos
sistemas. Cinco perguntas, cada uma no seu lugar:

| Camada | Pergunta | Onde | Falha com |
| :-- | :-- | :-- | :-- |
| 1. Autenticação | Existe sessão válida? | Primeira linha de toda entrada | **401** (API) / redirect para `/login` (página) |
| 2. Pertencimento | Você faz parte **deste** recurso? | Carregador de contexto no service | **404** (anti-enumeração) |
| 3. Papel | Você é dono/admin? | Guarda de papel ou service | **403** |
| 4. Propriedade | O recurso é seu? | Filtro na própria query, ou comparação de id | **404** ou **403** |
| 5. Estado | O recurso aceita esta operação agora? | Service | **409** |

**404 ou 403?** Esconda a existência quando ela tem valor: se o identificador é curto e
público (um código de convite), "não existe" e "existe mas você não faz parte" precisam ser a
mesma resposta. Quando o recurso já é legitimamente visível ao usuário (ele vê a linha na
tela), um 404 é mentira sem ganho: use 403.

**Guarda ou carregador de contexto?**

- **Papel global** (Voa Craque: `SUPERADMIN`, `ADMIN`, `USER` valem no sistema inteiro): uma
  guarda por nível basta, porque a pergunta não depende do recurso.
  ```ts
  requireUser() / requireAdmin() / requireSuperadmin()      // Route Handlers: lançam 401/403
  pageUser() / pageAdmin() / pageSuperadmin()               // páginas: redirecionam
  ```
- **Papel por recurso** (CRONOS: `OWNER`/`MEMBER` por residência): **não** escreva
  `requireMember`/`requireOwner` como middleware. A rota recebe um identificador público, e
  resolver recurso + vínculo + papel é a mesma consulta que a regra de negócio faz em seguida.
  Um carregador chamado como primeira linha de cada operação faz tudo numa consulta:
  ```ts
  const ctx = await loadUserResidenceContext(code, userId); // 404 se não existe OU não é membro
  if (!ctx.isOwner) throw new AppError(403, "...");
  if (ctx.isArchived) throw new AppError(409, "...");
  ```

**Server Actions e Route Handlers são endpoints públicos.** Cada um confere a sessão por
conta própria; nenhum confia no proxy nem na página que o chama. A documentação do Next 16
repete isso ao explicar que um `matcher` que exclui um caminho também deixa de cobrir as
Server Actions daquele caminho.

---

## 7. Cenário A — API embutida no Next.js

### 7.1 O mapa

```
┌────────────┐  https://dominio   ┌──────────────────────────────────────────────────┐   ┌──────────────────┐
│ Navegador  │ ─────────────────► │  Next.js — um processo Node                      │   │  PostgreSQL      │
│            │   páginas,         │                                                  │   │                  │
│ cookie     │   /api/*,          │  ① src/proxy.ts       rotação + roteamento       │──►│  User            │
│ httpOnly:  │   Server Actions   │  ② Server Components  getCurrentUser()           │   │  SessionToken    │
│ authjs.    │                    │  ③ Route Handlers     requireUser()/requireAdmin │   │  UserAuthProvider│
│ session-   │                    │  ④ Server Actions     login, cadastro, logout    │   │  ...             │
│ token      │                    │  ⑤ /api/auth/*        Auth.js (callback Google)  │   └──────────────────┘
└────────────┘                    └──────────────────────────────────────────────────┘
```

Não existe CORS nem repasse de cookie entre processos: o segredo do cookie, a sessão e o banco
moram no mesmo lugar. Isso muda duas coisas em relação ao Cenário B:

- **O proxy valida o cookie de verdade.** O segredo está no mesmo processo; um cookie forjado
  não decifra. (No B, o proxy só decodifica o JWT sem validar, porque o segredo é da API.)
- **Não há access token de curta duração.** Toda leitura autoritativa já consulta o banco (o
  usuário precisa vir fresco de qualquer jeito), então a mesma consulta traz a linha da
  sessão. Logout vale na hora, sem a janela de até 15 min do B.

### 7.2 Peças e responsabilidades (Voa Craque)

| Arquivo | Responsabilidade |
| :-- | :-- |
| `src/auth.ts` | Instância do Auth.js: provedores Credentials e Google, callbacks `signIn`/`jwt`/`session`, `events.signOut`, logger |
| `src/lib/auth/config.ts` | Constantes da sessão (TTL, rotação, graça) e do cookie (nome, `httpOnly`, `lax`, `secure`), sem Prisma: lida pelo proxy, pelo Auth.js e pelos testes |
| `src/lib/auth/session-cookie.ts` | Cifra e decifra o cookie (o mesmo JWE do Auth.js), claims `sub`, `sid`, `rot`, `pend` |
| `src/lib/auth/token-state.ts` | Classificação pura do token: `active`, `grace`, `reused`, `expired`, `unknown` |
| `src/lib/auth/session-store.ts` | Ciclo de vida no banco: abrir família, rotacionar, confirmar, revogar, purgar |
| `src/lib/auth/credentials.ts` | Verificação de senha com custo constante de bcrypt |
| `src/lib/auth/google.ts` | Achar ou criar o usuário do Google, vínculo seguro por e-mail |
| `src/lib/auth/routes.ts` | Classificação de rotas do proxy e destino seguro pós-login |
| `src/proxy.ts` | Roteamento heurístico + único ponto de rotação e confirmação |
| `src/lib/session.ts` | `getCurrentUser()` (autoridade), `getSessionPromise()`, guardas de API e de página |
| `src/actions/auth.ts` | Server Actions de login, cadastro, Google e logout |
| `src/components/UserProvider.tsx` | Contexto com a promise, `useCurrentUser`, `useUpdateCurrentUser` |
| `src/lib/rate-limit.ts`, `client-ip.ts`, `security-log.ts` | Defesas transversais |
| `scripts/purge-sessions.ts` | Purga agendada |

### 7.3 O papel do Auth.js

O Auth.js v5 faz o que ele faz bem, e só isso:

- handshake OAuth/OIDC com o Google (`state`, PKCE, `nonce`, troca de código, validação do
  `id_token`);
- chamar o `authorize` das credenciais e os callbacks;
- cifrar o cookie (JWE `A256CBC-HS512`, chave derivada do `AUTH_SECRET` com o nome do cookie
  como *salt*);
- as rotas `/api/auth/*` e as funções `signIn`/`signOut` para Server Actions.

**A sessão não é do Auth.js.** A estratégia `jwt` é usada só como envelope: o cookie carrega
um token opaco (`sid`) que aponta para uma linha revogável em `SessionToken`. O JWT padrão do
Auth.js não é revogável; o `database` strategy não funciona com Credentials. Esse híbrido fica
com o melhor dos dois.

Pontos de configuração que importam:

```ts
NextAuth({
  trustHost: true,
  useSecureCookies: SECURE_COOKIES,                        // https => Secure
  session: { strategy: "jwt", maxAge: SESSION_IDLE_TTL_S },
  // Nome e opções FIXOS: o proxy cifra e decifra o mesmo cookie sem passar pelo Auth.js.
  cookies: { sessionToken: { name: SESSION_COOKIE_NAME, options: SESSION_COOKIE_OPTIONS } },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Credentials({ authorize }),                            // rate limit AQUI (ver 7.8)
    ...(googleHabilitado ? [Google({ checks: ["pkce", "state"],
        authorization: { params: { prompt: "select_account" } } })] : []),
  ],
  callbacks: {
    signIn,                                                // Google: achar/criar/vincular
    async jwt({ token, user, account, trigger }) {
      if (trigger !== "signIn" && trigger !== "signUp") return token; // NUNCA rotacionar aqui
      const userId = account?.provider === "google"
        ? await userIdForGoogleAccount(account.providerAccountId)       // busca, não confia no objeto
        : user?.id;
      if (!userId) return null;
      return { sub: userId, sid: await openSession(userId), rot: nowSeconds() };
    },
    session: ({ session, token }) => ({ expires: session.expires, user: { id: token.sub } }),
  },
  events: { signOut: async ({ token }) => token?.sid && revokeSessionFamily(token.sid) },
  logger: { error: (e) => { if (!(e instanceof CredentialsSignin)) console.error(e) } },
});
```

- O callback `jwt` roda também a cada leitura da sessão pelo Auth.js, inclusive onde o cookie
  não pode ser gravado. Por isso ele só abre família no login.
- O callback `session` alimenta `/api/auth/session`, que responde para o JavaScript da página:
  nada do token vai para lá. "Quem está logado" se pergunta a `getCurrentUser()`, não ao
  Auth.js.
- `AUTH_SECRET` aceita rotação: o Auth.js monta `[AUTH_SECRET_3, _2, _1, AUTH_SECRET]`, cifra
  com o primeiro e decifra com qualquer um. O codec próprio do cookie precisa montar a mesma
  lista, na mesma ordem.

### 7.4 O proxy

```
1. classifica a rota: auth-endpoint | guest-only | public | protected-api | protected-page
2. decifra o cookie (sem banco). Não decifra? → limpar cookie, tratar como deslogado
3. se GET, fora de /api/auth e não é speculative prefetch:
     cookie com `pend`     → confirmar sucessor → reemitir sem `pend`
     rot ≥ 15 min          → rotacionar → Set-Cookie com `pend`
     reuso                 → família cai, limpar cookie, tratar como deslogado
4. rota só-deslogado + cookie que decifra → confirmar no banco que a sessão ainda vive
     (sem isso: /login manda para "/", "/" vê sessão morta e manda para /login, em loop)
5. sem sessão: API → 401 JSON; página → /login?proximo=<caminho>
6. com sessão em /login ou /registrar (GET) → "/"
```

```ts
export const config = {
  matcher: [{
    source: "/((?!_next/|favicon.ico|icon.svg|manifest.webmanifest).*)",
    missing: [{ type: "header", key: "next-router-prefetch" }],
  }],
};
```

- `_next/` inteiro, e não só `_next/static`: o WebSocket do hot-reload (`/_next/hmr`) caía no
  proxy como página protegida, era redirecionado para `/login` e o hot-reload parava para quem
  estava deslogado.
- `missing` no matcher, porque o código do proxy **não vê** o header de prefetch (ver
  [11.4](#11-armadilhas-do-nextjs-que-custaram-tempo)).

O proxy toca no banco em três casos só: rotação (a cada 15 min de uso), confirmação (a
primeira requisição depois da rotação) e cookie em rota só-deslogado.

### 7.5 A autoridade: `getCurrentUser()`

```ts
export const getCurrentUser = cache(async () => {
  const claims = await readSessionCookie((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!claims) return null;
  const token = await prisma.sessionToken.findUnique({
    where: { tokenHash: sha256(claims.sid) },
    select: { familyId: true, revokedAt: true, expiresAt: true, user: { select: {...} } },
  });
  if (!token || token.user.id !== claims.sub || !token.user.active) return null;
  const state = await resolveTokenState(token);          // consulta extra só na janela de graça
  if (state !== "active" && state !== "grace") return null;
  return toCurrentUser(token.user);
});
```

- Uma consulta por requisição: o `cache()` do React deduplica entre layout, página e guardas.
- **Só lê.** Rotacionar, confirmar e gravar cookie é do proxy.
- `active` inclui o pendente: o render da requisição que rotacionou já o enxerga.
- Usuário desativado perde acesso na hora, mesmo com token vivo.

### 7.6 Login com Google

```
botão (Server Action) → signIn("google") → accounts.google.com
      → GET /api/auth/callback/google            (Auth.js valida state, PKCE, id_token)
      → callbacks.signIn → signInWithGoogle():
           e-mail ausente ou email_verified ≠ true → nega (AccessDenied)
           conta Google já vinculada               → entra (preenche foto vazia); desativada → nega
           existe usuário com o mesmo e-mail       → VINCULA (ver abaixo); desativado → nega
           ninguém                                 → cria usuário sem senha, e-mail verificado
      → callbacks.jwt → openSession → cookie → redirect para o destino
```

**O vínculo por e-mail é o ponto delicado.** Se o cadastro por senha não verifica e-mail,
qualquer pessoa pode criar uma conta com o e-mail de outra antes da dona chegar
(*pre-account hijacking*). Quando a dona entra pelo Google e a conta é vinculada, o atacante
continua sabendo a senha. A defesa, quando `emailVerifiedAt` é nulo e existe senha:

1. vincular o Google e marcar o e-mail como verificado;
2. **remover a senha não verificada**;
3. revogar todas as sessões abertas com ela;
4. registrar `google_account_linked` com `passwordDropped: true` e uma linha de auditoria.

Quem criou a conta de boa-fé continua entrando, agora pelo Google, e o perfil mostra as formas
de entrar. Se o projeto verificar e-mail no cadastro, o passo 2 deixa de ser necessário para
contas verificadas. O Auth.js, com adapter, simplesmente recusa vincular por e-mail
(`OAuthAccountNotLinked`) a menos que se ligue `allowDangerousEmailAccountLinking` — o que
este desenho faz é a versão segura dessa opção.

Sem adapter, o `user` que chega ao callback `signIn` é o mesmo objeto que chega ao `jwt`, mas
isso é detalhe de implementação do Auth.js: o `jwt` busca o usuário pelo vínculo
(`userIdForGoogleAccount`) em vez de depender de mutação no objeto.

Variáveis: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (lidas sozinhas pelo provedor). Sem as duas,
nem o provedor nem o botão existem. URI de redirecionamento no Google Cloud:
`<AUTH_URL>/api/auth/callback/google`.

### 7.7 Os fluxos, condensados

| Fluxo | Caminho |
| :-- | :-- |
| Login por senha | `LoginForm` → `loginAction` (Server Action) → `signIn("credentials")` → `authorize` (rate limit + `verifyCredentials`) → `jwt` → `openSession` → cookie via `cookies().set` → redirect → layouts rerenderizados, promise nova |
| Cadastro | `registerAction` → rate limit por IP → cria usuário → `signIn` → `/primeiro-acesso` |
| Logout | `logoutAction` → `signOut` → `events.signOut` revoga a família → cookie limpo → `/login` |
| Navegar logado | proxy (sem banco, ou rotação/confirmação) → página → `getCurrentUser` (1 consulta) → guarda → dados |
| Ação autorizada | `fetch` do cliente → proxy → Route Handler → `requireAdmin()` → service (camadas 2 a 5) |
| Sessão morta com cookie que decifra | página: `redirect("/login")` (transmitido; ver 11.7); API: 401; `/login`: proxy confirma no banco e limpa o cookie |

### 7.8 Rate limit no lugar certo

O endpoint `/api/auth/callback/credentials` do Auth.js pode ser chamado direto, sem passar pela
Server Action de login (basta pegar o token CSRF em `/api/auth/csrf`). Por isso o limitador
mora **dentro do `authorize`**, que roda nos dois caminhos. Para passar a informação adiante,
lance um `CredentialsSignin` com `code`:

```ts
class RateLimitedSignin extends CredentialsSignin { code = "rate_limited"; }
```

Numa Server Action (`raw`), o erro chega intacto no `catch` da action; numa chamada direta,
vira `/login?error=CredentialsSignin&code=rate_limited`. A página de login trata os dois.

### 7.9 Ciclo de vida da sessão (Cenário A)

| Evento | Cookie | Linhas em `SessionToken` | Alcance |
| :-- | :-- | :-- | :-- |
| Login (senha ou Google) | Emitido, 30 dias | Família nova, token atual | Este dispositivo |
| 15 min de uso | Sucessor com `pend` | Pendente criado; atual segue vivo | Este dispositivo |
| Primeira requisição com o sucessor | Reemitido sem `pend` | Pendente vira atual; o resto da família é revogado | Este dispositivo |
| Logout | Limpo | Família revogada | Este dispositivo, **na hora** |
| Reuso detectado | Limpo para quem apresentou | Família revogada | Os dois lados do roubo |
| Vínculo Google com senha não verificada | — | Todas as famílias do usuário revogadas | Todos os dispositivos |
| Usuário desativado | Continua no navegador | — | Todos, **na hora** (`getCurrentUser` confere `active`) |
| 30 dias sem uso | Expira | Linha expira; a purga apaga | — |
| Troca do `AUTH_SECRET` sem `AUTH_SECRET_1` | Não decifra mais | — | Todos |

### 7.10 Limites conhecidos (Cenário A)

1. **Rate limit em memória.** Com mais de uma instância, cada uma tem o próprio balde e o teto
   efetivo multiplica. No dia de escalar, troque o `Map` por um store compartilhado.
2. **Upload que dura mais que a graça.** Um `POST` que começou com o token anterior e termina
   mais de 60 s depois da confirmação do sucessor recebe 401. Não desloga nem gera alarme; o
   usuário tenta de novo.
3. **Página com sessão morta responde 200.** A casca começa a ser transmitida antes da guarda
   da página rodar; o `redirect("/login")` chega como instrução no stream. Nenhum dado da
   página vai junto (a guarda é a primeira linha), mas o código de status não serve de sinal.
4. **O proxy precisa do banco** nos três casos de 7.4. No Next 16 o proxy roda em Node, e o
   Prisma funciona nele (verificado em `next build` + `next start`).
5. **Mudar o formato do cookie derruba todo mundo uma vez.** Cookies sem os claims esperados
   valem como deslogado.

---

## 8. Cenário B — API externa

### 8.1 O mapa (CRONOS)

```
┌───────────┐   https://dominio         ┌──────────────────────────────┐        ┌─────────────────┐
│ Navegador │ ────────────────────────► │  FRONT — Next.js (Node)      │        │  API            │
│           │                           │                              │        │                 │
│ cookies:  │   páginas                 │  ① src/proxy.ts              │ ──────►│  requireAuth    │
│  JWT      │ ─────────────────────────►│  ② Server Components         │ fetch  │  services       │
│  REFRESH  │                           │     (lib/apiClient.ts)       │ server │  banco          │
│           │   /api/*  (XHR)           │  ③ app/api/[...path]/route.ts│ ─────► │                 │
│           │ ─────────────────────────►│     (proxy same-origin)      │        └─────────────────┘
└───────────┘                           └──────────────────────────────┘
```

**O navegador nunca fala com a API diretamente.** Duas consequências explicam metade do
código:

- Não existe CORS no caminho do usuário (o `cors()` da API só serve o acesso direto em
  desenvolvimento).
- Os cookies de sessão pertencem ao domínio do front. É por isso que o proxy consegue lê-los,
  e precisa: é ele quem decide o roteamento antes do render.

### 8.2 Peças e responsabilidades

**API**

| Peça | Responsabilidade |
| :-- | :-- |
| Ordem dos middlewares | `trust proxy` → headers de segurança → `/health` → rate limit global → `/ready` → CORS → body parser (limite de tamanho) → cookie parser → sessão OAuth (só o `state`) → passport → rotas |
| `requireAuth` | Extrai o token (cookie ou `Authorization: Bearer`), verifica assinatura + `exp` + **`iss` + `aud`**, carrega o usuário do banco, popula `req.user` |
| `establishSession(res, user)` | Emite o par de tokens e grava os dois cookies. Compartilhado por cadastro, login, callback do Google e troca de senha; mora em `lib/`, não num controller |
| `authService` | Cadastro, login, Google, assinatura/verificação de JWT, ciclo do refresh token |
| Rotas de auth | Limitador → validação → controller, nessa ordem |

**Front**

| Peça | Responsabilidade |
| :-- | :-- |
| `src/proxy.ts` | Guarda de rota e **único lugar que renova o par de tokens** |
| `app/api/[...path]/route.ts` | Repasse same-origin `/api/*` → API; trata `Set-Cookie` e redirects à mão |
| `lib/apiClient.ts` | `fetch` server-side com repasse de cookies. **Nunca** renova |
| `lib/apiClient.client.ts` | `fetch` client-side com uma tentativa de refresh no 401 |
| `lib/session.ts` | `getCurrentUser()` = `GET /users/me` |
| `UserProvider` + `useLogin`/`useLogout` | Contexto com promise; login e logout atualizam o contexto como alteração autoritativa |

### 8.3 Dois tokens

| | Access token | Refresh token |
| :-- | :-- | :-- |
| Formato | JWT HS256 com `iss` e `aud` | 40 bytes aleatórios, opaco |
| Vida | 15 min | 7 dias, rotativo, agrupado por `familyId` |
| No banco | Nada (stateless) | Só o SHA-256 |
| Revogável | Não (expira sozinho) | Sim |
| Quem verifica | A API, a cada chamada | A API, a cada renovação |

- **Exigir** `iss` e `aud` na verificação, não só assinar com eles: impede que um token de
  outro serviço com o mesmo segredo passe.
- **`path: '/'` no cookie de refresh**, e não `/auth`: o navegador só enxerga
  `/api/auth/refresh`, e o proxy precisa ler o cookie em requisições de página.
- A API é stateless: nenhuma sessão em servidor. A sessão de cookie da API (se usar passport)
  existe **só** para o `state` do handshake OAuth, por 10 minutos, e só é montada se o Google
  estiver configurado.

### 8.4 O proxy no Cenário B

```
1. lê o cookie JWT
2. jwtExpirado? decodifica só o payload (base64url), SEM validar assinatura — o segredo é da API.
   Considera expirado 5 s antes do exp. Erro de parse → expirado.
3. estaLogado = jwt && !expirado
4. !estaLogado && existe REFRESH:
     POST {API}/auth/refresh repassando o Cookie, timeout de 5 s
     sucesso → cookies renovados; estaLogado = true
5. rota protegida e sem sessão → /login + limpar cookies
     (uma sessão morta no navegador faz toda navegação gastar até 5 s tentando renovar e,
      pior, reapresentar um refresh já revogado — que a API lê como reuso)
6. rota só-deslogado e com sessão → "/"
7. renovou → propagar os cookies
```

**Propagar os dois lados.** O `Set-Cookie` na resposta atualiza o navegador para a *próxima*
requisição; o render desta passada lê o header `Cookie` do *request*. O CRONOS reescreve o
request à mão (`NextResponse.next({ request: { headers } })`). **No Next 16 isso já é
automático** para cookies gravados com `response.cookies.set()` no proxy (header interno
`x-middleware-set-cookie`, aplicado ao `cookies()` do render). Verifique na sua versão antes
de manter o código manual.

**Prefetch:** exclua pelo `matcher` com `missing: [{ type: 'header', key:
'next-router-prefetch' }]`. O código do proxy não enxerga esse header.

### 8.5 Os três caminhos de chamada

| Caminho | Quem chama | Renova? |
| :-- | :-- | :-- |
| `apiClient.ts` (server) | Server Components e Server Actions | **Nunca.** Um refresh durante o render não consegue gravar o cookie novo; com rotação, isso revoga o token no banco sem entregar o sucessor, e a próxima renovação é lida como roubo — a família cai e o usuário é deslogado de todos os dispositivos. Aconteceu no CRONOS. |
| `apiClient.client.ts` (browser) | `fetch` depois do render | Uma vez, no 401: promise de refresh **compartilhada** entre chamadas simultâneas e cooldown de 30 s após falha. Não tenta em `/auth/*` nem com `skipAuthRetry`. |
| `app/api/[...path]/route.ts` | O navegador | Não; repassa os `Set-Cookie` da API intactos |

O Route Handler de repasse tem dois cuidados que, se quebrarem, derrubam o login:

```ts
// 1. Set-Cookie um a um: Headers.set/new Headers() juntariam os valores com vírgula,
//    e Expires já tem vírgula.
for (const cookie of apiRes.headers.getSetCookie()) headers.append("set-cookie", cookie);

// 2. redirect: "manual" — senão o fetch segue o 302 do OAuth sozinho e o navegador
//    nunca vê o Location do Google.
const apiRes = await fetch(url, { redirect: "manual", ... });
```

### 8.6 Rotação na API

```
POST /auth/refresh → limitador → rotateRefreshToken(raw)
  1. hash; busca a linha
  2. não existe                                 → 401
  3. revogado?
       ≤ 10 s E existe sucessor vivo na família → graça (evento medível, não alerta)
       senão                                    → REUSO: revoga a família → 401 + alerta
  4. expirado                                   → 401
  5. revoga o atual (update condicional: só se ainda não revogado)
  6. cria o sucessor no MESMO familyId
  7. controller emite JWT novo e grava os dois cookies
```

**Melhoria recomendada (não está no CRONOS):** o problema da resposta perdida
([4.2](#42-os-três-problemas-de-uso-normal)) existe aqui também — se a resposta do refresh não
chega ao navegador, o refresh antigo já foi revogado e a renovação seguinte, 15 min depois, é
lida como roubo. O protocolo da [seção 4](#43-o-protocolo) se aplica: a rotação cria o
sucessor sem revogar o atual, e a confirmação acontece quando o sucessor é apresentado na
renovação seguinte (ou quando o front manda um sinal de recebimento). O custo é o refresh
antigo continuar válido até essa confirmação.

### 8.7 Google no Cenário B

```
navegador → GET /api/auth/google → Route Handler (redirect: "manual") → 302 accounts.google.com
usuário autoriza → GET {API}/auth/google/callback
  → passport.authenticate('google', { session: false })
  → findOrCreateGoogleUser(profile)   (mesmas regras de 7.6, inclusive o vínculo seguro)
  → establishSession + res.redirect(FRONTEND_URL)     ← redirect, não JSON: chegou por navegação
```

### 8.8 Ciclo de vida da sessão (Cenário B)

| Evento | Access token | Refresh token | Alcance |
| :-- | :-- | :-- | :-- |
| Login / cadastro / Google | Emitido, 15 min | Família nova | Este dispositivo |
| Refresh | Novo | Rotacionado na mesma família | Este dispositivo |
| Logout | Cookie limpo (o token segue válido até expirar) | Este token revogado | Este dispositivo |
| Reuso detectado | — | Família inteira revogada | Todos os dispositivos daquele login |
| Troca de senha (logado) | Reemitido | **Todos** revogados, família nova — revogar **antes** de emitir | Todos, exceto o atual |
| Redefinição por e-mail | — | Todos revogados, nenhum emitido | Todos |
| Usuário removido | Assinado, mas `requireAuth` não acha o usuário | Cascade | Imediato |

### 8.9 Limites conhecidos (Cenário B)

1. O access token não é revogável dentro dos 15 min (o preço de ser stateless); consultar o
   usuário em `requireAuth` a cada requisição faz um usuário *removido* perder acesso na hora.
2. Rate limit por instância, como no A.
3. A janela de graça é uma abertura explícita (o mesmo compromisso do OAuth 2.0 Security BCP
   para clientes concorrentes).
4. `GET /users/me` é chamado várias vezes por página; envolva `getCurrentUser` com `cache()`.
   Passar `signal` ao `fetch` desliga a deduplicação do Next.
5. O proxy decodifica o JWT sem validar: um cookie forjado com `exp` no futuro faz o proxy
   tratar o visitante como logado — ele entra na página, a primeira chamada à API devolve 401
   e a sessão cai. O efeito é uma tela de erro, nunca acesso a dado.

---

## 9. A e B lado a lado

| Tema | Cenário A | Cenário B |
| :-- | :-- | :-- |
| Processos no caminho | 1 (Next) | 2 (Next + API) |
| Cookie de sessão | 1 cookie JWE com `sid` opaco | 2 cookies: JWT (15 min) + refresh opaco (7 dias) |
| O proxy valida o cookie? | Sim (o segredo mora no mesmo processo) | Não, só decodifica o `exp` |
| Quando o proxy toca no banco / na API | Rotação, confirmação, rota só-deslogado | Só para renovar |
| Autoridade sobre a sessão | `getCurrentUser()` lendo o banco | `requireAuth` na API; o front pergunta via `GET /users/me` |
| Logout vale na hora? | Sim | Refresh sim; access token até expirar |
| Login e logout | Server Actions do Auth.js; o Next rerenderiza os layouts | `fetch` no cliente; `setUser` autoritativo |
| Google | Auth.js no Next | Passport/openid-client na API; o front repassa com `redirect: "manual"` |
| Rate limit do login | Dentro do `authorize` | Middleware da rota, antes da validação |
| Janela de graça | 60 s (o token autentica toda requisição) | 10 s (o refresh só aparece na renovação) |
| Propagar cookie renovado ao render | Automático no Next 16 | Manual no CRONOS; automático no Next 16 |

---

## 10. Defesas transversais

### 10.1 Rate limiting

| Limitador | Teto sugerido | Particularidade |
| :-- | :-- | :-- |
| Global (B) | 120/min por IP | Rede de proteção da instância |
| Login | 8 falhas / 15 min por IP | Conta **só falhas**: quem acerta a senha nunca gasta cota |
| Cadastro | 10 / hora por IP | Conta **sucessos**: o risco é fazenda de contas, não adivinhar senha |
| Refresh (B) | 30 / 15 min | Generoso: várias abas renovam sozinhas |
| Esqueci a senha | 5 / hora | **Nunca** "só falhas": o endpoint responde 200 por design, e a opção desarmaria o limitador em silêncio |
| Redefinir senha | 10 / hora | Contra adivinhação de token |

Limitador **antes** da validação do corpo: força bruta não deve gastar nem o schema.

### 10.2 IP do cliente

Cada proxy confiável na frente da aplicação acrescenta o endereço que viu no **fim** do
`X-Forwarded-For`; tudo à esquerda foi escrito pelo cliente e pode ser forjado. Leia da direita
para a esquerda, pulando `N - 1` entradas (N = proxies confiáveis). Nunca a primeira entrada, e
no Express `trust proxy` com número, nunca `true`. O `next start` só preenche o header com o
endereço do socket quando ele não veio na requisição: sem proxy na frente, o cliente ainda
consegue forjar.

### 10.3 Senha

- A mesma mensagem para e-mail inexistente e senha errada; a diferença vai para o log
  (`user_not_found` repetido do mesmo IP é varredura; `invalid_password` repetido na mesma
  conta é força bruta).
- **Custo constante:** quando o e-mail não existe, compare contra um hash fictício calculado
  no carregamento do módulo. Sem isso, "e-mail inexistente" responde bem mais rápido que
  "senha errada" — e, com cálculo preguiçoso, a primeira tentativa depois do boot ainda
  denuncia.
- "Conta desativada" conferida **depois** do bcrypt, pelo mesmo motivo.

### 10.4 Eventos de segurança

```json
{"type":"security","event":"session_token_reuse","at":"...","userId":"...","familyId":"...","tokenHashPrefix":"3f9a1c...","ip":"..."}
```

| Evento | Significado |
| :-- | :-- |
| `session_token_reuse` / `refresh_token_reuse` | **Roubo confirmado.** O alarme mais valioso da aplicação |
| `session_token_grace_reuse` | Concorrência normal. Não alerta; volume anormal denuncia bug de renovação |
| `login_failed` | Com `reason`: `user_not_found`, `invalid_password`, `no_local_password`, `inactive` |
| `rate_limit_exceeded` | Com `limiter` dizendo qual teto barrou |
| `google_login_denied` | `email_not_verified` ou `inactive` |
| `google_account_linked` | Com `passwordDropped` |

Nunca a senha tentada, nunca o valor do token: só identificadores, prefixo de 12 caracteres do
hash e IP.

### 10.5 Superfície HTTP (B, e A se expuser API pública)

Headers de segurança (Helmet, HSTS sem `preload`), CORS com `origin` fixo quando há
credenciais (`*` não é permitido), limite de corpo, 500 genérico em produção (um erro do ORM
entrega tabela, coluna e constraint), JSON malformado → 400 e corpo grande → 413.

---

## 11. Armadilhas do Next.js que custaram tempo

1. **`await` de dado de runtime no layout bloqueia a navegação** e esconde o `loading.tsx`.
   Promise no contexto (seção 5).
2. **Rota dinâmica sem `loading.tsx` não é pré-carregada.** O prefetch volta com meio
   kilobyte de casca vazia e não aquece nada.
3. **Server Component não grava cookie.** `cookies().set()` fora de Server Action ou Route
   Handler lança; com rotação, tentar renovar no render é destrutivo. Só o proxy renova.
4. **O proxy não vê os headers do router.** O Next remove `rsc`, `next-router-prefetch`,
   `next-router-state-tree` e afins do request entregue ao proxy e os recoloca depois
   (`next/dist/server/web/adapter.js`). Detectar prefetch no código do proxy é impossível; use
   `missing` no `matcher`, que é avaliado antes da remoção.
5. **Cookie gravado pelo proxy chega ao render da mesma requisição** (`response.cookies.set`
   → `x-middleware-set-cookie` → `cookies()`). Útil (dispensa reescrever o request) e perigoso
   (o render não prova que o navegador recebeu nada).
6. **O matcher precisa excluir `_next/` inteiro**, não só `_next/static`: o WebSocket do
   hot-reload passa por ele.
7. **`redirect()` numa página cujo layout não bloqueia chega com status 200**, como instrução
   no stream. Em teste de segurança, verifique o conteúdo (nenhum dado vazou, o redirect foi
   emitido), não o status.
8. **Cookie alterado numa Server Action rerenderiza página e layouts** na mesma resposta. É o
   que dispensa `router.refresh()` depois de login e logout no Cenário A.
9. **`unstable_rethrow` em todo `catch` que envolve código do Next**, senão `redirect()` e
   erros de render dinâmico viram "falha" engolida.
10. **`signal` no `fetch` desliga a deduplicação** (`dedupe-fetch.js`).
11. **Auth.js v5:** o `CredentialsSignin` lançado no `authorize` chega intacto numa Server
    Action (modo `raw`) e vira `?error=...&code=...` numa chamada direta; o logger padrão
    registra toda senha errada como stack trace de erro — filtre.
12. **Headers do Next não juntam `Set-Cookie` direito**: use `getSetCookie()` + `append`.

---

## 12. O que os testes precisam travar

| Parte | O que o teste garante |
| :-- | :-- |
| Classificação do token (pura) | `active`, `expired`, graça **só com sucessor vivo**, reuso fora da janela, o limite exato da janela |
| Cookie (puro) | Ida e volta dos claims; adulterado não decifra; segredo trocado não decifra; segredo antigo em `AUTH_SECRET_1` ainda decifra; cookie do formato anterior vale como deslogado |
| Rotas do proxy (puro) | Cada classe de rota; prefixo parecido com `/api/auth` não é tratado como rota do Auth.js; destino pós-login não aceita `//evil.com` nem `/\evil.com` |
| IP do cliente (puro) | Entrada forjada à esquerda ignorada; N proxies |
| Rate limit | Teto, janela, chave por IP, balde compartilhado entre instâncias do módulo |
| Contexto (puro + componentes) | Mescla sem apagar campos; edições acumulam; sem sessão o patch não cria usuário; (B) login depois de logout não herda campos |
| Ponta a ponta | Rotação emite pendente; confirmação aposenta o anterior; graça; **resposta perdida não desloga**; **rajada concorrente emite um só sucessor**; reuso derruba a família; sessão morta não entrega dado; `/login` com sessão morta não entra em loop; usuário desativado perde acesso na hora; `POST` não rotaciona; prefetch não rotaciona; o limitador **real** continua montado no endpoint real |
| Google | E-mail não verificado nega; conta nova sem senha; vínculo remove senha não verificada e revoga sessões; conta desativada nega e não ganha vínculo |

O teste de "o limitador real continua montado na rota real" merece destaque: sem ele dá para
provar que a biblioteca funciona, mas não que ela continua ligada no login. Um refactor
desarmaria a proteção sem nenhum teste acusar.

---

## 13. Checklists de implementação

### Cenário A

1. Schema: `User.passwordHash?`, `emailVerifiedAt`, `image`; `UserAuthProvider`;
   `SessionToken` (`familyId`, `tokenHash` único, `expiresAt`, `usedAt`, `revokedAt`, índices).
2. `lib/auth/config.ts`: TTL, rotação, graça, nome e opções do cookie, `isGoogleAuthEnabled`.
3. `lib/auth/session-cookie.ts`: encode/decode com o JWE do Auth.js, mesma lista de segredos.
4. `lib/auth/token-state.ts` (puro) e `session-store.ts` (abrir, rotacionar com trava,
   confirmar, revogar família, purgar).
5. `lib/auth/credentials.ts` com hash fictício pré-calculado; `lib/auth/google.ts` com o
   vínculo seguro.
6. `auth.ts`: cookie fixo, `jwt` só abre família no login, `session` sem o token,
   `events.signOut`, logger.
7. `proxy.ts`: classificação, rotação/confirmação só em GET, checagem no banco em rota
   só-deslogado, matcher sem `_next/` e com `missing` de prefetch.
8. `lib/session.ts`: `getCurrentUser` com `cache`, só leitura; `getSessionPromise`; guardas.
9. Server Actions de login, cadastro (rate limit), Google e logout.
10. `UserProvider` + layout raiz sem `await`; layouts de grupo sem guarda; uma guarda por
    `page.tsx`.
11. `loading.tsx` por rota com dado; componentes que leem o usuário reduzidos e em `Suspense`.
12. Rate limit, IP do cliente, eventos de segurança, auditoria.
13. `.env.example` com `AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID/SECRET`, `TRUST_PROXY_HOPS`.
14. Purga no boot e em cron.
15. Testes da seção 12.

### Cenário B

1. API: schema (`RefreshToken` com família), `authService` (JWT com `iss`/`aud`, refresh
   opaco com hash), `establishSession`, `requireAuth`, limitadores, `logSecurityEvent`, purga.
2. API: Google com `session: false`, sessão de cookie só para o `state`, montada só se
   configurado; callback responde com redirect.
3. API: carregadores de contexto por recurso; as cinco camadas nos services.
4. Front: `proxy.ts` (decodificar `exp` sem validar, renovar, limpar sessão morta, matcher com
   `missing` de prefetch).
5. Front: `app/api/[...path]/route.ts` com `redirect: "manual"` e `getSetCookie()`.
6. Front: `apiClient.ts` (nunca renova) e `apiClient.client.ts` (promise compartilhada +
   cooldown).
7. Front: `UserProvider` com alteração autoritativa, `useLogin`/`useLogout` sem
   `router.refresh()`.
8. Front: layout sem `await`, `loading.tsx`, Suspense pequenos.
9. Considerar a melhoria do sucessor pendente (8.6).
10. Testes da seção 12, mais os de integração da API.

---

## 14. Referências

**Neste repositório (Cenário A)**

- `src/proxy.ts`, `src/auth.ts`, `src/lib/auth/*`, `src/lib/session.ts`,
  `src/components/UserProvider.tsx`
- `tests/auth-session.test.ts`, `tests/auth-support.test.ts`
- `docs/arquitetura-autenticacao-e-autorizacao.md` — o módulo do CRONOS (Cenário B), fonte das
  decisões `SEC-xx`
- `docs/refatoracao-contexto-usuario.md` — a medição e o raciocínio da promise no contexto

**Next.js 16** (a documentação vem no pacote: `node_modules/next/dist/docs/01-app/`)

- `03-api-reference/03-file-conventions/proxy.md` — runtime Node, matcher, `has`/`missing`
- `03-api-reference/03-file-conventions/loading.md` — layout com dado de runtime bloqueia
- `02-guides/prefetching.md` — rota dinâmica sem `loading.js` não é pré-carregada
- `01-getting-started/07-mutating-data.md` — cookie alterado em Server Action rerenderiza

**React**

- [`use`](https://react.dev/reference/react/use), [`<Suspense>`](https://react.dev/reference/react/Suspense),
  [`createContext`](https://react.dev/reference/react/createContext)

**Auth.js v5**

- [authjs.dev](https://authjs.dev) — `node_modules/next-auth/lib/index.js` e `actions.js` mostram
  por que `auth()` num Server Component descarta os `Set-Cookie` e como `signIn`/`signOut`
  gravam o cookie numa Server Action

**Segurança**

- OAuth 2.0 Security Best Current Practice (RFC 9700) — rotação de refresh token e clientes
  concorrentes
- Sudhodanan & Paverd, *Pre-hijacked accounts* (USENIX Security 2022) — o ataque que o vínculo
  seguro com Google fecha
