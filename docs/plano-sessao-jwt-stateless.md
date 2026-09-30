# Plano de execução — sessão em JWT stateless (15 min) + refresh token em banco (7 dias)

> **Para quem executa:** leia o plano inteiro antes de mexer em qualquer arquivo. As decisões da
> [seção 3](#3-decisões-já-tomadas-não-reabrir) estão fechadas; não troque por alternativas. Siga as
> fases na ordem e só avance quando o checkpoint da fase passar. Se algo do plano não bater com o
> código (arquivo sumiu, API diferente), pare, descreva a divergência e siga pela alternativa mais
> próxima do espírito do plano, registrando isso no relatório final.
>
> **Para o usuário:** antes de mandar executar, leia a
> [seção 2](#2-comparativo-modelo-atual--modelo-proposto), que compara o modelo atual com o proposto.

---

## 0. Regras de execução

1. **Não faça commit nem push.** No fim, entregue o relatório da [seção 11](#11-relatório-final).
2. **Não edite** `docs/jornada-autenticacao-ate-inscricao.md` (arquivo não rastreado, trabalho em
   andamento do usuário) nem este plano.
3. **Nunca imprima valores do `.env`** (há segredo real do Google lá). Leia só o que precisar e não
   repita valores no chat nem no relatório. Tokens de teste gerados localmente também não vão para o relatório.
4. **Não pare nem apague containers** sem perguntar ao usuário.
5. **Não faça login com Google** no navegador (exige a conta pessoal do usuário). Teste o fluxo do
   Google só até a tela do Google e pelos caminhos de erro (ver [Fase 7](#fase-7--validação)).
6. Convenções do repositório: comentários de código em português **sem acentos**, explicando o
   *porquê*; textos que o usuário vê **com acentos**. Imite a densidade de comentários dos arquivos
   vizinhos. Imports com o alias `@/`.
7. Plataforma: Windows. O Bash disponível é Git Bash (POSIX). `curl` e `docker` existem. Se `sleep`
   estiver bloqueado, espere com `node -e "setTimeout(() => {}, 11000)"`.

---

## 1. Objetivo e requisitos

| # | Requisito do usuário | Como o plano atende |
| :-- | :-- | :-- |
| R1 | O **cookie de sessão** não é guardado no banco; o **refresh token é** guardado no banco, para poder revogar e detectar reuso | Cookie de sessão = JWT de acesso stateless (nada no banco). Refresh = valor opaco cujo **hash** fica no novo model `RefreshToken` (família, rotação, graça, detecção de reuso). O model `SessionToken` (sessão atual) é apagado |
| R2 | Cookie de sessão expira em 15 minutos | `voacraque.session` = JWT HS256 com `exp` de 15 min **e** `Max-Age=900` |
| R3 | Refresh de 7 dias que renova a sessão sem novo login; renovação no `proxy.ts` só se a referência fizer assim | A referência renova no `proxy.ts` **só quando o access expirou** (não a cada requisição). O plano faz o mesmo. Ver [seção 4](#4-o-que-foi-adaptado-do-repositório-de-referência) |
| R4 | Adaptar a arquitetura do repo `gbrlmzl/sistema-controle-despesas-api` (e do front que a consome) | Ver [seção 4](#4-o-que-foi-adaptado-do-repositório-de-referência) |

---

## 2. Comparativo: modelo atual × modelo proposto

> **Serve para o usuário decidir se migra.** Quem executa o plano pode pular esta seção: ela não tem
> tarefas. Os comportamentos do modelo atual foram conferidos no código (`src/lib/auth/*`,
> `src/proxy.ts`, `src/actions/*`); os do proposto são os que as seções 3 a 8 especificam.

### 2.1 Os dois modelos em poucas linhas

**Atual (em produção hoje).** Um cookie só: o JWE do Auth.js, que vale 30 dias sem uso e carrega um id
de sessão opaco (`sid`). Toda requisição que lê o usuário consulta esse `sid` no banco (`SessionToken`),
junto com o usuário. O proxy troca o `sid` a cada 15 min de uso, em dois tempos: emite um sucessor
pendente e só aposenta o anterior quando o navegador devolve o sucessor.

**Proposto.** Dois cookies. O de sessão é um JWT de 15 min, verificado só pela assinatura, sem banco. O
de refresh é opaco, vale 7 dias e fica no banco (`RefreshToken`), com rotação, graça de 10 s e detecção de
reuso, como no sistema-controle-despesas. Quando o JWT vence, o proxy troca o refresh por um par novo.

No fundo, o atual já é um "access + refresh" fundido num token só, conferido no banco a cada requisição.
O proposto separa os dois e tira o banco do caminho do token de acesso.

### 2.2 Lado a lado

| Critério | Atual | Proposto | Vantagem |
| :-- | :-- | :-- | :-- |
| Atende R1–R3 como escritos (cookie de sessão fora do banco, 15 min, refresh de 7 dias) | Não | Sim | Proposto |
| Logout | Encerra a sessão no servidor na hora | Revoga o refresh na hora; uma cópia do cookie de sessão continua valendo por até 15 min | Atual |
| Troca de senha (outros aparelhos) | Caem na hora | Caem em até 15 min | Atual |
| Conta desativada, troca de papel | Vale na hora | Vale na hora (`getCurrentUser` lê o usuário no banco) | Empate |
| Vazamento do `AUTH_SECRET` | O segredo sozinho não abre sessão: um cookie forjado precisa de um `sid` que só existe como hash no banco | Quem tem o segredo assina cookie de sessão para **qualquer** usuário, inclusive o superadmin, até o segredo ser trocado | Atual (diferença grande) |
| Cookie roubado (malware, aparelho emprestado) | Logout da vítima ou reuso derrubam o ladrão na hora | Cookie de sessão roubado vale até 15 min, sem como derrubar; refresh roubado é pego pelo reuso | Atual (leve) |
| Rede instável (a resposta com o token novo se perde) | Tolera: o token atual segue valendo até o navegador confirmar o sucessor | Se o navegador reapresentar o refresh antigo depois de 10 s, é lido como reuso: a pessoa é deslogada | Atual |
| Alarme de roubo (`*_reuse`) | Falso positivo quando um aparelho volta depois de uma troca de senha e o token dele já está na hora de rotacionar (revogado sem sucessor vivo = "reuso") | Sem falso positivo na troca de senha (`revokedReason`), mas com falso positivo na rede instável | Empate: muda a fonte do ruído |
| Abas e requisições em paralelo | Graça de 60 s + confirmação + `SELECT ... FOR UPDATE` | Graça de 10 s; cada requisição concorrente ganha um sucessor | Empate |
| Consultas ao banco por requisição | 1 (sessão + usuário juntos) | 1 (usuário) | Empate: o "stateless" não economiza nada aqui, porque `getCurrentUser` precisa do usuário de qualquer jeito |
| Escritas no banco | ~2 a cada 15 min de uso (sucessor + confirmação) | ~2 a cada 15 min de uso (revoga + cria) | Empate |
| Escalar para mais de uma instância | Precisa do Postgres compartilhado (já tem) | Idem | Empate (nos dois, o gargalo é o rate limit em memória) |
| Duração da sessão | 30 dias sem uso | 7 dias sem uso | Nenhuma: é uma constante (`SESSION_IDLE_TTL_S`); o atual passa a 7 dias trocando um número |
| Complexidade do protocolo | Alta: pendente/confirmado, graça que depende de sucessor vivo, trava de linha, rotação só em GET | Média: rotação simples da referência + `revokedReason`; em troca, dois cookies e uma regra nova para Server Actions que gravam cookie | Proposto (leve) |
| Código de segurança próprio | Menos: o Auth.js faz o OAuth e a cifragem | Mais: o handshake do Google (state, PKCE, troca do code, conferência do `id_token`) passa a ser código do projeto, ainda que pequeno | Atual |
| Dependências | `next-auth@5.0.0-beta.32` (beta) e acoplamento ao formato interno do cookie do Auth.js (salt, ordem dos segredos) | `jose` e `arctic`, pequenas e estáveis | Proposto |
| Acoplamento a detalhes internos do Next | Depende de o Next repassar ao render os cookies gravados pelo proxy | O mesmo, e também de o `Set-Cookie` de uma Server Action substituir o do proxy (conferido no código do Next 16 e testado no cenário E3, mas pode mudar numa versão futura) | Atual |
| Server Actions novas | Não precisam pensar em sessão (o proxy só rotaciona em GET e o token vale 30 dias) | Uma action nova que grave qualquer cookie em rota protegida precisa manter a sessão coerente, senão gera falso reuso | Atual |
| Padrão e consistência | Protocolo próprio deste projeto | Mesmo modelo do sistema-controle-despesas e do mercado (access + refresh); documentação e raciocínio servem aos dois projetos | Proposto |
| App móvel ou API separada no futuro | Só cookie; exigiria adaptação | Access + refresh é o formato que esses clientes esperam (ler `Authorization: Bearer` seria uma adição pequena) | Proposto, se isso estiver nos planos |
| Custo e risco da migração | Nenhum: está em produção, testado e documentado | Cerca de 45 arquivos entre código, testes, configuração e docs numa parte crítica; reescreve o login do Google (só testável ponta a ponta com conta real); desloga todo mundo uma vez; deixa desatualizados os docs de autenticação | Atual |

### 2.3 Prós e contras

**Modelo atual**

- Prós:
  - Revogação imediata em tudo: logout, troca de senha, reuso detectado, desativação.
  - O `AUTH_SECRET` sozinho não basta para abrir sessão.
  - Aguenta resposta perdida em rede ruim sem deslogar ninguém.
  - Server Actions e rotas novas não precisam saber de sessão.
  - Já está em produção, com testes e documentação.
- Contras:
  - Não cumpre os requisitos como foram escritos (o cookie de sessão depende do banco e vive 30 dias).
  - Protocolo difícil de entender e de alterar (dois tempos, graça com sucessor, trava de linha); pouca
    gente reconhece o padrão.
  - Depende de uma versão beta do `next-auth` e do formato interno do cookie dele.
  - Alarme de roubo falso quando um aparelho volta depois de uma troca de senha.
  - Modelo diferente do outro projeto do mesmo autor: dois protocolos para manter na cabeça.
  - Só serve para navegador; um app móvel pediria outro mecanismo.

**Modelo proposto**

- Prós:
  - Cumpre R1–R3 ao pé da letra.
  - Padrão conhecido (access + refresh com rotação e reuso), igual ao do sistema-controle-despesas.
  - Sai do `next-auth` beta; `jose` e `arctic` são pequenas e estáveis.
  - Protocolo de rotação mais simples de ler; `revokedReason` tira o alarme falso da troca de senha.
  - Abre caminho para app móvel ou API separada.
- Contras:
  - Janela de até 15 min sem revogação do cookie de sessão (logout, troca de senha, cookie roubado).
  - O `AUTH_SECRET` vira chave-mestra: quem o tiver entra como qualquer usuário.
  - Rede instável pode deslogar a pessoa e gerar alarme falso de roubo — relevante para quem usa o app
    no celular, na quadra.
  - Mais código de segurança próprio (OAuth do Google) e uma regra nova para Server Actions.
  - Custo e risco de migrar algo que funciona.

### 2.4 O que a migração não entrega

- **Menos carga no banco:** não. `getCurrentUser` continua lendo o usuário a cada requisição, e deve
  continuar (é o que faz desativação e troca de papel valerem na hora).
- **Mais segurança:** não. Em revogação, vazamento do segredo e rede instável, o proposto fica igual ou
  pior. Os ganhos dele nessa área são sair de uma dependência beta e ter um alarme de roubo que não
  dispara na troca de senha.
- **Sessão de 7 dias:** não depende da migração; no modelo atual é uma constante.

### 2.5 Variante híbrida (se quiser migrar sem perder a revogação imediata)

Não está no plano; entra só se você escolher. O JWT de sessão passa a carregar a família do refresh
(`fam`), e `getCurrentUser` confere, na mesma consulta que já faz ao usuário, se essa família ainda tem
um refresh vivo.

- **Ganha:** logout, troca de senha e reuso detectado passam a valer na hora, e o `AUTH_SECRET` sozinho
  volta a não bastar (é preciso uma família viva da vítima, que só existe no banco).
- **Custa:** o cookie de sessão continua fora do banco (R1 segue atendido), mas a validade dele passa a
  depender do banco — deixa de ser stateless no sentido estrito. Não resolve o caso da rede instável.

### 2.6 Como decidir

- **Migre** se pesarem mais: padronizar com o sistema-controle-despesas, sair do `next-auth` beta, ter
  um protocolo que outras pessoas reconheçam, preparar um app móvel ou API, e os 15 min / 7 dias forem
  exigência. Aceite a janela de 15 min ou adote a variante híbrida.
- **Não migre (ou adie)** se pesarem mais: revogação imediata, robustez em rede de celular e não mexer
  numa parte crítica que funciona. Nesse caso, a alternativa barata é manter o modelo atual e trocar
  `SESSION_IDLE_TTL_S` para 7 dias.
- **Resumo honesto:** em segurança e robustez, o modelo atual empata ou vence em quase todos os
  critérios. O proposto vence em padronização, dependências e clareza. Migrar é uma decisão de
  manutenção e padronização, não de segurança.

---

## 3. Decisões já tomadas (não reabrir)

| # | Decisão | Motivo |
| :-- | :-- | :-- |
| D1 | **Remover o Auth.js (`next-auth`)** e fazer o Google com a lib `arctic` | Ver [D1 em detalhe](#d1-em-detalhe-por-que-não-manter-o-authjs) |
| D2 | **Access token = JWT HS256 assinado (JWS), 15 min**, `iss` e `aud` exigidos. Cookie `HttpOnly` sempre; `Secure` + prefixo `__Host-` quando servido por https | Ver [D2 em detalhe](#d2-em-detalhe-cookie-httponly--secure). Igual à referência (`SEC-12`) |
| D3 | **Refresh token opaco (40 bytes aleatórios em hex), 7 dias, só o hash SHA-256 no banco**, agrupado por família, **rotativo**, com **janela de graça de 10 s** e **detecção de reuso** | Porte direto de `rotateRefreshToken` da referência |
| D4 | **Coluna `revokedReason`** (enum) em `RefreshToken`: só token aposentado **por rotação** pode ser lido como reuso | Melhoria sobre a referência. Sem ela, um aparelho que ainda guarda um refresh revogado por troca de senha dispara `refresh_token_reuse` ("roubo confirmado") — alarme falso. Com ela: `ROTATED` fora da graça = roubo; qualquer outro motivo = sessão encerrada, sem alarme |
| D5 | **Refresh deslizante**: cada rotação cria o sucessor com 7 dias cheios | Igual à referência. A sessão cai após 7 dias **sem uso** |
| D6 | **Quem renova é o `src/proxy.ts`, e só quando o access falta, é inválido ou tem menos de 60 s de vida** | Igual à referência (lá, margem de 5 s). 60 s aqui porque uma Server Action com upload de até 6 MB passa pelo proxy no início e só verifica o access no fim |
| D7 | O proxy renova em **páginas, Server Actions e `/api/*`**, exceto `/api/auth/*`, POST em rota só-de-deslogado e prefetch especulativo | Diferença deliberada: na referência `/api/*` é repasse para a API externa e o cliente refaz a chamada após 401. Aqui as rotas de API rodam no mesmo processo, os hooks fazem `fetch` direto (16 chamadas em 12 hooks, sem wrapper) e há `EventSource` (que não tem retry). Cobrir `/api/*` no proxy resolve tudo sem mexer no cliente |
| D8 | **`getCurrentUser()` continua sendo a autoridade**: verifica o access, carrega o usuário do banco e exige `active`. Papel (`role`) não vai no token | Igual ao `requireAuth` da referência (busca o usuário a cada requisição). Desativação e troca de papel valem na hora |
| D9 | **O access não é revogável** nos seus 15 min | Consequência de R1 (sessão stateless), mesma da referência. Revogar o refresh derruba o aparelho na próxima renovação (≤ 15 min) |
| D10 | **Logout revoga a família inteira** do refresh deste aparelho (a referência revoga só o token) | Mata também os sucessores criados na janela de graça |
| D11 | Nomes: `voacraque.session`, `voacraque.refresh`, `voacraque.oauth` (state do Google), com `__Host-` em https | `__Host-` exige `Secure`, `Path=/` e nenhum `Domain`: um subdomínio não consegue plantar o cookie |
| D12 | Chaves derivadas por finalidade (HKDF-SHA256 do `AUTH_SECRET`): uma para o access, outra para o state do OAuth; `aud` diferente em cada | Um token de uma finalidade nunca valida como outra. `AUTH_SECRET_1..3` seguem aceitos na verificação (troca de segredo sem derrubar sessões) |
| D13 | Variáveis de ambiente **não mudam de nome** (`AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`); só `AUTH_TRUST_HOST` deixa de existir | Zero mudança de infraestrutura/segredos em produção |
| D14 | Callback do Google **no mesmo caminho de hoje**: `/api/auth/callback/google` | Nada muda no Google Cloud Console |

### D1 em detalhe: por que não manter o Auth.js

- **Dá para manter o Auth.js com JWT assinado em vez de JWE?** Tecnicamente sim: a config aceita
  `jwt: { encode, decode }` próprios, e eles poderiam assinar HS256 em vez de cifrar.
- **O problema não é o formato, é o modelo.** O Auth.js tem **uma** sessão: um cookie
  (`authjs.session-token`) que ele mesmo grava, com `maxAge` e renovação dele. Ele não tem refresh
  token para a própria sessão (o "refresh" dele é o do provedor OAuth), não tem família, rotação nem
  reuso. Montar access de 15 min + refresh rotativo em banco por cima dele significa conviver com dois
  sistemas de sessão, desligar o cookie dele na mão e depender dos callbacks `jwt`/`signIn`, que rodam
  em pontos onde nem sempre dá para gravar cookie (é o que o comentário atual de `src/auth.ts` já
  documenta).
- **Usá-lo só para o Google** funciona (chamar `establishSession` dentro do callback `signIn`), mas ele
  continuaria gravando o próprio cookie de sessão e os de CSRF/callback-url, e o projeto seguiria
  preso a uma versão beta (`next-auth@5.0.0-beta.32`) por causa de um handshake.
- **O handshake com a `arctic` é pequeno e explícito**: gerar `state` + `code_verifier`, guardá-los num
  cookie assinado de 10 min, trocar o `code` pelo `id_token` e conferir `iss`/`aud`. As regras que
  importam (vincular por e-mail verificado, derrubar senha não verificada, conta desativada) já moram
  em `src/lib/auth/google.ts` e ficam. É o equivalente ao `passport-google-oidc` da referência.

### D2 em detalhe: cookie HttpOnly + Secure

- **`HttpOnly` sempre** (os três cookies): JavaScript da página não lê nem grava.
- **`Secure` sempre que a aplicação é servida por https**, ou seja, em produção (Caddy com TLS). A
  regra atual continua: `Secure` quando `AUTH_URL` começa com `https://` (ou, sem `AUTH_URL`, quando
  `NODE_ENV=production`). Com `Secure`, os nomes ganham o prefixo `__Host-`, que o navegador só
  aceita com `Secure`, `Path=/` e sem `Domain`.
- **Por que não forçar `Secure` também em `http://localhost`:** Chrome e Firefox aceitam, mas o Safari
  não, e acesso pela rede local (`http://192.168.x.x:3000`, celular testando) perderia a sessão.
- **`SameSite=Lax`**: `Strict` faria o navegador descartar os cookies gravados na volta do Google
  (navegação de topo vinda de outro site).
- **JWS em vez de JWE não reduz essa proteção**: a assinatura impede adulteração; cifrar só esconderia
  os claims (`sub` = id do usuário), que não são segredo.
- Há teste automático garantindo `secure: true` e prefixo `__Host-` quando `AUTH_URL` é https, e um
  item do checklist pós-deploy para conferir os headers em produção.

---

## 4. O que foi adaptado do repositório de referência

Referências: `gbrlmzl/sistema-controle-despesas-api` (Express + Passport + `jsonwebtoken`) e o front
`gbrlmzl/sistema-controle-despesas-front` (Next 16), ambos lidos para este plano. A arquitetura dos
dois está descrita em `docs/arquitetura-autenticacao-e-autorizacao.md`.

**Como a referência renova (resposta ao R3):** o `src/proxy.ts` do front decodifica o `exp` do JWT e,
**só se ele já expirou** (margem de 5 s) e existe o cookie `REFRESH`, chama `POST /auth/refresh` e
propaga os cookies novos para a resposta e para o request. O matcher dele exclui `/api/*`,
arquivos e prefetch. Para `fetch` do cliente, `apiClient.client.ts` faz **uma** nova tentativa após
401 via `/api/auth/refresh` (promise compartilhada, cooldown de 30 s). O `apiClient.ts` de servidor
**nunca** renova (renovar durante o render queimava o token sem entregar o sucessor). Não há
renovação a cada requisição.

| Peça na referência | No Voa Craque (depois deste plano) |
| :-- | :-- |
| `signToken`/`verifyToken` (HS256, `iss`/`aud`, 15 min) | `src/lib/auth/tokens.ts` (`signAccessToken`/`verifyAccessToken`), com `jose` |
| Model `RefreshToken` (`tokenHash` único, `familyId`, `expiresAt`, `revokedAt`) | Mesmo model, **mais** `revokedReason` (D4) |
| `createRefreshTokenRecord` / `issueRefreshToken` (40 bytes hex, SHA-256) | `issueRefreshToken` em `src/lib/auth/refresh-tokens.ts` |
| `rotateRefreshToken` (graça de 10 s com sucessor vivo, reuso derruba a família, não reescreve `revokedAt`) | `rotateRefreshToken` com a mesma lógica; classificação pura em `refresh-token-state.ts` |
| `revokeRefreshToken` (logout: só o token) | `revokeRefreshFamily(raw, "LOGOUT")` (D10) |
| `revokeAllUserTokens` (troca/redefinição de senha) | `revokeAllUserRefreshTokens(userId, reason)` |
| `purgeExpiredRefreshTokens` (retenção de 30 dias) + `runTokenPurge` | `purgeExpiredRefreshTokens` + `scripts/purge-tokens.ts` |
| `establishSession` / `clearSessionCookies` (`lib/session.ts`) | `src/lib/auth/establish-session.ts` (`establishSession`, `endSession`, `clearSessionCookies`) |
| Cookies `JWT`/`REFRESH`: `httpOnly`, `lax`, `secure` em prod, `path: "/"` | `voacraque.session`/`voacraque.refresh` com os mesmos atributos + `__Host-` (D11) |
| `requireAuth` (verifica, `getUserById`, popula `req.user`) | `getCurrentUser()` + guardas `requireUser/requireAdmin/requireSuperadmin/page*` (já existiam) |
| `POST /auth/refresh` com `refreshLimiter` (30 / 15 min) | `POST /api/auth/refresh` com `refreshLimiter` igual |
| Proxy do front renova quando o JWT expirou, sem validar assinatura (o segredo é da API) | Proxy renova quando o access expirou ou está a < 60 s, **validando** a assinatura (o segredo mora no mesmo processo) |
| `apiClient.client.ts`: retry após 401 | Não necessário: o proxy cobre `/api/*` (D7) |
| Troca de senha: revoga tudo e reabre a sessão do aparelho atual | Igual |
| Redefinição por e-mail: revoga tudo, não abre sessão, não mexe em cookie | Igual |
| Eventos `refresh_token_reuse`, `refresh_token_grace_reuse` | Os mesmos, mais `refresh_token_revoked_use` (D4) |
| Google via `passport-google-oidc`, `session: false`, `cookie-session` só para o state | `arctic` (PKCE + state), state num cookie JWT assinado de 10 min |
| Aceita `Authorization: Bearer` | Não adotado (não há cliente fora do navegador) |

---

## 5. Estado atual (para você se orientar)

- `src/auth.ts`: Auth.js (Credentials + Google). O cookie dele (JWE) carrega um `sid` opaco que aponta
  para uma linha em `SessionToken`.
- `src/lib/auth/session-store.ts` + `token-state.ts`: famílias, rotação em dois tempos (pendente →
  confirmado), graça de 60 s, reuso. `session-cookie.ts`: cifra/decifra o JWE do Auth.js.
- `src/proxy.ts`: guarda de rota + rotação do `sid`.
- `src/lib/session.ts`: `getCurrentUser()` (consulta `SessionToken` + usuário) e as guardas.
- `src/actions/auth.ts`: `loginAction`, `registerAction`, `googleSignInAction`, `logoutAction`
  (chamam `signIn`/`signOut` do Auth.js). `src/actions/password.ts`: troca/pedido/redefinição de senha.
- `src/lib/auth/google.ts`: regras do login Google — **as regras ficam**, só muda quem chama.
- Next 16: o middleware se chama `proxy` e roda no runtime Node (ele já usa Prisma hoje).
- Comportamento do Next confirmado no código-fonte (`node_modules/next/dist`):
  - cookies gravados pelo proxy são mesclados no `cookies()` do render **e** dos route handlers da
    mesma requisição (`mergeMiddlewareCookies` em `server/async-storage/request-store.js`);
  - o `Set-Cookie` do proxy é aplicado à resposta **antes** do handler; quando uma Server Action
    grava cookie, o `res.setHeader('Set-Cookie', ...)` da action **substitui** o do proxy. Com refresh
    rotativo isso importa: se o proxy rotacionou e a action gravou outro cookie qualquer, o navegador
    fica com o refresh velho (já `ROTATED`) e a próxima renovação vira reuso. Por isso (a) o proxy não
    renova em POST de rota só-de-deslogado e (b) toda action que grava cookie deixa os dois cookies de
    sessão coerentes sozinha (ver [Armadilhas](#8-armadilhas-conhecidas)).
- `.env`: `AUTH_SECRET` está **vazio** no `.env` local (o compose de dev injeta um padrão). O código
  novo exige `AUTH_SECRET` com pelo menos 32 caracteres (ver Fase 0).

---

## 6. Mapa de arquivos

**Criar**

| Arquivo | Conteúdo |
| :-- | :-- |
| `src/lib/auth/tokens.ts` | Puro. Access JWT e state do OAuth; `needsRefresh` |
| `src/lib/auth/refresh-token-state.ts` | Puro. Gera/hasheia o refresh, prazo, janela de graça, `classifyRefreshToken` |
| `src/lib/auth/refresh-tokens.ts` | Prisma. `issueRefreshToken`, `rotateRefreshToken`, revogações, `isSessionAlive`, purga |
| `src/lib/auth/session-cookies.ts` | Puro. `CookieWrite`, `buildSessionCookies`, `expiredSessionCookies` |
| `src/lib/auth/establish-session.ts` | `establishSession`, `endSession`, `clearSessionCookies` (usam `cookies()`; só actions e route handlers) |
| `src/lib/auth/google-oauth-state.ts` | Puro. `GOOGLE_SCOPES`, `googleRedirectUri`, `readGoogleIdClaims` |
| `src/lib/auth/google-oauth.ts` | `arctic` + cookies. `startGoogleSignIn`, `finishGoogleSignIn` |
| `src/app/api/auth/callback/google/route.ts` | `GET`: fecha o handshake e abre a sessão |
| `src/app/api/auth/refresh/route.ts` | `POST`: renovação explícita |
| `prisma/migrations/20260930000000_refresh_tokens/migration.sql` | Dropa `SessionToken`, cria enum + `RefreshToken` |
| `tests/auth-tokens.test.ts` | Access, state do OAuth, cookies |
| `tests/refresh-token-state.test.ts` | Classificação do refresh e utilitários puros |
| `tests/google-oauth.test.ts` | Partes puras do Google |
| `docs/arquitetura-sessao-jwt.md` | Documentação da arquitetura nova |

**Modificar**: `prisma/schema.prisma`, `package.json`/`package-lock.json`, `src/lib/auth/config.ts`,
`src/lib/auth/google.ts`, `src/lib/auth/password-reset.ts`, `src/lib/auth/routes.ts` (só comentário),
`src/lib/session.ts`, `src/lib/security-log.ts`, `src/lib/rate-limit.ts`, `src/actions/auth.ts`,
`src/actions/password.ts`, `src/proxy.ts`, `src/app/login/page.tsx`, `tests/auth-support.test.ts`,
`docker/entrypoint.sh`, `.env.example`, `docker-compose.yml`, `docker-compose.dev.yml`, `README.md`,
`docs/arquitetura-modulo-autenticacao.md` (só um aviso no topo), `docs/arquitetura-infraestrutura-aws.md`
(comando da purga).

**Renomear**: `scripts/purge-sessions.ts` → `scripts/purge-tokens.ts` (use `git mv`).

**Apagar**: `src/auth.ts`, `src/app/api/auth/[...nextauth]/` (pasta inteira), `src/types/next-auth.d.ts`
(e a pasta `src/types` se ficar vazia), `src/lib/auth/session-cookie.ts`, `src/lib/auth/session-store.ts`,
`src/lib/auth/token-state.ts`, `tests/auth-session.test.ts`.

---

## 7. Fases

### Fase 0 — Preparação

1. `git status` — deve haver só `?? docs/jornada-autenticacao-ate-inscricao.md` (e este plano). Se
   houver outras mudanças não commitadas, pare e pergunte.
2. Confirme a branch atual (`dev/gbrlmzl`). Não troque de branch.
3. Banco de dev: `docker ps --filter name=voacraque-db-dev`. Se não estiver rodando, suba **só o
   banco**: `docker compose -f docker-compose.dev.yml up -d db`. O `DATABASE_URL` do `.env` aponta para ele.
4. Veja se a porta 3000 está ocupada pelo container `voacraque-app-dev`. Se estiver, **pergunte** ao
   usuário antes de pará-lo (o preview usa `npm run dev` na 3000, via `.claude/launch.json`).
5. `AUTH_SECRET`: verifique **sem imprimir o valor** se ele tem ≥ 32 caracteres no `.env`
   (ex.: `node -e "require('dotenv').config({ quiet: true }); console.log((process.env.AUTH_SECRET||'').length)"`).
   Se for menor, gere um valor aleatório (`node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"`)
   e grave em `AUTH_SECRET=` no `.env` (arquivo local, ignorado pelo git). Registre no relatório que
   fez isso, sem o valor.
6. Confirme que nenhuma rota fora da autenticação grava cookie:
   `git grep -nE "cookies\(\)\)?\.set|\.cookies\.set|cookies\(\)\)?\.delete" -- src` — hoje só deve
   aparecer o proxy. Se aparecer outra coisa, anote para o relatório.
7. Baseline: `npm run typecheck` e `npm test` devem passar antes de começar. Se não passarem, pare e reporte.

### Fase 1 — Dependências, schema e migration

1. Dependências:
   ```bash
   npm uninstall next-auth
   npm install jose@^6.2.12 arctic@^3.7.0
   ```
   `jose` hoje só existe como dependência transitiva do `next-auth`; precisa virar direta. Confira as
   APIs instaladas lendo os `.d.ts` antes de usar: `node_modules/arctic/dist/providers/google.d.ts`
   (esperado: `new Google(clientId, clientSecret, redirectURI)`,
   `createAuthorizationURL(state, codeVerifier, scopes): URL`,
   `validateAuthorizationCode(code, codeVerifier): Promise<OAuth2Tokens>`), `node_modules/arctic/dist/index.d.ts`
   (`generateState`, `generateCodeVerifier`, `decodeIdToken`) e, em `jose`, a opção `currentDate` de `jwtVerify`.
2. `prisma/schema.prisma`:
   - em `User`, troque `sessionTokens SessionToken[]` por `refreshTokens RefreshToken[]`;
   - substitua o `model SessionToken` inteiro (e o comentário acima dele) por:
     ```prisma
     // Refresh token opaco e rotativo, agrupado por familia (uma por login em um
     // aparelho). So o hash SHA-256 fica aqui: um dump do banco nao devolve sessao
     // a ninguem. Linhas revogadas ficam de proposito: sao elas que permitem
     // reconhecer o reuso de um token roubado (ver src/lib/auth/refresh-tokens.ts).
     enum RefreshTokenRevokeReason {
       ROTATED
       LOGOUT
       PASSWORD_CHANGED
       PASSWORD_RESET
       GOOGLE_LINKED
       REUSE_DETECTED
     }

     model RefreshToken {
       id            String                    @id @default(cuid())
       userId        String
       familyId      String
       tokenHash     String                    @unique
       expiresAt     DateTime
       revokedAt     DateTime?
       // So ROTATED pode ser lido como reuso; os outros motivos sao sessao encerrada.
       revokedReason RefreshTokenRevokeReason?
       createdAt     DateTime                  @default(now())

       user User @relation(fields: [userId], references: [id], onDelete: Cascade)

       @@index([userId])
       @@index([familyId])
       @@index([expiresAt])
     }
     ```
3. Gere a migration a partir do schema commitado (não precisa de shadow database):
   ```bash
   mkdir -p prisma/migrations/20260930000000_refresh_tokens
   ANTES="$(mktemp)"   # arquivo temporário fora do repo
   git show HEAD:prisma/schema.prisma > "$ANTES"
   npx prisma migrate diff --from-schema "$ANTES" --to-schema prisma/schema.prisma --script > prisma/migrations/20260930000000_refresh_tokens/migration.sql
   rm "$ANTES"
   ```
   Remova do arquivo gerado qualquer linha que não seja SQL (o Prisma pode imprimir avisos do dotenv
   no stdout). O resultado esperado, já conferido com o Prisma 7.10 deste projeto, é:
   ```sql
   -- CreateEnum
   CREATE TYPE "RefreshTokenRevokeReason" AS ENUM ('ROTATED', 'LOGOUT', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'GOOGLE_LINKED', 'REUSE_DETECTED');

   -- DropForeignKey
   ALTER TABLE "SessionToken" DROP CONSTRAINT "SessionToken_userId_fkey";

   -- DropTable
   DROP TABLE "SessionToken";

   -- CreateTable
   CREATE TABLE "RefreshToken" (
       "id" TEXT NOT NULL,
       "userId" TEXT NOT NULL,
       "familyId" TEXT NOT NULL,
       "tokenHash" TEXT NOT NULL,
       "expiresAt" TIMESTAMP(3) NOT NULL,
       "revokedAt" TIMESTAMP(3),
       "revokedReason" "RefreshTokenRevokeReason",
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

       CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
   );

   -- CreateIndex
   CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

   -- CreateIndex
   CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

   -- CreateIndex
   CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

   -- CreateIndex
   CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

   -- AddForeignKey
   ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   ```
4. Aplique e confira que não sobrou diferença:
   ```bash
   npx prisma migrate deploy
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
   npm run db:generate
   ```
   O último `migrate diff` precisa sair com código **0**. Código 2 = migration e schema divergem:
   corrija a migration (nunca o banco na mão).

**Checkpoint 1:** migration aplicada, diff vazio, client gerado. O typecheck vai falhar agora (código
ainda usa `sessionToken`/`next-auth`); é esperado.

### Fase 2 — Núcleo puro + testes

#### 2.1 `src/lib/auth/config.ts` (reescrever)

Mantenha `useSecureCookies()`/`SECURE_COOKIES` e `isGoogleAuthEnabled()` como estão. Remova
`SESSION_IDLE_TTL_S`, `SESSION_ROTATE_AFTER_S`, `SESSION_GRACE_S`, `SESSION_COOKIE_NAME`,
`SESSION_COOKIE_OPTIONS`. Adicione:

```ts
/** Vida do cookie de sessao (access token). Tambem e o Max-Age do cookie. */
export const ACCESS_TOKEN_TTL_S = 15 * 60;

/** Vida do refresh token. Cada rotacao cria o sucessor com o prazo cheio. */
export const REFRESH_TOKEN_TTL_S = 7 * 24 * 60 * 60;

/**
 * Por quanto tempo, depois de rotacionado, um refresh ainda e aceito de novo em
 * vez de ser lido como roubo: requisicoes paralelas (abas, fetch do cliente)
 * saem com o mesmo token antes de qualquer uma ver o Set-Cookie das outras.
 * Mesmo valor da referencia (e do OAuth 2.0 Security BCP para clientes concorrentes).
 */
export const REFRESH_GRACE_S = 10;

/**
 * Linhas revogadas ou expiradas ficam este tempo antes da purga: enquanto
 * existirem, reconhecem o reuso de um token roubado.
 */
export const REFRESH_TOKEN_RETENTION_DAYS = 30;

/**
 * O proxy renova quando falta menos que isto para o access expirar: uma Server
 * Action com upload passa pelo proxy no inicio e so le o access no fim.
 */
export const ACCESS_REFRESH_MARGIN_S = 60;

/** Janela do handshake com o Google (state + PKCE). */
export const OAUTH_STATE_TTL_S = 10 * 60;

// __Host- exige Secure, Path=/ e nenhum Domain: um subdominio nao consegue
// plantar o cookie. Em http (dev local) o navegador recusaria o prefixo.
const COOKIE_PREFIX = SECURE_COOKIES ? "__Host-" : "";
export const ACCESS_COOKIE_NAME = `${COOKIE_PREFIX}voacraque.session`;
export const REFRESH_COOKIE_NAME = `${COOKIE_PREFIX}voacraque.refresh`;
export const OAUTH_COOKIE_NAME = `${COOKIE_PREFIX}voacraque.oauth`;

export const COOKIE_BASE_OPTIONS = {
  httpOnly: true,
  // lax, nao strict: o retorno do Google chega por navegacao de topo vinda de
  // outro site, e com strict o navegador descartaria os cookies.
  sameSite: "lax" as const,
  path: "/",
  secure: SECURE_COOKIES,
};
```

Atualize o comentário do topo do arquivo (hoje fala de Auth.js).

#### 2.2 `src/lib/auth/tokens.ts` (novo — use este código como base)

```ts
import { hkdfSync } from "node:crypto";
import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { ACCESS_REFRESH_MARGIN_S, ACCESS_TOKEN_TTL_S, OAUTH_STATE_TTL_S } from "@/lib/auth/config";

/**
 * Emissao e verificacao dos JWT: o access token (cookie de sessao) e o state do
 * handshake com o Google. Puro (sem Prisma nem next/headers): o proxy, as
 * actions, os route handlers e os testes usam o mesmo codigo. O refresh token
 * nao e JWT: e opaco e mora no banco (ver refresh-tokens.ts).
 *
 * HS256 assinado, nao cifrado: o claim (id do usuario) nao e segredo e o cookie
 * e httpOnly. `iss` e `aud` sao exigidos na verificacao, e cada finalidade tem a
 * propria chave derivada do AUTH_SECRET.
 */

const ISSUER = "voacraque";
const MIN_SECRET_LENGTH = 32;

type Purpose = "access" | "oauth";

const AUDIENCE: Record<Purpose, string> = {
  access: "voacraque:access",
  oauth: "voacraque:oauth",
};

/** Assina com AUTH_SECRET; verifica com ele e com AUTH_SECRET_1..3 (segredos antigos durante a troca). */
function secrets(): string[] {
  const current = process.env.AUTH_SECRET ?? "";
  if (current.length < MIN_SECRET_LENGTH) {
    throw new Error(`AUTH_SECRET precisa ter pelo menos ${MIN_SECRET_LENGTH} caracteres.`);
  }
  const previous = [1, 2, 3]
    .map((i) => process.env[`AUTH_SECRET_${i}`])
    .filter((secret): secret is string => Boolean(secret));
  return [current, ...previous];
}

function keyFor(secret: string, purpose: Purpose): Uint8Array {
  return new Uint8Array(hkdfSync("sha256", secret, ISSUER, `voacraque ${purpose} token`, 32));
}

const epochSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

async function sign(purpose: Purpose, subject: string, claims: JWTPayload, ttlS: number, now: Date): Promise<string> {
  const issuedAt = epochSeconds(now);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE[purpose])
    .setSubject(subject)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlS)
    .sign(keyFor(secrets()[0], purpose));
}

async function verify(purpose: Purpose, token: string | undefined, now: Date): Promise<JWTPayload | null> {
  if (!token) return null;
  for (const secret of secrets()) {
    try {
      const { payload } = await jwtVerify(token, keyFor(secret, purpose), {
        algorithms: ["HS256"],
        issuer: ISSUER,
        audience: AUDIENCE[purpose],
        currentDate: now,
      });
      return payload;
    } catch {
      // Outro segredo, expirado, adulterado ou lixo: tenta o proximo segredo.
    }
  }
  return null;
}

/** sub: id do usuario; exp: epoch em segundos. */
export type AccessClaims = { sub: string; exp: number };

export function signAccessToken(userId: string, now = new Date()): Promise<string> {
  return sign("access", userId, {}, ACCESS_TOKEN_TTL_S, now);
}

export async function verifyAccessToken(token: string | undefined, now = new Date()): Promise<AccessClaims | null> {
  const payload = await verify("access", token, now);
  if (!payload || typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
  return { sub: payload.sub, exp: payload.exp };
}

/** Sem access valido, ou com menos de ACCESS_REFRESH_MARGIN_S de vida: hora de renovar. */
export function needsRefresh(access: AccessClaims | null, now = new Date()): boolean {
  return access === null || access.exp - epochSeconds(now) < ACCESS_REFRESH_MARGIN_S;
}

/** O que o navegador guarda entre a ida ao Google e a volta. */
export type OAuthState = { state: string; codeVerifier: string; next: string };

export function signOAuthState(value: OAuthState, now = new Date()): Promise<string> {
  return sign("oauth", "google", { ...value }, OAUTH_STATE_TTL_S, now);
}

export async function verifyOAuthState(token: string | undefined, now = new Date()): Promise<OAuthState | null> {
  const payload = await verify("oauth", token, now);
  if (
    !payload ||
    typeof payload.state !== "string" ||
    typeof payload.codeVerifier !== "string" ||
    typeof payload.next !== "string"
  ) {
    return null;
  }
  return { state: payload.state, codeVerifier: payload.codeVerifier, next: payload.next };
}
```

#### 2.3 `src/lib/auth/refresh-token-state.ts` (novo — use este código como base)

```ts
import { createHash, randomBytes } from "node:crypto";
import type { RefreshTokenRevokeReason } from "@/generated/prisma/client";
import { REFRESH_GRACE_S, REFRESH_TOKEN_RETENTION_DAYS, REFRESH_TOKEN_TTL_S } from "@/lib/auth/config";

/**
 * Parte pura do refresh token: nada de Prisma em runtime (o import acima e so de
 * tipo), para os testes rodarem sem banco.
 */

/** 40 bytes aleatorios em hex, como na referencia: opaco, sem claim nenhum. */
export const newRawRefreshToken = (): string => randomBytes(40).toString("hex");

/** SHA-256, nao bcrypt: o valor ja e aleatorio de alta entropia. So o hash vai para o banco. */
export function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export const refreshExpiresAt = (now: Date): Date => new Date(now.getTime() + REFRESH_TOKEN_TTL_S * 1000);

export const purgeCutoff = (now: Date): Date =>
  new Date(now.getTime() - REFRESH_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000);

/**
 * - active:  vivo e dentro do prazo
 * - grace:   aposentado por rotacao ha no maximo REFRESH_GRACE_S e a familia tem
 *            token vivo: requisicao concorrente, nao ataque
 * - reused:  aposentado por rotacao fora da graca (ou sem sucessor vivo): alguem
 *            guardou uma copia. Roubo confirmado
 * - revoked: revogado por logout, troca/redefinicao de senha, vinculo do Google
 *            ou reuso ja detectado: sessao encerrada, sem alarme
 * - expired: passou do prazo
 * - unknown: nao existe (lixo, ou linha ja purgada)
 */
export type RefreshTokenState = "active" | "grace" | "reused" | "revoked" | "expired" | "unknown";

export type RefreshTokenRow = {
  revokedAt: Date | null;
  revokedReason: RefreshTokenRevokeReason | null;
  expiresAt: Date;
};

export function withinGrace(revokedAt: Date, now: Date): boolean {
  return now.getTime() - revokedAt.getTime() <= REFRESH_GRACE_S * 1000;
}

/**
 * Graca so para quem foi aposentado por rotacao, e so se a familia tem sucessor
 * vivo: rotacao legitima deixa um; revogacao em massa nao deixa nenhum. Tempo
 * sozinho ressuscitaria por alguns segundos exatamente as sessoes que logout e
 * troca de senha existem para matar.
 */
export function classifyRefreshToken(
  row: RefreshTokenRow | null,
  hasLiveSuccessor: boolean,
  now: Date,
): RefreshTokenState {
  if (!row) return "unknown";
  if (row.revokedAt && row.revokedReason !== "ROTATED") return "revoked";
  if (row.revokedAt && !(withinGrace(row.revokedAt, now) && hasLiveSuccessor)) return "reused";
  if (row.expiresAt <= now) return "expired";
  return row.revokedAt ? "grace" : "active";
}
```

#### 2.4 `src/lib/auth/session-cookies.ts` (novo)

- `export type CookieWrite = { name: string; value: string; options: typeof COOKIE_BASE_OPTIONS & { maxAge: number } }`.
- `buildSessionCookies({ userId, refreshToken }: { userId: string; refreshToken: string }, now = new Date()): Promise<CookieWrite[]>`
  — assina o access (`signAccessToken(userId, now)`) e devolve
  `[access (maxAge ACCESS_TOKEN_TTL_S), refresh = valor opaco (maxAge REFRESH_TOKEN_TTL_S)]`.
- `expiredSessionCookies(): CookieWrite[]` — os dois nomes com `value: ""` e `maxAge: 0`, **com os
  mesmos atributos** (`COOKIE_BASE_OPTIONS`): um cookie `__Host-` só é apagado com `secure` e `path: "/"`.
- Comentário: mesmo formato serve ao proxy (`NextResponse.cookies.set`) e às actions (`cookies().set`).

#### 2.5 `src/lib/auth/google-oauth-state.ts` (novo, puro)

```ts
import type { GoogleProfile } from "@/lib/auth/google"; // import type: nao carrega Prisma

export const GOOGLE_SCOPES = ["openid", "email", "profile"];
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
```
- `googleRedirectUri(): string` — `new URL("/api/auth/callback/google", process.env.AUTH_URL ?? process.env.NEXTAUTH_URL).toString()`;
  sem nenhuma das duas, lança erro (mesma regra de `buildPasswordResetUrl`: nunca do header `Host`).
- `readGoogleIdClaims(claims: Record<string, unknown>, clientId: string): { providerAccountId: string; profile: GoogleProfile } | null`
  — exige `iss` em `GOOGLE_ISSUERS`, `aud === clientId`, `sub` string não vazia; monta `profile` com
  `email`, `email_verified`, `name`, `picture` (tipos checados; ausentes viram `null`). Comentário: o
  id_token chega direto do endpoint de token do Google, por TLS, em troca do `code` + client secret,
  então a assinatura pode ser dispensada (OIDC Core 3.1.3.7); `iss`/`aud` são conferidos mesmo assim.

#### 2.6 Testes

Apague `tests/auth-session.test.ts`. Em todos os testes novos: `vi.stubEnv` para `AUTH_SECRET`/`AUTH_SECRET_1`
com `afterEach(() => vi.unstubAllEnvs())`, segredo de teste com ≥ 32 caracteres,
`NOW = new Date("2026-09-30T12:00:00Z")` e o parâmetro `now` das funções.

`tests/auth-tokens.test.ts`:
1. Constantes: `ACCESS_TOKEN_TTL_S === 900`, `REFRESH_TOKEN_TTL_S === 604800`, `REFRESH_GRACE_S === 10`,
   `ACCESS_REFRESH_MARGIN_S === 60`. *(Também pegam uma alteração temporária da Fase 7 não desfeita.)*
2. Access: ida e volta devolve `sub` certo e `exp === epoch(NOW) + 900`; é JWS compacto (3 partes).
3. Expiração: verificado em `NOW + 899 s` vale; em `NOW + 900 s` é `null`.
4. Access não verifica como state do OAuth, e state não verifica como access.
5. Adulteração: trocar o `sub` no payload (re-encodar a parte do meio em base64url, mantendo a assinatura) → `null`.
6. Header `{"alg":"none"}` com assinatura vazia → `null`.
7. Outro segredo → `null`. Rotação: token assinado com A; com `AUTH_SECRET=B` e `AUTH_SECRET_1=A` → válido;
   tokens novos saem assinados com B (não validam só com A).
8. `AUTH_SECRET` curto ou ausente → `signAccessToken` rejeita com erro.
9. `undefined`, `""`, `"lixo"` → `null`, nunca exceção.
10. `needsRefresh`: `null` → `true`; `exp - now = 61` → `false`; `exp - now = 59` → `true`.
11. `buildSessionCookies`: nomes `voacraque.session`/`voacraque.refresh` (sem `AUTH_URL` https o prefixo é
    vazio), `maxAge` 900 / 604800, `httpOnly: true`, `sameSite: "lax"`, `path: "/"`; o valor do access
    verifica e o do refresh é o opaco recebido. `expiredSessionCookies`: dois cookies, `value: ""`, `maxAge: 0`.
12. **D2 em produção:** com `vi.stubEnv("AUTH_URL", "https://voacraque.app")`, `vi.resetModules()` e
    `await import("@/lib/auth/config")` (e `session-cookies`): `COOKIE_BASE_OPTIONS.secure === true` e os três
    nomes começam com `__Host-`. Com `AUTH_URL=http://localhost:3000`: `secure === false`, sem prefixo.
13. OAuth state: ida e volta; expirado depois de 10 min.

`tests/refresh-token-state.test.ts`:
1. `newRawRefreshToken()`: 80 caracteres hex; duas chamadas diferem.
2. `hashRefreshToken`: determinístico, hex de 64, diferente do valor puro; valores diferentes → hashes diferentes.
3. `refreshExpiresAt(NOW)` = NOW + 7 dias; `purgeCutoff(NOW)` = NOW − 30 dias.
4. `classifyRefreshToken`:
   - `null` → `unknown`; vivo no prazo → `active`; vivo com `expiresAt === NOW` → `expired`;
   - `ROTATED` há 5 s com sucessor vivo → `grace`; há exatamente 10 s com sucessor → `grace`;
     há 11 s com sucessor → `reused`; há 5 s **sem** sucessor → `reused`;
   - `ROTATED` dentro da graça mas já expirado → `expired`;
   - `LOGOUT`, `PASSWORD_CHANGED`, `PASSWORD_RESET`, `GOOGLE_LINKED`, `REUSE_DETECTED` (mesmo há 1 s e com
     sucessor vivo) → `revoked`, nunca `grace` nem `reused`.

`tests/google-oauth.test.ts`:
- `googleRedirectUri` com `AUTH_URL=https://voacraque.app/` → `https://voacraque.app/api/auth/callback/google`;
  sem `AUTH_URL` e `NEXTAUTH_URL` → lança.
- `readGoogleIdClaims`: válido (os dois formatos de `iss`); `aud` errado → `null`; `iss` estranho → `null`;
  sem `sub` → `null`; `email_verified` ausente vira `null` no profile.

Em `tests/auth-support.test.ts`, no `classifyPath`, adicione `["/api/auth/refresh", "auth-endpoint"]`.

**Checkpoint 2:** `npx vitest run tests/auth-tokens.test.ts tests/refresh-token-state.test.ts tests/google-oauth.test.ts tests/auth-support.test.ts` verde.

### Fase 3 — Camada de servidor

#### 3.1 `src/lib/auth/refresh-tokens.ts` (novo)

Porte de `authService.ts` da referência. Todas as funções recebem `now = new Date()` opcional.

- `issueRefreshToken(userId: string, familyId: string = randomUUID(), now = new Date()): Promise<string>`
  — cria a linha `{ userId, familyId, tokenHash: hashRefreshToken(raw), expiresAt: refreshExpiresAt(now) }`
  e devolve o valor puro (vai só para o cookie). Família nova = login novo em um aparelho.
- `hasLiveSuccessor(familyId, now)` (interna) — `findFirst({ where: { familyId, revokedAt: null, expiresAt: { gt: now } } })`.
- `rotateRefreshToken(raw: string, meta: { ip: string }, now = new Date()): Promise<{ status: "rotated"; userId: string; raw: string } | { status: "invalid" }>`:
  1. `tokenHash = hashRefreshToken(raw)`; `findUnique({ where: { tokenHash }, select: { id, userId, familyId, revokedAt, revokedReason, expiresAt, user: { select: { active: true } } } })`.
  2. Só consulte sucessor quando puder mudar a resposta:
     `successor = row?.revokedReason === "ROTATED" && row.revokedAt && withinGrace(row.revokedAt, now) ? await hasLiveSuccessor(row.familyId, now) : false`.
  3. `state = classifyRefreshToken(row, successor, now)`; `tokenHashPrefix = tokenHash.slice(0, 12)`.
  4. `unknown`/`expired` → `invalid` (sem log: é rotina).
  5. `revoked` → `logSecurityEvent("refresh_token_revoked_use", { userId, familyId, reason: row.revokedReason, tokenHashPrefix, ip })` → `invalid`.
  6. `reused` → revoga a família (`updateMany where { familyId, revokedAt: null }` com `revokedAt: now, revokedReason: "REUSE_DETECTED"`),
     `logSecurityEvent("refresh_token_reuse", { userId, familyId, tokenHashPrefix, ip })` → `invalid`.
  7. `grace` → `logSecurityEvent("refresh_token_grace_reuse", { userId, familyId, tokenHashPrefix, ip })` e segue.
  8. Usuário desativado (`!row.user.active`) → `invalid` **sem mexer em nada** (conferido antes de revogar;
     revogar aqui deixaria a família sem sucessor e a próxima tentativa viraria "reuso").
  9. Emite o sucessor na mesma família. Se o estado era `active`, na mesma `$transaction`:
     `updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: now, revokedReason: "ROTATED" } })`
     + `create` do sucessor. O `revokedAt: null` no `where` é de propósito: **nunca reescreva `revokedAt`**
     de um token já rotacionado, senão a janela de graça andaria para frente a cada reapresentação e um
     token roubado viveria para sempre (comentário da referência). Se o estado era `grace`, só o `create`.
  10. `{ status: "rotated", userId: row.userId, raw: sucessor }`.
- `revokeRefreshFamily(raw: string, reason: RefreshTokenRevokeReason, now = new Date()): Promise<void>` —
  acha a linha pelo hash; revoga `where { familyId, revokedAt: null }`. Sem linha, não faz nada.
- `revokeAllUserRefreshTokens(userId: string, reason: RefreshTokenRevokeReason, now = new Date()): Promise<void>` —
  `updateMany where { userId, revokedAt: null }`.
- `isSessionAlive(access: AccessClaims, refreshRaw: string | undefined): Promise<boolean>` — usado **só**
  pelo proxy em GET de rota só-de-deslogado: usuário existe e `active`; e, se houver `refreshRaw`, o
  estado dele é `active` ou `grace`. (Sem isso, depois de uma redefinição de senha ou desativação, um
  access ainda válido faria `/login` mandar para `/` e a página mandar de volta para `/login`.)
- `purgeExpiredRefreshTokens(now = new Date()): Promise<number>` —
  `deleteMany({ where: { OR: [{ expiresAt: { lt: purgeCutoff(now) } }, { revokedAt: { lt: purgeCutoff(now) } }] } })`.

#### 3.2 `src/lib/auth/establish-session.ts` (novo)

```ts
/**
 * So em Server Action e Route Handler: num Server Component o Next lanca em
 * cookies().set.
 */

/** Login, cadastro, Google e troca de senha: familia nova de refresh + access novo. */
export async function establishSession(userId: string): Promise<void>
// issueRefreshToken(userId) -> buildSessionCookies({ userId, refreshToken }) -> jar.set(...) para cada um

/** Logout: revoga a familia do refresh deste navegador (LOGOUT) e apaga os dois cookies. */
export async function endSession(): Promise<void>
// le REFRESH_COOKIE_NAME de cookies() (ja traz o valor rotacionado pelo proxy nesta requisicao, se houve)

/** So apaga os cookies deste navegador, sem revogar nada. */
export async function clearSessionCookies(): Promise<void>
```

#### 3.3 `src/lib/session.ts` — `getCurrentUser()`

- Troque a leitura: `verifyAccessToken((await cookies()).get(ACCESS_COOKIE_NAME)?.value)`; `null` → `null`.
- Consulta `prisma.user.findUnique({ where: { id: claims.sub }, select: { ...os campos de hoje, active: true } })`
  (hoje o `select` do usuário está dentro de `sessionToken.findUnique`; traga os mesmos campos).
- Recusa se `!user || !user.active`.
- Remova imports de `session-cookie`, `session-store`, `SESSION_COOKIE_NAME`.
- Reescreva o comentário do topo: autoridade = access JWT válido + usuário ativo; uma consulta por
  requisição (o `cache` deduplica); **não** consulta refresh token (o access é stateless, D9); só lê,
  quem grava cookie é o proxy, as actions e os route handlers de `/api/auth/*`.
- O resto do arquivo (guardas, `getSessionPromise`, `getSystemSettings`) não muda.

#### 3.4 `src/lib/auth/google.ts`

- `linkGoogleAccount`: troque o item `prisma.sessionToken.updateMany(...)` do `$transaction` por
  `prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now, revokedReason: "GOOGLE_LINKED" } })`
  (mesma condição `dropUnverifiedPassword`). Ajuste o comentário se citar a tabela antiga.
- `userIdForGoogleAccount` fica como está.
- Atualize o comentário de `signInWithGoogle`: quem chama agora é
  `src/app/api/auth/callback/google/route.ts` (não mais o callback `signIn` do Auth.js).

#### 3.5 `src/lib/auth/password-reset.ts`

Em `resetPasswordWithToken`, dentro da transação, troque `tx.sessionToken.updateMany(...)` por
`tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now, revokedReason: "PASSWORD_RESET" } })`.

#### 3.6 `src/lib/auth/google-oauth.ts` (novo)

```ts
import { cookies } from "next/headers";
import { decodeIdToken, generateCodeVerifier, generateState, Google } from "arctic";
```
- `googleClient()` → `new Google(process.env.AUTH_GOOGLE_ID!, process.env.AUTH_GOOGLE_SECRET!, googleRedirectUri())`
  (só chamado quando `isGoogleAuthEnabled()`).
- `startGoogleSignIn(next: string): Promise<URL>` — `generateState()`, `generateCodeVerifier()`,
  `createAuthorizationURL(state, codeVerifier, GOOGLE_SCOPES)`, `url.searchParams.set("prompt", "select_account")`;
  grava `OAUTH_COOKIE_NAME = await signOAuthState({ state, codeVerifier, next })` com
  `{ ...COOKIE_BASE_OPTIONS, maxAge: OAUTH_STATE_TTL_S }`; devolve a URL.
- `finishGoogleSignIn(params: URLSearchParams, stateCookie: string | undefined)` devolve
  `{ ok: true; providerAccountId; profile; next } | { ok: false; error: "AccessDenied" | "OAuthCallback" }`:
  1. `params.get("error")` presente (pessoa cancelou no Google) → `AccessDenied`.
  2. `code`/`state` ausentes, cookie ausente/inválido, ou `saved.state !== state` →
     `logSecurityEvent("google_login_denied", { reason: "state_mismatch" })`, `OAuthCallback`.
  3. `validateAuthorizationCode(code, saved.codeVerifier)` e `tokens.idToken()` num `try`; erro →
     `console.error("[auth] troca do code do Google falhou", error)`, `OAuthCallback`.
  4. `readGoogleIdClaims(decodeIdToken(idToken) as Record<string, unknown>, process.env.AUTH_GOOGLE_ID!)`;
     `null` → `logSecurityEvent("google_login_denied", { reason: "invalid_id_token" })`, `OAuthCallback`.
  5. `{ ok: true, providerAccountId, profile, next: saved.next }`.

#### 3.7 `src/lib/security-log.ts` e `src/lib/rate-limit.ts`

- `SecurityEvent`: troque `session_token_reuse`/`session_token_grace_reuse` por:
  ```ts
  /** Roubo confirmado: um refresh ja rotacionado voltou fora da janela de graca. A familia inteira cai. */
  | "refresh_token_reuse"
  /** Concorrencia normal (abas, fetch em paralelo). Nao alerta; volume anormal denuncia bug de renovacao. */
  | "refresh_token_grace_reuse"
  /**
   * Refresh revogado por logout, troca/redefinicao de senha, vinculo do Google ou
   * reuso ja detectado voltou a aparecer. `reason` = motivo da revogacao. Nao e
   * alarme: o caso comum e um aparelho que ficou com o token antigo.
   */
  | "refresh_token_revoked_use"
  ```
  e documente os `reason` novos de `google_login_denied` (`state_mismatch`, `invalid_id_token`).
- `rate-limit.ts`: adicione, com comentário no estilo dos outros,
  `export const refreshLimiter = createRateLimiter({ name: "refresh", max: 30, windowMs: 15 * 60_000 });`
  (só para o endpoint explícito; a renovação no proxy exige um token opaco de 320 bits, não é
  superfície de força bruta).

**Checkpoint 3:** `npx tsc --noEmit` pode falhar só nos arquivos das Fases 4 e 5 (`src/auth.ts`,
actions, proxy). Nenhum erro nos arquivos desta fase.

### Fase 4 — Actions e route handlers

#### 4.1 Apagar o Auth.js

Apague `src/auth.ts`, a pasta `src/app/api/auth/[...nextauth]/`, `src/types/next-auth.d.ts` (e
`src/types/` se vazia), `src/lib/auth/session-cookie.ts`, `src/lib/auth/session-store.ts`,
`src/lib/auth/token-state.ts`.

#### 4.2 `src/actions/auth.ts`

Sem imports de `next-auth` nem `@/auth`. **Nunca** coloque `redirect()` dentro de `try/catch` (ele lança
de propósito).

- `loginAction`: valida `credentialsSchema` → `ip = clientIp(await headers())` →
  `loginLimiter.retryAfter(ip) > 0` → `{ message: "Muitas tentativas de login. Espere alguns minutos e tente de novo." }` →
  `verifyCredentials(...)`; `null` → `loginLimiter.hit(ip)` e `{ message: "Usuário ou senha não conferem." }` →
  `await establishSession(user.id)` → `redirect(safeNextPath(formData.get("proximo")))`.
  (O rate limit sai do `authorize` do Auth.js e mora aqui: não existe mais outro endpoint de login.)
- `registerAction`: igual até o `recordAudit`; depois `await establishSession(user.id)` e `redirect("/onboarding")`.
  Some o ramo "Conta criada. Entre com seu usuário e senha." (não há mais falha possível ali).
- `googleSignInAction(formData)`: `if (!isGoogleAuthEnabled()) return;` →
  `const url = await startGoogleSignIn(safeNextPath(formData.get("proximo")))` → `redirect(url.toString())`.
- `logoutAction`: `await endSession(); redirect("/login");`
- Reescreva o comentário de `loginAction` sobre Server Action: o `cookies().set` dentro da action faz o
  Next rerenderizar a árvore na mesma resposta, e o `UserProvider` recebe a sessão nova sem `router.refresh()`.

#### 4.3 `src/actions/password.ts`

- `changePasswordAction`: remova `cookies`, `readSessionCookie`, `SESSION_COOKIE_NAME`,
  `revokeOtherSessionFamilies` e o bloco `claims`. Depois da transação que troca a senha e invalida os
  links de redefinição:
  ```ts
  // Como na referencia: nenhuma sessao existente continua confiavel. Todas as
  // familias caem e este aparelho recebe uma familia nova. Os outros aparelhos
  // param na proxima renovacao (o access deles vive no maximo 15 min).
  await revokeAllUserRefreshTokens(user.id, "PASSWORD_CHANGED");
  await establishSession(user.id);
  ```
  Nova mensagem de sucesso: `"Senha alterada. As sessões abertas em outros aparelhos serão encerradas em até 15 minutos."`
  Atualize o docstring.
- `resetPasswordAction`: nenhuma mudança de cookie (como na referência: não abre sessão e não mexe no
  navegador; a revogação está em `resetPasswordWithToken`). Se este navegador tinha sessão do mesmo
  usuário, o `/login?senha=redefinida` aparece normalmente graças ao `isSessionAlive` do proxy.

#### 4.4 `src/app/api/auth/callback/google/route.ts` (novo)

```ts
export const dynamic = "force-dynamic";

/** Volta do Google. Uso unico do cookie de state; sucesso abre a sessao e leva ao destino. */
export async function GET(req: NextRequest) {
  const jar = await cookies();
  const stateCookie = jar.get(OAUTH_COOKIE_NAME)?.value;
  jar.set(OAUTH_COOKIE_NAME, "", { ...COOKIE_BASE_OPTIONS, maxAge: 0 });

  if (!isGoogleAuthEnabled()) redirect("/login?error=Configuration");

  const result = await finishGoogleSignIn(req.nextUrl.searchParams, stateCookie);
  if (!result.ok) redirect(`/login?error=${result.error}`);

  // Regras de vinculo/criacao de conta e de conta desativada (src/lib/auth/google.ts).
  if (!(await signInWithGoogle(result.providerAccountId, result.profile))) redirect("/login?error=AccessDenied");

  const userId = await userIdForGoogleAccount(result.providerAccountId);
  if (!userId) redirect("/login?error=AccessDenied");

  await establishSession(userId);
  redirect(result.next);
}
```
(`redirect()` num route handler responde 307 e leva junto os cookies gravados com `cookies().set`.)

#### 4.5 `src/app/api/auth/refresh/route.ts` (novo)

`POST` apenas, `dynamic = "force-dynamic"`:
1. `ip = clientIp(req.headers)`; `refreshLimiter.retryAfter(ip) > 0` → 429 JSON
   `{ error: "Muitas tentativas. Tente de novo em instantes." }` com header `Retry-After`; senão `hit(ip)`.
2. Sem cookie de refresh → 401. Com cookie → `rotateRefreshToken(raw, { ip })`.
3. `rotated` → `new NextResponse(null, { status: 204 })` com `buildSessionCookies({ userId, refreshToken: raw })`;
   `invalid` → 401 JSON `{ error: "Sessão expirada. Faça login novamente." }` com `expiredSessionCookies()`.
Comentário: o navegador não precisa chamar isto (o proxy renova quando o access expira); existe como na
referência, para clientes que não passam pelo proxy e para diagnóstico. Fica sob `/api/auth/*`, que o
proxy não toca.

#### 4.6 Ajustes menores

- `src/lib/auth/routes.ts`: comentário de `auth-endpoint` → "rotas de autenticação que gravam os
  próprios cookies (callback do Google, `/api/auth/refresh`); o proxy não mexe nelas".
- `src/app/login/page.tsx`: `authErrorMessage` perde o ramo `CredentialsSignin` e o parâmetro `code`
  (erro de senha agora volta no estado da action, não na URL). Ficam: `AccessDenied`, `Configuration`
  e o genérico (cobre `OAuthCallback`). Atualize o comentário ("O callback do Google devolve erros
  para cá como /login?error=Tipo"). Remova `code` do tipo de `searchParams`.

**Checkpoint 4:** `npm run typecheck` sem erros **exceto** em `src/proxy.ts`.

### Fase 5 — Proxy

Reescreva `src/proxy.ts`. Mantenha o `config.matcher` exatamente como está (com os comentários). Use este
código como base e reescreva o comentário do topo (papéis: guarda de rota heurística e único lugar que
renova a sessão; toca no banco só na renovação e em GET de rota só-de-deslogado):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "@/lib/auth/config";
import { isSessionAlive, rotateRefreshToken } from "@/lib/auth/refresh-tokens";
import { classifyPath, type RouteKind } from "@/lib/auth/routes";
import { buildSessionCookies, expiredSessionCookies, type CookieWrite } from "@/lib/auth/session-cookies";
import { needsRefresh, verifyAccessToken } from "@/lib/auth/tokens";
import { clientIp } from "@/lib/client-ip";

export async function proxy(req: NextRequest) {
  const route = classifyPath(req.nextUrl.pathname);
  // Callback do Google e /api/auth/refresh gravam os proprios cookies.
  if (route === "auth-endpoint") return NextResponse.next();

  const accessCookie = req.cookies.get(ACCESS_COOKIE_NAME)?.value;
  const refreshCookie = req.cookies.get(REFRESH_COOKIE_NAME)?.value;

  const access = await verifyAccessToken(accessCookie);
  let authenticated = access !== null;
  let renewed: CookieWrite[] | null = null;
  // Access que nao verifica e nenhum refresh para socorrer: sai do navegador.
  let clear = Boolean(accessCookie) && !access && !refreshCookie;

  // Como na referencia: so renova quando o access falta ou esta vencendo, nunca
  // a cada requisicao.
  if (refreshCookie && needsRefresh(access) && canRenew(req, route)) {
    try {
      const result = await rotateRefreshToken(refreshCookie, { ip: clientIp(req.headers) });
      if (result.status === "rotated") {
        // O Next repassa estes Set-Cookie ao cookies() do render, do handler e
        // da Server Action desta mesma requisicao.
        renewed = await buildSessionCookies({ userId: result.userId, refreshToken: result.raw });
        authenticated = true;
      } else {
        // Refresh expirado, desconhecido, revogado ou reusado: a sessao acabou.
        authenticated = false;
        clear = true;
      }
    } catch (error) {
      // Banco fora do ar nao desloga ninguem: segue com o que o access diz.
      console.error("[auth] falha ao renovar a sessao no proxy", error);
    }
  }

  // Um access que verifica pode pertencer a uma sessao ja encerrada (senha
  // redefinida, conta desativada). Sem esta checagem: /login manda para "/", a
  // pagina ve sessao morta e manda para /login, e o ciclo nao termina.
  if (
    authenticated &&
    !renewed &&
    access &&
    route === "guest-only" &&
    req.method === "GET" &&
    !(await isSessionAlive(access, refreshCookie))
  ) {
    authenticated = false;
    clear = true;
  }

  if (!authenticated && route === "protected-api") {
    return withSessionCookies(NextResponse.json({ error: "Faça login para continuar." }, { status: 401 }), null, clear);
  }

  if (!authenticated && route === "protected-page") {
    const url = new URL("/login", req.nextUrl);
    const next = req.nextUrl.pathname + req.nextUrl.search;
    if (next !== "/") url.searchParams.set("proximo", next);
    return withSessionCookies(NextResponse.redirect(url), null, clear);
  }

  // So GET: um POST aqui e a Server Action de login de uma aba antiga.
  if (authenticated && route === "guest-only" && req.method === "GET") {
    return withSessionCookies(NextResponse.redirect(new URL("/", req.nextUrl)), renewed, clear);
  }

  return withSessionCookies(NextResponse.next(), renewed, clear);
}

/**
 * Renova em pagina, rota de API e Server Action, menos:
 * - POST em rota so-de-deslogado: e a Server Action de login, cadastro ou Google
 *   de uma aba antiga, que nao precisa de sessao. Se ela gravar cookie (o state do
 *   Google, por exemplo), o Set-Cookie dela substitui o daqui e o navegador fica
 *   com o refresh ja rotacionado, que a proxima renovacao leria como reuso;
 * - prefetch especulativo do navegador: rotacionaria para uma resposta que
 *   talvez nunca seja usada. (Prefetch do router nem chega aqui: ver matcher.)
 */
function canRenew(req: NextRequest, route: RouteKind): boolean {
  if (route === "guest-only" && req.method !== "GET") return false;
  const purpose = `${req.headers.get("purpose") ?? ""} ${req.headers.get("sec-purpose") ?? ""}`;
  return !purpose.includes("prefetch");
}

function withSessionCookies<T extends NextResponse>(res: T, renewed: CookieWrite[] | null, clear: boolean): T {
  const writes = renewed ?? (clear ? expiredSessionCookies() : []);
  for (const { name, value, options } of writes) res.cookies.set(name, value, options);
  return res;
}
```

Não adicione `export const runtime` (o proxy precisa do runtime Node por causa do Prisma e do `node:crypto`).

**Checkpoint 5:** `npm run typecheck` e `npm test` verdes.

### Fase 6 — Limpeza e configuração

1. `git mv scripts/purge-sessions.ts scripts/purge-tokens.ts`; o script chama
   `purgeExpiredRefreshTokens()` e `purgeDeadPasswordResetTokens()` (uma falha não impede a outra,
   qualquer falha deixa `process.exitCode = 1`, como `runTokenPurge` da referência); ajuste o comentário
   (sem rotação a cada 15 min, mas cada renovação ainda cria uma linha) e o log
   (`[purge-tokens] N refresh tokens e M links de redefinicao removidos`).
2. `package.json`: script `db:purge-sessions` → `db:purge-tokens` apontando para o arquivo novo.
3. `docker/entrypoint.sh`: echo e caminho do script novo (`limpando refresh tokens e links de redefinicao expirados...`).
4. `.env.example`: reescreva o comentário do `AUTH_SECRET` (assina o JWT do cookie de sessão e o state
   do Google; mínimo 32 caracteres; `openssl rand -base64 32`; troca sem derrubar sessões: antigo em
   `AUTH_SECRET_1`, novo em `AUTH_SECRET`); remova `AUTH_TRUST_HOST`; no `AUTH_URL`, diga que ele define
   o `Secure` dos cookies, o redirect URI do Google e o link de redefinição. **Não** mexa no `.env` além
   do que a Fase 0 pediu.
5. `docker-compose.yml` e `docker-compose.dev.yml`: remova a linha `AUTH_TRUST_HOST: "true"`.
6. Varredura de sobras — o comando abaixo não pode retornar nada:
   ```bash
   git grep -nE "next-auth|from \"@/auth\"|SessionToken|sessionToken|SESSION_COOKIE_NAME|SESSION_IDLE_TTL_S|SESSION_ROTATE_AFTER_S|SESSION_GRACE_S|readSessionCookie|writeSessionCookie|session-store|token-state\"|authjs|AUTH_TRUST_HOST|purge-sessions|revokeOtherSessionFamilies|session_token_reuse|session_token_grace_reuse" -- ':!docs' ':!prisma/migrations'
   ```
   (Migrations antigas ficam como histórico; `docs/` é tratado na Fase 8. O padrão `token-state"` não
   pega o novo `refresh-token-state`.)
7. `npm ls next-auth` → vazio; `npm ls jose arctic` → dependências diretas.

**Checkpoint 6:** `npm run typecheck`, `npm test` e `npm run build` verdes.

### Fase 7 — Validação

#### 7.1 Automática

```bash
npm run typecheck
npm test
npm run build
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npm run db:purge-tokens
```

#### 7.2 Como inspecionar o banco

```bash
docker exec voacraque-db-dev psql -U voacraque -d voacraque -c 'SELECT "familyId", "revokedReason", "revokedAt" IS NOT NULL AS revogado, "expiresAt", "createdAt" FROM "RefreshToken" WHERE "userId" = (SELECT id FROM "User" WHERE username = $$USERNAME$$) ORDER BY "createdAt"'
```
(Usuário e banco do Postgres: `VOACRAQUE_DB_USER`/`VOACRAQUE_DB_NAME` do `.env`, padrão `voacraque`.
Troque `USERNAME`.)

#### 7.3 Navegador (preview `voacraque-dev` do `.claude/launch.json`)

Credenciais: superadmin do seed (`SUPERADMIN_USERNAME`/`SUPERADMIN_PASSWORD` no `.env`; não repita os
valores). Para os cenários que mudam senha, **registre um usuário descartável** (`/register`, username
tipo `jwtteste` + sufixo aleatório, e-mail `jwtteste+<sufixo>@example.com`, senha gerada na hora) e não
coloque a senha no relatório.

Use `read_network_requests` para ler os `Set-Cookie` (os cookies são `httpOnly`; JavaScript da página não
os vê — isso também é um critério).

| # | Cenário | Esperado |
| :-- | :-- | :-- |
| N1 | Login por senha | POST da action com `Set-Cookie` `voacraque.session` (`Max-Age=900`) e `voacraque.refresh` (`Max-Age=604800`), ambos `HttpOnly`, `SameSite=Lax`, `Path=/`; cai em `/` logado. `document.cookie` não mostra nenhum dos dois. Banco: uma família nova com um token vivo |
| N2 | Registro de usuário novo | Cookies iguais ao N1; cai em `/onboarding` |
| N3 | Navegar por `/`, `/game-days`, `/ranking`, `/profile`; como superadmin, `/admin/users` | Tudo abre; **nenhuma** resposta traz `Set-Cookie` de sessão enquanto o access tem mais de 60 s de vida (prova de que não renova a cada requisição); banco sem linhas novas |
| N4 | Abrir `/login` logado | Redireciona para `/` |
| N5 | Logout | Cai em `/login`; resposta apaga os dois cookies (`Max-Age=0`); abrir `/` volta para `/login`. Banco: família revogada com `LOGOUT` |
| N6 | Botão "Continuar com o Google" | Navega para `accounts.google.com` com `redirect_uri=http://localhost:3000/api/auth/callback/google`, `code_challenge`, `code_challenge_method=S256`, `state` e `prompt=select_account`; a resposta da action grava `voacraque.oauth`. **Pare aí** (não faça login no Google) |
| N7 | `GET /api/auth/callback/google?code=x&state=y` direto | Redireciona para `/login?error=OAuthCallback` e mostra a mensagem genérica |
| N8 | Troca de senha em `/profile` (usuário descartável) | Mensagem nova de sucesso; resposta traz par novo de cookies; continua logado. Banco: famílias anteriores `PASSWORD_CHANGED`, uma família nova viva |
| N9 | Redefinição por e-mail (usuário descartável, **logado** neste navegador): `/forgot-password` → link no log do servidor (`MAIL_DRIVER=console`, leia com `preview_logs`) → `/reset-password?token=...` → nova senha | Cai em `/login?senha=redefinida` **mostrando o formulário** (não é mandado para `/`), com os cookies apagados pelo proxy. Banco: tudo `PASSWORD_RESET`. Login com a senha nova funciona |

#### 7.4 Expiração acelerada (alteração temporária — desfaça no fim)

Em `src/lib/auth/config.ts`, **temporariamente**: `ACCESS_TOKEN_TTL_S = 20` e `ACCESS_REFRESH_MARGIN_S = 5`.

| # | Cenário | Esperado |
| :-- | :-- | :-- |
| E1 | Login, esperar ~25 s, navegar para outra página | A resposta do GET traz par novo; a página abre logada. Banco: token anterior `ROTATED`, sucessor vivo na **mesma** família |
| E2 | Login, esperar ~25 s, salvar um campo do perfil (`PUT /api/profile`) | 200; a resposta traz par novo |
| E3 | Login, esperar ~25 s, clicar em Sair | Termina em `/login`; abrir `/` redireciona para `/login`. Banco: o token do login `ROTATED` e o sucessor `LOGOUT`. Log **sem** `refresh_token_reuse`. **Isso prova que o logout da action vence a renovação do proxy na mesma requisição.** Se falhar, pare e reporte com os `Set-Cookie` observados |
| E4 | Login (usuário descartável), esperar ~25 s, trocar a senha | Sucesso e continua logado; navegar depois de mais ~25 s renova normalmente. Log **sem** `refresh_token_reuse` |

Desfaça a alteração (volte para `15 * 60` e `60`) e rode `npm test` — o teste de constantes precisa passar.

#### 7.5 Rotação, graça e reuso via curl (script temporário — apague no fim)

Crie `scripts/_tmp-issue-refresh.ts` (tsx resolve o alias `@/` pelo tsconfig). Ele simula "um login em
outro aparelho": abre uma família nova e imprime o valor puro.
```ts
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { issueRefreshToken } from "@/lib/auth/refresh-tokens";

const [username] = process.argv.slice(2);
const user = await prisma.user.findUniqueOrThrow({ where: { username }, select: { id: true } });
console.log(await issueRefreshToken(user.id));
await prisma.$disconnect();
```
Com o dev server rodando (em http os nomes não têm prefixo), guarde tokens em variáveis de shell sem
imprimi-los (ex.: `T=$(npx tsx scripts/_tmp-issue-refresh.ts <username-do-superadmin> 2>/dev/null | tail -1)`;
o username está em `SUPERADMIN_USERNAME` no `.env`, e o perfil dele já nasce completo no seed). Para ler o
refresh novo de uma resposta, extraia do `Set-Cookie` com `grep -o 'voacraque.refresh=[^;]*'`.

| # | Cenário | Esperado |
| :-- | :-- | :-- |
| C1 | `T` do superadmin; `curl -s -o /dev/null -D - -b "voacraque.refresh=$T" http://localhost:3000/ranking` | `200` com par novo. Banco: `T` `ROTATED`, sucessor vivo na mesma família |
| C2 | Graça: token novo `G`; duas chamadas seguidas (< 10 s) com `G` | As duas `200` com par novo; uma linha `refresh_token_grace_reuse` no log (`preview_logs`); nenhum `refresh_token_reuse` |
| C3 | Reuso: depois de > 10 s, de novo com `G` | `307` para `/login?proximo=%2Franking`, cookies apagados, linha `refresh_token_reuse` no log. Banco: todos os tokens vivos da família de `G` agora `REUSE_DETECTED` |
| C4 | Com o sucessor de `G` recebido no C2 (família já derrubada) | `307`, `refresh_token_revoked_use` com `reason: "REUSE_DETECTED"` |
| C5 | Refresh adulterado (troque o último caractere) | `307`, cookies apagados, **nenhum** evento de reuso (token desconhecido) |
| C6 | `curl -s -D - -X POST -b "voacraque.refresh=$T2" http://localhost:3000/api/auth/refresh` com token novo `T2` | `204` e par novo; sem cookie → `401` com cookies apagados |
| C7 | Rota de API protegida só com refresh novo: `GET /api/game-days` | `200` com par novo (a API também renova) |
| C8 | Troca de senha não é roubo: `B` = token do usuário descartável emitido **antes** do N8/E4; `GET /ranking` com `B` depois da troca | `307`; log com `refresh_token_revoked_use` e `reason: "PASSWORD_CHANGED"`; **nenhum** `refresh_token_reuse` |

Apague `scripts/_tmp-issue-refresh.ts` ao terminar e confirme com `git status`.

### Fase 8 — Documentação

1. **Criar `docs/arquitetura-sessao-jwt.md`** (português, no estilo dos outros docs), com:
   - o mapa (navegador → proxy → render/handlers → banco) e os dois cookies com seus atributos (D2);
   - as decisões D1–D14 resumidas, com o porquê (inclua "por que não manter o Auth.js" e "por que
     `revokedReason`");
   - fluxos: login por senha, registro, Google (state + PKCE), navegar com renovação no proxy (rotação,
     graça, reuso), Server Action/API com access vencido, logout, troca de senha, redefinição por e-mail;
   - tabela "o que mata o quê":

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

   - limites conhecidos: o access não é revogável nos 15 min (D9); se a resposta que levava o sucessor
     se perder (rede do celular caindo) e o navegador reapresentar o token antigo depois de 10 s, isso é
     lido como reuso e a família cai (mesmo compromisso da referência; o protocolo antigo, com
     confirmação do sucessor, cobria esse caso); tokens criados na janela de graça ficam vivos até
     expirar ou até o logout; rate limit em memória por instância; o proxy consulta o banco só na
     renovação e em GET de rota só-de-deslogado;
   - a tabela da [seção 4](#4-o-que-foi-adaptado-do-repositório-de-referência) (referência × Voa Craque);
   - onde os testes cobrem cada parte.
2. `docs/arquitetura-modulo-autenticacao.md`: só um aviso logo abaixo do título:
   > **Atualização (30/09/2026):** o protocolo de sessão rotativa com `SessionToken` (seções 3, 4 e 7)
   > foi substituído por access token JWT stateless + refresh token rotativo em `RefreshToken`. Ver
   > [`arquitetura-sessao-jwt.md`](arquitetura-sessao-jwt.md).
3. `docs/arquitetura-infraestrutura-aws.md`: `npm run db:purge-sessions` → `npm run db:purge-tokens`.
4. `README.md`:
   - tabela de variáveis: `AUTH_SECRET` (assina o JWT de sessão; ≥ 32 caracteres; rotação com
     `AUTH_SECRET_1`), `AUTH_URL` (sem `AUTH_TRUST_HOST`), Google igual;
   - seção "Autenticação e sessão" reescrita: cookie de sessão JWT de 15 min + refresh de 7 dias em
     `RefreshToken`, renovação no proxy só quando o access vence, rotação com graça de 10 s, eventos
     `refresh_token_reuse`/`refresh_token_grace_reuse`/`refresh_token_revoked_use`, purga
     (`npm run db:purge-tokens`), link para o doc novo e o aviso de que **ao publicar, todo mundo entra
     de novo uma vez** (os cookies antigos do Auth.js ficam órfãos e expiram sozinhos);
   - "Alterar e recuperar senha": troca e redefinição encerram as outras sessões **em até 15 minutos**;
   - "Testes": troque o item de `tests/auth-session.test.ts` pelos três arquivos novos.

**Checkpoint 8:** `npm test` e `npm run typecheck` verdes de novo; `git status` sem arquivos temporários.

---

## 8. Armadilhas conhecidas

- `cookies().set` só funciona em Server Action e Route Handler. `getCurrentUser()` e qualquer coisa
  chamada de Server Component **só lê**. Nunca rotacione refresh fora do proxy, das actions de auth e de
  `/api/auth/*`: rotacionar num lugar que não consegue entregar o cookie queima o token (é a lição
  documentada no `apiClient.ts` da referência).
- **Toda Server Action que grava cookie precisa deixar os dois cookies de sessão coerentes sozinha**
  (revogar o que leu de `cookies()` e gravar ou apagar os dois), porque o `Set-Cookie` dela substitui o
  do proxy. Hoje isso vale para login, cadastro, logout, troca de senha e o início do Google (este
  último fica em rota só-de-deslogado, onde o proxy não renova em POST). Uma action nova que grave
  qualquer outro cookie em rota protegida precisa tratar isso.
- `redirect()` lança para funcionar: nunca dentro de `try/catch`, e nada depois dele executa.
- Nunca reescreva `revokedAt` de um token já revogado (condição `revokedAt: null` no `where`).
- Confira `user.active` **antes** de revogar o token na rotação.
- `tokens.ts`, `refresh-token-state.ts`, `session-cookies.ts`, `config.ts` e `google-oauth-state.ts` não
  importam Prisma em runtime nem `next/headers` (os testes são puros e o CI não tem banco). Import de
  **tipo** de `@/generated/prisma/client` é permitido (o CI roda `db:generate` antes dos testes).
- Apagar cookie exige os mesmos atributos com que foi criado (`secure`, `path`): use sempre
  `expiredSessionCookies()`.
- O proxy não deve tocar em `/api/auth/*`; o callback do Google precisa do cookie `voacraque.oauth`
  intacto e grava a sessão sozinho.
- A pasta `src/app/api/auth/[...nextauth]` precisa sumir **antes** de criar `callback/google` e
  `refresh`, senão as rotas conflitam.
- `jwtVerify` sem `algorithms: ["HS256"]` aceitaria outros algoritmos: não remova.
- `process.env.AUTH_SECRET` é lido a cada chamada (não em cache de módulo), para os testes poderem trocar.
- `SECURE_COOKIES` é calculado no import de `config.ts`; para testar https, use `vi.resetModules()` e
  import dinâmico.

---

## 9. Fora de escopo

- "Sair de todos os aparelhos" (seria `revokeAllUserRefreshTokens` + limpar cookies); confirmação do
  sucessor para sobreviver a respostas perdidas; limite absoluto de sessão; rate limit compartilhado
  entre instâncias; cabeçalho `Authorization: Bearer`; retry de 401 no cliente.
- Qualquer mudança em autorização por papel, telas ou regras de pelada.

---

## 10. Critérios de aceite

- [ ] `SessionToken` não existe mais; o cookie de sessão não tem nenhuma linha no banco (R1).
- [ ] `RefreshToken` guarda só o hash, com família, rotação, graça de 10 s e detecção de reuso; troca de
      senha não gera alarme de reuso (R1, D3, D4).
- [ ] Cookie `voacraque.session`: JWT HS256 de 15 min, `Max-Age=900`, `HttpOnly`, `SameSite=Lax`; em
      https, `Secure` e `__Host-` (R2, D2 — teste automático).
- [ ] Cookie `voacraque.refresh`: 7 dias, `Max-Age=604800`; renova a sessão em página, API e Server
      Action sem novo login, **só quando o access vence** (N3, E1–E4, C1, C7); `POST /api/auth/refresh`
      funciona (C6) (R3).
- [ ] Logout vence a renovação do proxy (E3); redefinição mostra o `/login` (N9).
- [ ] Google: início correto (N6) e erros tratados (N7); callback no mesmo caminho de antes.
- [ ] `next-auth` fora do `package.json`; varredura da Fase 6 vazia.
- [ ] `npm run typecheck`, `npm test`, `npm run build`, `migrate diff --exit-code` e `db:purge-tokens` verdes.
- [ ] Documentação da Fase 8 feita.

---

## 11. Relatório final

Entregue ao usuário, em português:

1. Resultado de cada checkpoint e dos cenários N1–N9, E1–E4, C1–C8 (passou/falhou, com evidência curta).
2. Lista de arquivos criados, modificados, renomeados e apagados.
3. O que precisou ser feito fora do código: se o `AUTH_SECRET` do `.env` foi preenchido; se algum
   container foi parado (com autorização).
4. O que ficou pendente e por quê. Inclua: login com Google ponta a ponta precisa ser testado pelo
   usuário; `docs/jornada-autenticacao-ate-inscricao.md` descreve o modelo antigo e não foi tocado; e o
   checklist pós-deploy abaixo.
5. Checklist pós-deploy para o usuário: em produção, o `Set-Cookie` do login traz
   `__Host-voacraque.session` e `__Host-voacraque.refresh` com `Secure; HttpOnly; SameSite=Lax; Path=/`;
   agendar `npm run db:purge-tokens` diariamente.
6. Sugestão de commits (Conventional Commits em português, como o histórico do repo), por exemplo:
   - `refactor(auth): troca a sessao em banco por access JWT stateless e refresh token rotativo`
   - `feat(auth): login com Google via arctic e endpoint de refresh`
   - `docs(auth): documenta a sessao com access JWT e refresh token`
