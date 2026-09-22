# Refatoração: o contexto do usuário deixou de bloquear a navegação

> Documento de mudança já implementada. Registra o modelo anterior, a falha de
> performance que ele causava (medida em produção), e o desenho que a substituiu.
>
> É a continuação natural de
> [`decisao-sincronizacao-usuario-pos-acao.md`](decisao-sincronizacao-usuario-pos-acao.md):
> aquele documento resolveu *como atualizar* o usuário no contexto; este resolve
> *quando o usuário chega* nele.

---

## 1. O modelo anterior

O layout raiz resolvia a sessão e entregava o valor pronto ao Provider:

```tsx
// src/app/layout.tsx — ANTES
export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();          // GET /users/me
  return (
    <html>
      <body>
        <ThemeProvider>
          <UserProvider user={user}>{children}</UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

```tsx
// src/components/providers/UserProvider.tsx — ANTES
export default function UserProvider({ children, user: initialUser }: UserProviderProps) {
  const [user, setUserState] = useState(initialUser);   // prop só como valor inicial
  // ...
  return <UserContext.Provider value={user}>{/* … */}</UserContext.Provider>;
}
```

O desenho é o que a maioria dos tutoriais de App Router mostra, e funciona: qualquer
Client Component lê `useCurrentUser()` sem receber prop, e o valor já chega resolvido
no primeiro render, sem piscar.

O custo não estava no que ele fazia. Estava em **onde**.

---

## 2. A falha

### 2.1 O sintoma

Em produção (`cronos.gabrielmizael.com`), navegar entre abas de uma residência
deixava a tela **congelada, sem nenhuma mudança visual**, por centenas de
milissegundos. Medido com um `MutationObserver` no `<body>`, saindo de
`/dashboard/residences/[code]/members` para `.../settlements`:

| Medida | Valor |
| --- | --- |
| Tempo até a primeira mutação no DOM | **354 ms** |
| Mutações no DOM antes disso | **0** |
| Tempo até a URL mudar | ~400 ms |

Sem spinner, sem skeleton, sem barra de progresso: a interface ficava idêntica ao
estado anterior e depois trocava de uma vez.

### 2.2 A causa

Duas regras do App Router se combinam aqui, e a segunda é a que morde.

**Primeira:** toda rota que lê dado de runtime é dinâmica, e rota dinâmica **não é
pré-carregada** a menos que tenha uma fronteira `loading.js`.

> "Without Cache Components, a static route is prefetched in full, while a dynamic
> route is skipped unless it has a `loading.js` boundary."
> — [nextjs.org/docs/app/guides/prefetching](https://nextjs.org/docs/app/guides/prefetching)

O projeto não tinha **nenhum** `loading.tsx`, em nenhuma das 21 rotas. Dá para ver o
efeito na rede: o prefetch que o `<Link>` dispara ao entrar no viewport voltava com

| Rota | Prefetch | Navegação real |
| --- | --- | --- |
| `/[code]/members` | 517 bytes | 8.798 bytes |
| `/[code]/settlements` | 523 bytes | 9.249 bytes |

Meio kilobyte de casca vazia. O prefetch gastava um round trip inteiro e não
aquecia nada — na hora do clique, o navegador buscava a página do zero.

**Segunda, e a decisiva:** mesmo *com* `loading.tsx`, ele não apareceria enquanto o
layout raiz estivesse esperando dado de runtime.

> "If the layout accesses uncached or runtime data (e.g. `cookies()`, `headers()`,
> or uncached fetches), `loading.js` will not show a fallback for it. **Without
> Cache Components: Navigation blocks until the layout finishes rendering.**"
> — [nextjs.org/docs/app/api-reference/file-conventions/loading](https://nextjs.org/docs/app/api-reference/file-conventions/loading)

E `getCurrentUser()` lê cookies (via `apiClient`) e não é cacheado. Como ele estava
no layout **raiz**, essa regra valia para o site inteiro.

### 2.3 Por que isso é caro aqui, e não em qualquer app

O `GET /users/me` em si é barato — medimos ~3 ms de trabalho de banco. O problema é
que ele fica no caminho crítico de *toda* navegação, e o caminho crítico deste app
é longo: a origem roda em `us-east-2` (Ohio) e o público é brasileiro, o que impõe
~194 ms de rede por requisição antes de qualquer processamento.

Somando: ~194 ms de rede + ~190 ms de render na instância `t4g.small` = os ~385 ms
que o usuário sentia. Nada disso é resolvido pelo contexto — mas **tudo isso
acontecia com a tela parada**, porque o layout bloqueava o `loading.tsx`.

A mudança deste documento não deixa a navegação mais rápida. Ela faz o usuário
**ver** que algo está acontecendo desde o primeiro frame, e destrava o prefetch.

---

## 3. O modelo novo

A ideia em uma frase: **o contexto guarda a promise da sessão, não a sessão**.

```tsx
// src/app/layout.tsx — DEPOIS  (repare: não é mais async, e não há await)
export default function RootLayout({ children }: { children: ReactNode }) {
  const sessao = getSessionPromise();
  return (
    <html>
      <body>
        <ThemeProvider>
          <UserProvider sessao={sessao}>{children}</UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

O layout dispara a chamada e termina de renderizar no mesmo tick. A casca — tema,
`AppShell`, navegação, tab bar — vai para o navegador imediatamente. Quem espera é
só quem lê o usuário, e cada um desses pontos tem o próprio `<Suspense>`.

Do outro lado, o Provider expõe a promise e os consumidores a desembrulham com
`use()`:

```tsx
export function useCurrentUser(): AuthUser | null {
  const { sessao, alteracao } = useContext(UserContext);

  if (alteracao?.autoritativo) {
    return alteracao.valor;          // login/logout: já sabemos, nem toca na promise
  }

  const usuarioDoServidor = use(sessao);   // suspende até resolver

  if (!alteracao) return usuarioDoServidor;

  return usuarioDoServidor
    ? { ...usuarioDoServidor, ...alteracao.valor }
    : alteracao.valor;
}
```

Esse é o padrão que o próprio React documenta para dado que nasce no servidor e é
consumido no cliente:

> "When passing a Promise from a Server Component to a Client Component, its
> resolved value must be serializable. […] The component calling `use` *suspends*
> while the Promise is pending."
> — [react.dev/reference/react/use](https://react.dev/reference/react/use)

### 3.1 Por que `use()` pode ficar dentro de um `if`

Chamar um Hook condicionalmente seria proibido — mas `use` não é um Hook:

> "Despite its name, `use` is not a Hook. Unlike Hooks, it can be called inside
> loops and conditional statements like `if`."

Aproveitamos isso de propósito: depois de um login ou logout, a resposta já é
conhecida e não há motivo para tocar na promise. Isso evita que o componente
suspenda de novo caso o servidor mande uma promise nova — num `router.refresh()`,
por exemplo.

---

## 4. Onde ficam as fronteiras de Suspense

Colocar `useCurrentUser()` direto num componente grande anularia a mudança: o
boundary mais próximo subiria e a casca inteira voltaria a esperar. Por isso cada
leitor do usuário foi reduzido ao menor componente possível.

| Onde | O que suspende | Fallback |
| --- | --- | --- |
| `AppShell` (rail e header) | `AvatarUsuario` — só o avatar | Bloco de 30×30 px, `var(--r-md)` — as medidas exatas de `.avatar` |
| `Inicio` (landing) | `AcoesCabecalho` e `AcoesHero` | Botões do estado deslogado, que é o caso comum de quem chega numa landing |
| `/profile` | `Profile` inteiro | `ProfileCarregando`, que reusa `Profile.module.css` |

O resto do `AppShell` — navegação, tema, sino de notificações, botão de lançar
despesa, e o `{children}` da página — **não** depende da sessão e renderiza sem
esperar.

### 4.1 Os `loading.tsx`

Foram criados onze, um por rota com dado de servidor:

```
app/dashboard/residences/loading.tsx
app/dashboard/residences/[code]/loading.tsx              (+ loading.module.css)
app/dashboard/residences/[code]/members/loading.tsx
app/dashboard/residences/[code]/members/requests/loading.tsx
app/dashboard/residences/[code]/settlements/loading.tsx
app/dashboard/residences/[code]/expenses/loading.tsx
app/dashboard/residences/[code]/expenses/recurring/loading.tsx
app/dashboard/residences/[code]/reports/loading.tsx
app/dashboard/residences/[code]/settings/loading.tsx
app/dashboard/alerts/loading.tsx
app/profile/loading.tsx
```

As primitivas estão em [`components/ui/Skeleton.tsx`](../src/components/ui/Skeleton.tsx)
(bloco, linha de texto e o wrapper acessível) e
[`components/ui/SkeletonPagina.tsx`](../src/components/ui/SkeletonPagina.tsx) (as
peças que se repetem: cabeçalho, seletor de competência, listas).

Três regras que valeram para todos:

- **Mesma medida do conteúdo real.** Um skeleton de tamanho diferente troca a tela
  congelada por um salto de layout, que é igualmente ruim. As medidas foram copiadas
  das regras originais e os arquivos dizem de onde vieram.
- **Menos linhas, não mais.** Um skeleton mais alto que a lista real faz a página
  encolher quando os dados chegam. Onde a contagem é conhecida, ela é exata — o
  relatório por categoria mostra cinco, porque são cinco categorias fixas.
- **São Server Components.** Nenhum tem `"use client"`: seria contraproducente
  mandar JS ao navegador só para desenhar bloco cinza, numa mudança que existe para
  acelerar a tela.

O movimento respeita `prefers-reduced-motion`, e os blocos são `aria-hidden` sob um
`role="status"` que anuncia "Carregando…" uma vez, em vez de o leitor de tela ler
dezenas de elementos vazios.

---

## 5. O que foi preservado, e como

O comportamento de escrita do contexto (login, logout, edição de perfil) **não
mudou** do ponto de vista de quem usa `useSetCurrentUser()`. Mas a implementação
precisou mudar de lugar, e vale registrar por quê.

### 5.1 O merge saiu da escrita e foi para a leitura

`PATCH /users/me` devolve o `AuthUser` **sem** `hasPassword` — só `GET /users/me`
preenche esse campo (ver [`types/auth.ts`](../src/types/auth.ts)). Se o contexto
substituísse o objeto inteiro, editar o perfil apagaria esse campo e o link
"Alterar senha" sumiria até a próxima carga de página.

Antes, o merge acontecia no `setState`, contra o usuário anterior. Isso não é mais
possível: no momento da escrita o Provider **não tem** o usuário resolvido, só a
promise. Então a alteração local é guardada como um patch e a mescla acontece na
leitura, em `useCurrentUser()`, contra o valor que veio do servidor.

### 5.2 Alteração "autoritativa" — o caso que o modelo antigo não tinha

Nem toda escrita deve ser mesclada. Logout e login **trocam de identidade**, e
mesclar deixaria campos órfãos — o `profilePic` de quem saiu grudado em quem
entrou. Por isso a alteração local carrega uma marca:

```ts
interface AlteracaoLocal {
  autoritativo: boolean;      // true = substitui; false = mescla sobre o servidor
  valor: AuthUser | null;
}
```

`setUser(null)` e um login logo após um logout são autoritativos. Edição de perfil
não é. Há teste para os dois caminhos.

---

## 6. Alternativas descartadas

| Alternativa | Por que não |
| --- | --- |
| **Só adicionar `loading.tsx`, sem mexer no layout** | Não funcionaria. A documentação do Next é explícita: com dado de runtime no layout, o fallback do `loading.js` não aparece. Era o caminho óbvio, e é uma armadilha. |
| **Mover `getCurrentUser()` para cada `page.tsx`** | É a outra recomendação da doc, e funciona — mas espalha a chamada por 21 arquivos e não resolve o `AppShell`, que precisa do usuário e vive no layout de `/dashboard`. |
| **Buscar o usuário no cliente com `useEffect`** | Devolveria o problema que a V2.0 já tinha resolvido: uma requisição a mais depois da hidratação, e o avatar piscando em toda navegação. |
| **`cache()` do React em volta de `getCurrentUser`** | Resolve *outra* coisa (a chamada duplicada por render) e continua valendo a pena — mas não destrava o bloqueio do layout, que é o assunto aqui. |
| **Renderizar o estado deslogado e corrigir depois** | Mostraria "Criar conta" para quem já tem conta. Pior que esperar. |

---

## 7. Efeito colateral nos testes

`useCurrentUser()` agora suspende, então todo teste que lê o contexto precisa de um
`<Suspense>` em volta — e de um detalhe que custou tempo para achar:

**o `render` tem que acontecer dentro de `act()`.**

Com `IS_REACT_ACT_ENVIRONMENT` ligado (a Testing Library liga), a retomada de um
Suspense é agendada e só é descarregada dentro de um `act`. Renderizar fora e tentar
esperar depois — com `waitFor`, com `act` vazio, ou dando `await` na própria promise
— deixa o componente suspenso para sempre. Verificado com um caso mínimo de `use()`
+ `Suspense` neste mesmo setup de Jest, isolado do código do projeto.

O padrão que funciona:

```tsx
await act(async () => {
  utils = renderHook(() => useCurrentUser(), { wrapper });
});
```

`UserProvider.test.tsx` foi reescrito nesse formato e ganhou três casos novos: que o
fallback aparece enquanto a sessão não resolve, que `hasPassword` sobrevive a várias
edições seguidas, e que login depois de logout não herda campos do usuário anterior.

---

## 8. O que esta mudança **não** resolve

Registrado para não gerar expectativa errada — os números vêm do diagnóstico de
performance de 03/09/2026.

- **Os ~194 ms de rede.** A origem está em Ohio e o público é brasileiro. Só migrar
  a instância para `sa-east-1` mexe nisso.
- **Os ~190 ms de render por página.** São CPU da `t4g.small`, que é burstable e
  divide 2 GB com mais três containers.
- **A chamada duplicada de `/users/me`.** O `apiClient.ts` passa
  `signal: AbortSignal.timeout(...)` em toda chamada, e o Next trata a presença de
  `signal` como opt-out explícito de deduplicação
  (`node_modules/next/dist/server/lib/dedupe-fetch.js`). Continua valendo envolver
  `getCurrentUser` com `cache()` do React.
- **O Router Cache desligado para rotas dinâmicas.** Sem `staleTimes` configurado, o
  padrão é 0: revisitar uma aba vista segundos antes refaz o round trip inteiro.

---

## 9. Referências

- [`use` — react.dev](https://react.dev/reference/react/use)
- [`createContext` — react.dev](https://react.dev/reference/react/createContext)
- [`<Suspense>` — react.dev](https://react.dev/reference/react/Suspense)
- [`loading.js` — Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/loading)
- [Prefetching — Next.js](https://nextjs.org/docs/app/guides/prefetching)
- [`decisao-sincronizacao-usuario-pos-acao.md`](decisao-sincronizacao-usuario-pos-acao.md) — por que o contexto virou estado client em vez de depender de `router.refresh()`
