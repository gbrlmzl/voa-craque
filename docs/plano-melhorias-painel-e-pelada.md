# Plano: melhorias no painel ao vivo e na página da pelada

> **Para o Gabriel:** leia a seção [Decisões](#2-decisões-para-o-gabriel). As opções recomendadas já vêm marcadas com `[x]`. Para escolher outra, mova o `x`. Se quiser algo diferente de todas, escreva embaixo da decisão. Os cenários BDD de cada funcionalidade mostram como ela vai se comportar na prática; se algum não bater com o que você imaginou, corrija o cenário, porque ele vira o critério de aceite.
>
> **Para o Sonnet (executor):** este documento é a especificação. Siga as opções marcadas com `[x]` na seção 2. Os cenários BDD são critérios de aceite: cada um precisa ser verdadeiro ao final. Se o código contradisser alguma premissa daqui, pare e pergunte antes de seguir por outro caminho. Detalhes de implementação que o documento não cobre, decida, siga e registre no relatório final.

---

## Sumário

1. [Contexto e padrões do projeto](#1-contexto-e-padrões-do-projeto)
2. [Decisões para o Gabriel](#2-decisões-para-o-gabriel)
3. [F1. Destaque do "Retomar" depois do gol](#f1-destaque-do-retomar-depois-do-gol)
4. [F2. Times em letras ou números](#f2-times-em-letras-ou-números)
5. [F3. Atalho flutuante para a partida ao vivo](#f3-atalho-flutuante-para-a-partida-ao-vivo)
6. [F4. Modal do time na fila](#f4-modal-do-time-na-fila)
7. [F5. Pagamentos em modal](#f5-pagamentos-em-modal)
8. [F6. "Refazer times" desabilitado depois do início](#f6-refazer-times-desabilitado-depois-do-início)
9. [Ordem de execução e commits](#9-ordem-de-execução-e-commits)
10. [Verificação](#10-verificação)
11. [Fora do escopo](#11-fora-do-escopo)
12. [Relatório final](#12-relatório-final)

---

## 1. Contexto e padrões do projeto

O Voa Craque organiza peladas de futsal: inscrição com pagamento, sorteio de times (A, B, C, D, E), painel ao vivo operado pelo organizador com uma mão na beira da quadra, e ranking. Dois times jogam e os outros esperam numa fila; quem vence fica, quem perde vai para o fim da fila.

Stack: Next.js 16 (App Router), React 19, TypeScript, Prisma 7, PostgreSQL, Tailwind 4, lucide-react, zod, vitest. **Não adicione dependências.**

### Rotas envolvidas

| Rota | Arquivo | Quem usa |
| --- | --- | --- |
| `/game-days/[id]` | `src/app/(app)/game-days/[id]/page.tsx` (Server Component) | todos; admin vê botões extras |
| `/game-days/[id]/panel` | `src/app/(app)/game-days/[id]/panel/page.tsx` → `LivePanel` | organizador (ADMIN/SUPERADMIN) |
| `/game-days/[id]/live` | `src/app/(app)/game-days/[id]/live/page.tsx` → `LiveBoard` | espectadores |
| `/game-days/[id]/teams` | `src/app/(app)/game-days/[id]/teams/page.tsx` → `TeamBuilder` | organizador |
| `/profile` | `src/app/(app)/profile/page.tsx` | todos |

> Observação: a rota da pelada é `/game-days/[id]` (não existe `[code]`).

### Padrões que a implementação deve seguir

- **Componente + hook:** a lógica de estado de um componente fica num hook em `src/hooks/useNomeDoComponente.ts` (ex.: `LivePanel` + `useLivePanel`, `PaymentList` + `usePaymentList`). Siga isso nos componentes novos.
- **Módulo puro + teste:** regra de negócio sem banco fica em `src/lib/*.ts`, testada em `tests/*.test.ts` com vitest (ex.: `match-engine.ts`, `substitution.ts`).
- **Route handlers:** `route(async () => { await requireUser() / requireAdmin(); ... })` de `src/lib/http.ts` e `src/lib/session.ts`. Veja `src/app/api/game-days/[id]/live/route.ts`.
- **Modais:** folha que sobe do rodapé no celular e centraliza no desktop, fundo `bg-black/70`, `Card` com borda `border-white/15`, `role="dialog"` e `aria-modal="true"`, fecha com Esc e com clique no fundo. Referências: `src/components/forms/ChangePasswordModal.tsx`, `src/components/providers/PlayerModalProvider.tsx`.
- **Camadas (z-index) atuais:** header e tab bar `z-40`; barra fixa do placar no painel `z-30`; modais `z-50`; toast `z-60`.
- **Paleta:** `pitch` (verde) para ação/sucesso, `night` para fundos, `rose` para erro, `amber` para alerta, `teamColor(nome)` de `src/lib/labels.ts` para identificar times.
- **Toque:** todo alvo de toque com pelo menos 44px (`touch-target` ou `size="lg"`).
- **Idioma:** textos de interface em português com acentos. Comentários de código em português **sem** acentos, no tom dos existentes. Comente só o que não é óbvio.

---

## 2. Decisões para o Gabriel

As recomendadas já estão marcadas. Cada decisão diz o que muda no código para o Sonnet saber o que fazer com cada escolha.

### D1 (F1). Quando o destaque do "Retomar" aparece?

- [x] **A (recomendado):** depois de confirmar a assistência ou "Individual" **e também** depois de "Cancelar" no modal de assistência. Em todos os casos a partida está pausada e alguém precisa retomar.
- [ ] B: só depois de confirmar a assistência ou "Individual". Ao cancelar, nada é destacado.

### D2 (F1). O que acontece ao tocar na parte escurecida da tela?

- [x] **A (recomendado):** o toque só tira o destaque (a tela volta ao normal) e não aciona nada que esteja embaixo. O "Desfazer" do toast continua clicável por cima do escurecido.
- [ ] B: nada responde; só o "Retomar" e o "Desfazer" do toast funcionam até retomar.
- [ ] C: o escurecido é só visual; os toques atravessam e acionam o que está embaixo.

### D3 (F2). Onde guardar a preferência letras/números?

- [x] **A (recomendado):** cookie no aparelho (`vc_team_label`, 1 ano). O servidor lê o cookie e já desenha a página certa, sem piscar. Não precisa de migration. Cada aparelho guarda a sua.
- [ ] B: `localStorage`. Mais simples, mas a página carrega com letras e troca para números um instante depois (pisca).
- [ ] C: coluna nova no banco (`User.teamLabelMode`). Vale em todos os aparelhos da conta, mas exige migration e API. Não altera como os times são gravados; só guarda a preferência do usuário.

### D4 (F2). Onde fica a opção na interface?

- [x] **A (recomendado):** nova seção "Preferências" na página `/profile`, abaixo de "Seus dados". Hoje não existe página de configurações para usuários comuns (`/admin/system` é do superadmin e vale para o sistema inteiro).
- [ ] B: nova rota `/settings` com link no menu.

### D5 (F3). Quem vê o atalho flutuante?

- [x] **A (recomendado):** todo ADMIN e SUPERADMIN, porque qualquer organizador pode abrir o painel (`pageAdmin`).
- [ ] B: só o organizador que criou a pelada (`GameDay.createdById`).

### D6 (F3). Quando o atalho aparece?

- [x] **A (recomendado):** enquanto a pelada estiver com status `LIVE`, inclusive no intervalo entre uma partida e outra (é justamente quando o organizador costuma sair do painel).
- [ ] B: só com partida em andamento ou pausada (`RUNNING` ou `PAUSED`).

### D7 (F3). Onde o atalho fica na tela?

- [x] **A (recomendado):** cartão flutuante no rodapé, logo acima da tab bar no celular e no canto inferior no desktop. Quando um toast aparece, ele fica por cima do atalho por alguns segundos.
- [ ] B: faixa fixa logo abaixo do header, ocupando a largura toda.

### D8 (F3). O organizador pode fechar o atalho?

- [x] **A (recomendado):** sim, com um X. Ele some até a **próxima partida** começar e então volta. Assim o lembrete não incomoda, mas não se perde.
- [ ] B: sim, com um X, e ele some até o fim da pelada naquela aba.
- [ ] C: não tem X; fica sempre visível fora do painel.

### D9 (F4). De onde vêm os dados do modal do time?

- [x] **A (recomendado):** endpoint novo, buscado só quando o modal abre (`GET /api/game-days/[id]/teams/[teamId]`). Não aumenta o snapshot que o SSE empurra a cada lance (o código atual tem um cuidado explícito com isso em `src/services/live.ts`).
- [ ] B: incluir histórico e elencos de todos os times no snapshot ao vivo. O modal abre na hora, mas todo lance passa a trafegar esses dados para todos os aparelhos conectados.

### D10 (F4). O modal do time também abre na tela do espectador (`/live`)?

- [x] **A (recomendado):** sim. Custa pouco (mesmo componente e mesmo endpoint) e quem espera na fila quer saber contra quem vai jogar.
- [ ] B: não, só no painel do organizador.

### D11 (F5). Onde fica o botão "Pagamentos"?

- [x] **A (recomendado):** no mesmo lugar onde hoje fica a seção de pagamentos, como um botão largo com um selo do que falta conferir ("3 aguardando" / "tudo conferido").
- [ ] B: junto de "Refazer times" e "Editar pelada", no topo da página.

### D12 (F6). Mostrar o motivo do botão desabilitado?

- [x] **A (recomendado):** sim, uma linha curta abaixo dos botões: "Os times ficam travados depois que a primeira partida começa."
- [ ] B: não, só desabilitar o botão.

---

## F1. Destaque do "Retomar" depois do gol

### Objetivo

Hoje o gol pausa o cronômetro (`startGoal` em `src/hooks/useLivePanel.ts`) e abre o modal de assistência. Depois de confirmar, o organizador precisa lembrar de tocar em "Retomar"; na correria da quadra, ele esquece e o cronômetro fica parado. Depois do gol, a tela escurece e só o "Retomar" fica em evidência, pulsando em tons de verde.

### Arquivos

- `src/hooks/useLivePanel.ts`: estado do destaque.
- `src/components/live/LivePanel.tsx`: escurecido e destaque do botão.
- `src/app/globals.css`: animação.

### Passos

1. **Estado no hook.** Em `useLivePanel`, crie `const [resumeHintFor, setResumeHintFor] = useState<string | null>(null)`, que guarda o `match.id` da partida em que o destaque foi pedido.
   - Em `confirmGoal`: depois de `await recordGoal(...)`, chame `setResumeHintFor(match.id)` usando o id capturado **antes** da chamada (o snapshot pode mudar durante o `await`). Faça isso mesmo se o POST falhar: a partida continua pausada.
   - Em `cancelGoal`: se D1 = A, também chame `setResumeHintFor(match.id)`.
   - Em `changeState` (qualquer ação), `startGoal` e `startSubstitution`: chame `setResumeHintFor(null)`.
   - Exponha `dismissResumeHint = () => setResumeHintFor(null)`.
2. **Condição derivada, não efeito.** Calcule no hook:
   ```ts
   const showResumeHint =
     !!match &&
     resumeHintFor === match.id &&
     match.status === "PAUSED" &&
     remainingMs > 0 &&
     !pendingGoal &&
     !pendingSubstitution;
   ```
   Assim o destaque some sozinho quando: outro aparelho retoma a partida, o gol foi o decisivo (o snapshot passa a mostrar a próxima partida, com outro id), o tempo acabou ou um modal abriu. Não use `useEffect` para limpar.
3. **Escurecido.** No `LivePanel`, quando `showResumeHint`:
   - Renderize um `<div>` fixo `inset-0 z-45 bg-black/60` com animação curta de entrada (fade de ~150ms). Com D2 = A, `onClick={dismissResumeHint}`; com D2 = B, sem `onClick` e capturando os toques; com D2 = C, `pointer-events-none`.
   - Troque o `z-30` da barra fixa do placar (`sticky top-14 ...`) por `z-46` enquanto o destaque estiver ativo, para ela ficar acima do escurecido. O header e a tab bar (`z-40`) ficam embaixo do escurecido; o toast (`z-60`) fica por cima, com o "Desfazer" clicável.
   - Dentro da barra: o placar fica levemente esmaecido (`opacity-70`) para o organizador ainda conferir o gol; o botão "Encerrar partida" fica escuro e sem clique (`opacity-30 pointer-events-none`).
   - Acima dos botões, uma legenda curta em `text-pitch-300`: "Cronômetro parado. Toque em Retomar."
4. **Botão pulsando.** No botão "Retomar", quando `showResumeHint`, adicione a classe `resume-attention`. Em `globals.css`, no mesmo estilo de `ball-glow`:
   ```css
   @keyframes resume-attention {
     0%, 100% { background-color: var(--color-pitch-500); box-shadow: 0 0 0 0 rgba(52, 217, 138, 0.55); }
     50%      { background-color: var(--color-pitch-300); box-shadow: 0 0 22px 6px rgba(52, 217, 138, 0.45); }
   }
   @utility resume-attention {
     animation: resume-attention 1.6s ease-in-out infinite;
   }
   @media (prefers-reduced-motion: reduce) {
     .resume-attention { animation: none; box-shadow: 0 0 0 4px var(--color-pitch-300); }
   }
   ```
   A oscilação é suave (1,6s, só entre dois verdes da paleta), sem piscar on/off.
5. **Acessibilidade.** Enquanto o destaque estiver ativo, mova o foco para o botão "Retomar" (`ref` + `focus()` num efeito que depende de `showResumeHint`). A legenda leva `role="status"` para leitores de tela.

### Cenários BDD

```gherkin
# language: pt
Funcionalidade: Lembrete para retomar o cronômetro depois do gol
  Como organizador operando o painel na beira da quadra
  Quero que o botão Retomar chame atenção depois de um gol
  Para não esquecer o cronômetro parado

  Contexto:
    Dado que estou no painel da pelada "Pelada de quinta"
    E a partida 2 entre Time A e Time B está em andamento com 06:30 no relógio

  Cenário: Gol com assistência destaca o Retomar
    Quando eu toco no ⚽ do jogador "Rafa" do Time A
    Então o cronômetro para em 06:30
    E o modal "Assistência de?" aparece
    Quando eu escolho "Léo" como assistência
    Então o modal fecha
    E o resto da tela escurece
    E o botão "Retomar" fica pulsando em tons de verde
    E aparece a legenda "Cronômetro parado. Toque em Retomar."
    E o toast "Gol de Rafa, assistência de Léo" aparece com "Desfazer" clicável

  Cenário: Gol individual também destaca o Retomar
    Quando eu toco no ⚽ do jogador "Rafa" do Time A
    E escolho "Individual"
    Então o botão "Retomar" fica em destaque com o resto da tela escurecido

  Cenário: Retomar desfaz o destaque
    Dado que o botão "Retomar" está em destaque depois de um gol
    Quando eu toco em "Retomar"
    Então o cronômetro volta a correr a partir de 06:30
    E a tela volta ao normal

  Cenário: Cancelar o modal de assistência também destaca (D1 = A)
    Quando eu toco no ⚽ do jogador "Rafa" do Time A
    E toco em "Cancelar" no modal de assistência
    Então nenhum gol é registrado
    E o botão "Retomar" fica em destaque, porque a partida continua pausada

  Cenário: Tocar no escurecido só tira o destaque (D2 = A)
    Dado que o botão "Retomar" está em destaque depois de um gol
    Quando eu toco na área escurecida, em cima do botão "Substituição" do Time B
    Então a tela volta ao normal
    E o modal de substituição não abre
    E a partida continua pausada

  Cenário: Desfazer o gol pelo toast com o destaque ativo
    Dado que o botão "Retomar" está em destaque depois do gol de "Rafa"
    Quando eu toco em "Desfazer" no toast
    Então o gol de "Rafa" é removido do placar
    E o botão "Retomar" continua em destaque, porque a partida segue pausada

  Cenário: Gol decisivo não destaca nada
    Dado que o Time A está vencendo por 1 x 0 e a pelada encerra com 2 gols
    Quando eu marco o gol de "Rafa" e escolho "Individual"
    Então a partida termina com "Time A venceu"
    E nenhum destaque de Retomar aparece

  Cenário: Outro aparelho retoma a partida
    Dado que o botão "Retomar" está em destaque no meu celular
    Quando outro organizador retoma a partida pelo celular dele
    Então o destaque some sozinho no meu celular e o relógio volta a correr

  Cenário: Pausa manual não ganha destaque
    Quando eu toco em "Pausar"
    Então a partida pausa
    E a tela não escurece

  Cenário: Quem prefere menos movimento
    Dado que o sistema do celular está com "reduzir movimento" ativado
    Quando o botão "Retomar" entra em destaque
    Então ele aparece com um anel verde fixo, sem pulsar
```

---

## F2. Times em letras ou números

### Objetivo

Cada usuário escolhe como ver os nomes dos times: "Time A, Time B, Time C" ou "Time 1, Time 2, Time 3". **Só muda a exibição.** No banco e nas APIs os times continuam se chamando `A`, `B`, `C`, `D`, `E` (`TEAM_NAMES` em `src/lib/team-balancer.ts`). As cores (`teamColor(name)`) continuam usando a letra gravada.

### Arquivos novos

- `src/lib/team-label.ts`: módulo puro.
- `tests/team-label.test.ts`.
- `src/lib/preferences.ts`: leitura do cookie no servidor (D3 = A).
- `src/actions/preferences.ts`: server action que grava o cookie (D3 = A).
- `src/components/providers/PreferencesProvider.tsx`.
- `src/components/TeamName.tsx`: componente cliente que escreve o nome.
- `src/components/forms/PreferencesForm.tsx` + `src/hooks/usePreferencesForm.ts`.

### Passos

1. **Módulo puro `src/lib/team-label.ts`:**
   ```ts
   export type TeamLabelMode = "letters" | "numbers";
   export const TEAM_LABEL_COOKIE = "vc_team_label";
   export const DEFAULT_TEAM_LABEL_MODE: TeamLabelMode = "letters";

   export function parseTeamLabelMode(value: string | undefined | null): TeamLabelMode;
   /** "A" -> "Time A" ou "Time 1". Nome fora de A-Z volta como esta: "Time ?". */
   export function formatTeamName(name: string, mode: TeamLabelMode): string;
   ```
   Converta pela posição no alfabeto (`A` = 1, `B` = 2, ...), aceitando só uma letra maiúscula (`/^[A-Z]$/`). Qualquer outro valor (`"?"`, vazio, nomes futuros) volta sem conversão. Testes: A→"Time 1", E→"Time 5", modo letras→"Time A", "?"→"Time ?", valor de cookie inválido→`"letters"`.
2. **Leitura no servidor (D3 = A).** Em `src/lib/preferences.ts`, `getTeamLabelModePromise(): Promise<TeamLabelMode>` que faz `cookies().then(store => parseTeamLabelMode(store.get(TEAM_LABEL_COOKIE)?.value))`. **Não use `await` no layout raiz**: siga o mesmo padrão de `getSessionPromise()` e do `UserProvider` (o comentário em `src/app/layout.tsx` explica o porquê).
3. **Provider.** `PreferencesProvider` recebe a promise e espelha o `UserProvider`: guarda a promise, aceita uma escolha local otimista que caduca quando chega uma promise nova, e expõe:
   - `useTeamLabelMode(): TeamLabelMode` (usa `use(promise)`);
   - `useTeamName(): (name: string) => string`, para textos em template string e `aria-label`;
   - `useSetTeamLabelMode(): (mode) => void`.
   Envolva a árvore em `src/app/layout.tsx`, dentro do `UserProvider`.
4. **Componente `<TeamName name="A" />`.** Componente cliente que devolve o texto `formatTeamName(name, mode)`. Use-o dentro de Server Components (ex.: `page.tsx` da pelada) e em JSX comum; use `useTeamName()` onde o nome entra numa string.
5. **Gravar a preferência.** Server action `setTeamLabelModeAction(mode)`: valida com `z.enum(["letters", "numbers"])` e grava `(await cookies()).set(TEAM_LABEL_COOKIE, mode, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true })`. O formulário aplica a escolha local na hora (otimista) e chama a action. Se D3 = B ou C, adapte este passo e registre no relatório.
6. **Interface da opção (D4 = A).** Em `/profile`, nova seção `<SectionTitle>Preferências</SectionTitle>` abaixo de "Seus dados", com um controle segmentado de duas opções (dois botões lado a lado, `aria-pressed`): **"Letras (Time A)"** e **"Números (Time 1)"**. Abaixo, uma linha de prévia: "Assim: Time A, Time B, Time C" ou "Assim: Time 1, Time 2, Time 3". Ao trocar, toast "Preferência salva."
7. **Trocar todos os pontos que escrevem "Time {nome}".** Lista completa encontrada no código (confira com `grep -rn "Time {\|Time \${" src` antes de terminar; não pode sobrar nenhum):

   | Arquivo | Linhas aproximadas | O que é |
   | --- | --- | --- |
   | `src/app/(app)/game-days/[id]/page.tsx` | 196 | cartões dos times |
   | `src/components/gameday/TeamBuilder.tsx` | 87, 143, 154 | cartão, `<option>` do select, aviso de excesso |
   | `src/components/live/LivePanel.tsx` | 109, 112–113, 173, 241 | resultado, fila, cartão do time |
   | `src/components/live/LiveBoard.tsx` | 59, 62–63, 81, 107, 148 | resultado, fila, cartão, tabela |
   | `src/components/live/MatchFeed.tsx` | 34, 46 | lances |
   | `src/components/live/Scoreboard.tsx` | 40, 57 | placar |
   | `src/components/live/SubstitutionModal.tsx` | 89, 96, 159 | `aria-label`, título, grupo da fila |
   | componentes novos de F3 e F4 | | atalho e modal do time |

   No `<option>` do `TeamBuilder`, o `value` continua sendo a letra; só o texto muda.
8. **O que não muda:** textos gerados no servidor (resumos de auditoria em `src/services/match.ts`, a mensagem de erro "O time A tem mais que N jogadores." em `src/services/teams.ts`). Isso é backend e fica em letras. Registre no relatório como limitação conhecida.

### Cenários BDD

```gherkin
# language: pt
Funcionalidade: Escolher como os times aparecem
  Como usuário do Voa Craque
  Quero ver os times como letras ou números
  Para usar o jeito que a minha turma fala na quadra

  Cenário: Padrão é letras
    Dado que nunca mudei a preferência
    Quando abro o painel ao vivo de uma pelada com os times A, B e C
    Então vejo "Time A", "Time B" e "Time C"

  Cenário: Trocar para números
    Dado que estou em "/profile"
    Quando escolho "Números (Time 1)" em Preferências
    Então vejo a prévia "Assim: Time 1, Time 2, Time 3"
    E aparece o toast "Preferência salva."
    Quando abro o painel ao vivo da pelada
    Então o placar mostra "Time 1" contra "Time 2"
    E a fila mostra "1º · Time 3"
    E a lista de lances mostra "Time 1" ao lado do gol

  Cenário: A cor do time não muda
    Dado que escolhi números
    Então o "Time 1" continua verde e o "Time 2" continua azul, como Time A e Time B

  Cenário: O banco continua com letras
    Dado que escolhi números
    Quando sorteio os times de uma pelada
    Então os times são gravados como "A", "B", "C"
    E a API "/api/game-days/{id}/live" devolve "name": "A"

  Cenário: Cada usuário vê do seu jeito
    Dado que eu escolhi números e o jogador "Léo" não mudou nada
    Quando nós dois abrimos a tela ao vivo da mesma pelada
    Então eu vejo "Time 1" e o Léo vê "Time A"

  Cenário: A página carrega já no modo escolhido (D3 = A)
    Dado que escolhi números
    Quando recarrego a página da pelada
    Então os cartões aparecem como "Time 1" desde o primeiro carregamento, sem trocar de "Time A" para "Time 1"

  Cenário: Montar times com números
    Dado que escolhi números
    Quando abro "/game-days/{id}/teams"
    Então o seletor de cada jogador oferece "Time 1", "Time 2", "Time 3" e "Reserva"
    E ao salvar, o jogador vai para o time gravado como "A", "B" ou "C"
```

---

## F3. Atalho flutuante para a partida ao vivo

### Objetivo

Com uma pelada rolando, o organizador às vezes sai do painel (confere um pagamento, abre o ranking) e perde tempo para voltar. Fora do painel, um cartão flutuante mostra a partida em curso e leva de volta ao painel em um toque.

### Arquivos

- `src/app/api/game-days/live-now/route.ts` (novo). Segmento estático: tem prioridade sobre `[id]` no App Router.
- `src/components/LiveNowBanner.tsx` + `src/hooks/useLiveNowBanner.ts` (novos).
- `src/components/AppShell.tsx`: renderiza o atalho.

### Passos

1. **Endpoint leve.** `GET /api/game-days/live-now` com `requireAdmin()` (D5 = A). Uma consulta só, **sem** chamar `buildLiveSnapshot` nem `syncMatchClock` (que gravam no banco):
   ```ts
   prisma.gameDay.findFirst({
     where: { status: "LIVE" /* D5 = B: , createdById: user.id */ },
     orderBy: { scheduledAt: "desc" },
     select: {
       id: true,
       title: true,
       matches: {
         where: { status: { not: "FINISHED" } },
         orderBy: { orderIndex: "asc" },
         take: 1,
         select: {
           id: true, orderIndex: true, status: true, homeScore: true, awayScore: true,
           homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
         },
       },
     },
   });
   ```
   Resposta: `{ live: null }` ou `{ live: { gameDayId, title, match: { id, orderIndex, status, homeName, awayName, homeScore, awayScore } | null } }`. Com D6 = B, devolva `live: null` quando a partida não for `RUNNING` nem `PAUSED`. Se houver mais de uma pelada `LIVE` (raro), vale a mais recente.
2. **Hook `useLiveNowBanner`.**
   - Só roda para ADMIN/SUPERADMIN: use `useCurrentUser()` (o componente fica dentro de um `<Suspense fallback={null}>` no `AppShell`, como o `ExtraNav`). Para os outros papéis, não busca nada e não renderiza nada.
   - Busca ao montar, a cada troca de `pathname` e a cada 15s enquanto a aba estiver visível (`document.visibilityState`, ouvindo `visibilitychange`). Pare o intervalo com a aba escondida.
   - Esconde quando `pathname === /game-days/${gameDayId}/panel`.
   - Fechar (D8 = A): guarde em `sessionStorage` a chave `vc_live_banner_dismissed` com o valor `${gameDayId}:${match?.id ?? "intervalo"}`. O atalho volta quando esse valor mudar (nova partida). Com D8 = B, a chave guarda só o `gameDayId`. Envolva toda leitura e escrita de `sessionStorage` em `try/catch`.
3. **Cartão (D7 = A).**
   - Fixo: `bottom-[calc(env(safe-area-inset-bottom)+4.75rem)]` no celular (mesma altura do toast, acima da tab bar) e `sm:bottom-6 sm:right-6` no desktop, `z-35` (acima do conteúdo e da tab bar, abaixo de modais e toast). Largura `max-w-md`, centralizado no celular.
   - Conteúdo, tudo dentro de um `<Link href="/game-days/{id}/panel">` com área de toque grande:
     - bolinha `pulse-live` verde + "Ao vivo · {título da pelada}";
     - linha do jogo: "Partida 3 · Time A 1 x 0 Time B" (use `useTeamName()` de F2) e o status. "Pausada" em `text-amber-300`, para reforçar o lembrete de F1;
     - no intervalo (sem partida em curso): "Intervalo · próxima partida pronta";
     - à direita, "Voltar ao painel" com ícone `ChevronRight`.
   - Botão X separado do link (D8 = A ou B), com `aria-label="Esconder atalho da partida ao vivo"`.
   - Entrada com a animação `snack-in` que já existe.
   - O cartão não pode cobrir o fim da página: enquanto estiver visível, renderize um espaçador com a altura dele no fim do `<main>`.
4. **Com D7 = B:** faixa `sticky top-14 z-35` logo abaixo do header, mesma informação numa linha só.

### Cenários BDD

```gherkin
# language: pt
Funcionalidade: Voltar ao painel ao vivo em um toque
  Como organizador
  Quero um atalho para o painel quando saio dele com a pelada rolando
  Para não perder lances nem esquecer o cronômetro

  Contexto:
    Dado que sou organizador (ADMIN)
    E a pelada "Pelada de quinta" está ao vivo
    E a partida 3 entre Time A e Time B está em andamento, 1 x 0

  Cenário: Sair do painel mostra o atalho
    Dado que estou no painel da pelada
    Então não vejo o atalho flutuante
    Quando toco em "Ranking" na tab bar
    Então vejo um cartão acima da tab bar com "Ao vivo · Pelada de quinta"
    E a linha "Partida 3 · Time A 1 x 0 Time B · Em andamento"

  Cenário: Um toque leva de volta
    Dado que o atalho está aparecendo na página de Ranking
    Quando toco no cartão
    Então volto para "/game-days/{id}/panel"
    E o atalho some

  Cenário: Partida pausada chama atenção
    Dado que a partida 3 está pausada
    Quando estou na página de Perfil
    Então o atalho mostra "Pausada" em amarelo

  Cenário: No intervalo entre partidas (D6 = A)
    Dado que a partida 3 acabou e a partida 4 ainda não começou
    Quando estou na página de Peladas
    Então o atalho mostra "Intervalo · próxima partida pronta"

  Cenário: Fechar até a próxima partida (D8 = A)
    Dado que o atalho está aparecendo durante a partida 3
    Quando toco no X do atalho
    Então ele some
    E continua escondido enquanto navego pelo app durante a partida 3
    Quando a partida 4 começa
    Então o atalho volta a aparecer

  Cenário: Jogador comum não vê o atalho
    Dado que estou logado como jogador (USER)
    Quando navego pelo app com a pelada ao vivo
    Então não vejo o atalho
    E o app não chama "/api/game-days/live-now"

  Cenário: Pelada encerrada
    Dado que o organizador tocou em "Encerrar pelada"
    Quando a próxima atualização do atalho acontece (até 15 segundos)
    Então o atalho some

  Cenário: Toast por cima do atalho
    Dado que o atalho está aparecendo na página da pelada
    Quando confirmo um pagamento e aparece o toast "Pagamento de Léo confirmado."
    Então o toast fica por cima do atalho
    E quando o toast some, o atalho continua lá

  Cenário: Endpoint protegido
    Dado que estou logado como jogador (USER)
    Quando chamo "GET /api/game-days/live-now"
    Então recebo 403
```

---

## F4. Modal do time na fila

### Objetivo

No painel, os selos da seção "Fila" ("1º · Time C") viram botões. Tocar abre um modal com o elenco do time e o que ele fez nesta pelada: partidas jogadas, vitórias, empates, derrotas, e contra quem ganhou ou perdeu.

### Arquivos

- `src/lib/team-record.ts` + `tests/team-record.test.ts` (novos, módulo puro).
- `src/services/team-summary.ts` (novo).
- `src/app/api/game-days/[id]/teams/[teamId]/route.ts` (novo, D9 = A).
- `src/components/ui/Modal.tsx` (novo, também usado em F5).
- `src/components/live/TeamSummaryModal.tsx` + `src/hooks/useTeamSummary.ts` (novos).
- `src/components/live/LivePanel.tsx` e, com D10 = A, `src/components/live/LiveBoard.tsx`.

### Passos

1. **Módulo puro `team-record.ts`.**
   ```ts
   export type FinishedMatchRow = {
     id: string; orderIndex: number;
     homeTeamId: string; awayTeamId: string;
     homeScore: number; awayScore: number;
     result: "HOME" | "AWAY" | "DRAW" | null;
   };
   export type TeamRecord = { played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number };
   export type TeamHistoryEntry = {
     matchId: string; orderIndex: number; opponentTeamId: string;
     goalsFor: number; goalsAgainst: number; outcome: "WIN" | "DRAW" | "LOSS";
   };
   export function summarizeTeam(teamId: string, matches: FinishedMatchRow[]): { record: TeamRecord; history: TeamHistoryEntry[] };
   ```
   Considere só as partidas em que o time jogou. `result` nulo ou `"DRAW"` conta como empate, igual às `standings` de `buildLiveSnapshot`. Histórico em ordem de `orderIndex`. Testes: time sem jogos; vitória como mandante; derrota como visitante; empate; três partidas misturadas com outros times.
   Depois, troque o laço das `standings` em `src/services/live.ts` para usar `summarizeTeam`, mantendo a mesma ordenação. Assim a tabela "Como estão os times" e o modal nunca divergem.
2. **Serviço `buildTeamSummary(gameDayId, teamId)`.** Busca o time (404 "Time não encontrado." se não for desta pelada), o elenco atual (`TeamPlayer` com nome, apelido e foto, goleiro primeiro e depois por nome, como `toLiveTeam`), a posição na fila (`queuePosition`), os nomes de todos os times da pelada e as partidas `FINISHED`. Devolve:
   ```ts
   {
     team: { id, name, queuePosition: number | null },
     players: { userId, name, photoUrl, isKeeper }[],
     record: TeamRecord,
     history: (TeamHistoryEntry & { opponentName: string })[],
   }
   ```
   "Elenco atual" é o `TeamPlayer`, que já reflete as trocas "até o fim da pelada". Nome exibido: apelido, senão nome, senão username, como o `displayName` de `live.ts`.
3. **Endpoint.** `GET /api/game-days/[id]/teams/[teamId]` com `requireUser()`.
4. **`ui/Modal.tsx`.** Encapsule o padrão de modal descrito na seção 1 (fundo, folha no celular, Esc, clique no fundo, `aria-labelledby`, botão X). Props: `open`, `onClose`, `title`, `children`, `className?`. Exporte em `src/components/ui/index.ts`. **Não** refatore os modais existentes nesta tarefa.
5. **`TeamSummaryModal`.** Usa `useTeamSummary(gameDayId, teamId)` (fetch ao abrir, estados de carregando e de erro como no `PlayerModalProvider`). Layout:
   - Título: bolinha com a cor do time + `<TeamName>` + selo "2º na fila".
   - **Resumo:** quatro blocos pequenos: J, V, E, D, e abaixo "Gols: 5 pró, 3 contra".
   - **Jogadores:** avatar + nome, "Goleiro" como subtítulo. Linhas **não** clicáveis (evita modal sobre modal).
   - **Nesta pelada:** uma linha por partida, por exemplo:
     - "Partida 2 · Venceu o Time B por 2 x 1" (verde)
     - "Partida 4 · Perdeu para o Time D por 0 x 2" (rose)
     - "Partida 5 · Empatou com o Time A, 1 x 1" (slate)
   - Sem partidas: "Ainda não jogou nesta pelada."
6. **Fila clicável.** Em `LivePanel` (e em `LiveBoard` com D10 = A), troque cada `Badge` da fila por um `<button type="button">` com o mesmo visual, `touch-target`, `aria-label="Ver Time C, 1º na fila"` (usando `useTeamName`). Guarde o `teamId` aberto num estado do hook (`useLivePanel` / estado local no `LiveBoard`). No painel, inclua esse modal no cálculo de `modalOpen`.

### Cenários BDD

```gherkin
# language: pt
Funcionalidade: Ver o retrospecto de um time da fila
  Como organizador (ou espectador)
  Quero tocar num time da fila e ver quem joga nele e como ele foi na pelada
  Para saber o que esperar da próxima partida

  Contexto:
    Dado que a pelada "Pelada de quinta" está ao vivo com os times A, B, C e D
    E já terminaram as partidas:
      | partida | mandante | visitante | placar | resultado  |
      | 1       | A        | B         | 2 x 1  | A venceu   |
      | 2       | A        | C         | 0 x 2  | C venceu   |
      | 3       | C        | D         | 1 x 1  | empate     |
    E a fila está "1º · Time A", "2º · Time C"
    # A ordem da fila aqui é só ilustrativa; no teste real, monte a pelada e confira o que o motor de fila produzir.

  Cenário: Abrir o time da fila
    Dado que estou no painel da pelada
    Quando toco em "1º · Time A" na seção Fila
    Então abre um modal com o título "Time A" e o selo "1º na fila"
    E vejo os jogadores do Time A, com o goleiro primeiro
    E vejo o resumo "J 2 · V 1 · E 0 · D 1"
    E vejo "Gols: 2 pró, 3 contra"
    E vejo "Partida 1 · Venceu o Time B por 2 x 1"
    E vejo "Partida 2 · Perdeu para o Time C por 0 x 2"

  Cenário: Empate no histórico
    Quando toco em "2º · Time C"
    Então vejo "Partida 2 · Venceu o Time A por 2 x 0"
    E vejo "Partida 3 · Empatou com o Time D, 1 x 1"

  Cenário: Time que ainda não jogou
    Dado que o Time E está na fila e não jogou nenhuma partida
    Quando toco em "Time E" na fila
    Então vejo os jogadores do Time E
    E vejo "J 0 · V 0 · E 0 · D 0"
    E vejo "Ainda não jogou nesta pelada."

  Cenário: Troca permanente aparece no elenco
    Dado que "Léo" saiu do Time A para o Time C com a opção "Até o fim da pelada"
    Quando abro o modal do Time C
    Então "Léo" aparece entre os jogadores do Time C

  Cenário: Respeita a preferência de números (F2)
    Dado que escolhi ver os times como números
    Quando toco em "1º · Time 1" na fila
    Então o modal mostra "Time 1" e "Venceu o Time 2 por 2 x 1"

  Cenário: Fechar o modal
    Dado que o modal do Time A está aberto
    Quando toco fora do modal, aperto Esc ou toco no X
    Então o modal fecha e o painel volta a responder

  Cenário: Espectador também abre (D10 = A)
    Dado que sou jogador e estou em "/game-days/{id}/live"
    Quando toco em "1º · Time A" na fila
    Então vejo o mesmo modal, só para leitura

  Cenário: Time de outra pelada
    Quando chamo "GET /api/game-days/{id}/teams/{teamId de outra pelada}"
    Então recebo 404 com "Time não encontrado."
```

---

## F5. Pagamentos em modal

### Objetivo

Na página `/game-days/[id]`, a lista de pagamentos do organizador ocupa muito espaço sempre aberta. Ela vira um botão "Pagamentos" que abre a mesma lista num modal.

### Arquivos

- `src/components/gameday/PaymentList.tsx`: passa a renderizar botão + modal.
- `src/hooks/usePaymentList.ts`: ganha o estado `open`.
- `src/app/(app)/game-days/[id]/page.tsx`: só muda se D11 = B.

### Passos

1. Mantenha o nome e as props de `PaymentList` (`gameDayId`, `rows`), para a página não mudar com D11 = A.
2. Em `usePaymentList`, adicione `open`, `openModal` e `closeModal`. Não feche o modal depois de confirmar, recusar ou desfazer: o organizador costuma conferir vários pagamentos seguidos. O `router.refresh()` que já existe atualiza `rows` com o modal aberto.
3. **Botão (D11 = A):** `Button variant="secondary" size="lg" className="w-full"` com ícone `Wallet` (lucide), texto "Pagamentos" e, à direita, um `Badge`:
   - `tone="warn"` "3 aguardando" quando houver pendentes;
   - `tone="good"` "tudo conferido" quando não houver;
   - `tone="neutral"` "ninguém inscrito" quando `rows` estiver vazio.
4. **Modal:** use o `ui/Modal` de F4 (se F5 for feito antes de F4, crie o `ui/Modal` aqui). Título "Pagamentos", subtítulo com o mesmo selo, corpo com a lista atual sem mudanças (mesmas linhas, mesmos botões, mesmo comprovante), `max-h-[85dvh]` com rolagem interna. O `window.prompt` do motivo da recusa continua funcionando com o modal aberto.
5. **D11 = B:** o botão vai para a grade de botões do admin (junto de "Refazer times" e "Editar pelada"), que passa a ter três itens. Ajuste para `sm:grid-cols-3`.

### Cenários BDD

```gherkin
# language: pt
Funcionalidade: Pagamentos num modal
  Como organizador
  Quero abrir os pagamentos só quando precisar
  Para a página da pelada ficar mais limpa

  Contexto:
    Dado que sou organizador
    E a pelada tem 12 inscritos, 3 com pagamento aguardando

  Cenário: Botão no lugar da lista
    Quando abro "/game-days/{id}"
    Então não vejo a lista de pagamentos aberta
    E vejo o botão "Pagamentos" com o selo "3 aguardando"

  Cenário: Abrir e conferir vários pagamentos
    Quando toco em "Pagamentos"
    Então abre um modal com os 12 inscritos, forma de pagamento e situação
    Quando confirmo o pagamento de "Léo"
    Então aparece o toast "Pagamento de Léo confirmado."
    E o modal continua aberto, com "Léo" como "Confirmado"
    E o selo passa a mostrar "2 aguardando"

  Cenário: Recusar com motivo
    Dado que o modal de pagamentos está aberto
    Quando toco em recusar o pagamento de "Rafa"
    E informo o motivo "Comprovante ilegível"
    Então "Rafa" aparece como "Recusado"

  Cenário: Ver comprovante
    Dado que o modal está aberto e "Léo" enviou comprovante
    Quando toco no ícone de comprovante de "Léo"
    Então o comprovante abre numa nova aba

  Cenário: Tudo conferido
    Dado que todos os pagamentos estão confirmados
    Então o botão "Pagamentos" mostra o selo "tudo conferido"

  Cenário: Fechar
    Dado que o modal de pagamentos está aberto
    Quando toco fora, aperto Esc ou toco no X
    Então o modal fecha

  Cenário: Jogador comum não vê o botão
    Dado que sou jogador
    Quando abro "/game-days/{id}"
    Então não vejo o botão "Pagamentos"
    E continuo vendo a lista "Quem vai"
```

---

## F6. "Refazer times" desabilitado depois do início

### Objetivo

Depois que a primeira partida começa, os times não podem mais ser refeitos (o servidor já recusa em `assertTeamsEditable`, em `src/services/teams.ts`, e a tela `/teams` mostra um aviso). O botão "Refazer times" da página da pelada passa a aparecer desabilitado nesse caso, em vez de levar a uma tela que só diz "não dá".

### Arquivos

- `src/app/(app)/game-days/[id]/page.tsx`.

### Passos

1. Use a **mesma regra do servidor**: travado quando a pelada está `FINISHED` ou existe alguma partida com status diferente de `SCHEDULED`. Na consulta da página, adicione:
   ```ts
   matches: { where: { status: { not: "SCHEDULED" } }, select: { id: true }, take: 1 },
   ```
   e calcule `const teamsLocked = gameDay.status === "FINISHED" || gameDay.matches.length > 0;`.
2. **Cuidado:** um `<Button disabled>` dentro de `<Link>` continua navegando. Quando `teamsLocked`, renderize o botão **sem** o `<Link>`, com `disabled` e `aria-disabled="true"`. Quando não estiver travado, mantenha o `<Link>` como hoje.
3. Com D12 = A, abaixo da grade de botões: `<p className="text-xs text-slate-500">Os times ficam travados depois que a primeira partida começa.</p>`, só quando `teamsLocked`.
4. "Editar pelada" não muda.

### Cenários BDD

```gherkin
# language: pt
Funcionalidade: Travar "Refazer times" depois do início
  Como organizador
  Quero ver claramente que os times não podem mais mudar
  Para não perder tempo abrindo uma tela que não deixa refazer

  Cenário: Antes da primeira partida
    Dado que os times foram sorteados e nenhuma partida começou
    Quando abro "/game-days/{id}"
    Então o botão "Refazer times" está habilitado
    E tocar nele abre "/game-days/{id}/teams"

  Cenário: Depois que a primeira partida começa
    Dado que o organizador tocou em "Iniciar partida" na partida 1
    Quando abro "/game-days/{id}"
    Então o botão "Refazer times" aparece desabilitado
    E tocar nele não muda de página
    E vejo "Os times ficam travados depois que a primeira partida começa."

  Cenário: Pelada encerrada
    Dado que a pelada foi encerrada
    Então o botão "Refazer times" aparece desabilitado

  Cenário: Sem times ainda
    Dado que a pelada ainda não tem times
    Então vejo o botão "Montar times" habilitado

  Cenário: Acesso direto pela URL continua protegido
    Dado que a partida 1 já começou
    Quando abro "/game-days/{id}/teams" digitando o endereço
    Então vejo "A pelada já começou. Os times ficam como estão até o fim do dia."
```

---

## 9. Ordem de execução e commits

Trabalhe numa branch nova a partir do `main`: `feat/melhorias-painel-e-pelada`. A ordem vai do mais simples ao mais transversal; F2 vem antes de F3 e F4 para que os componentes novos já nasçam usando `TeamName`.

| # | Funcionalidade | Commit sugerido |
| --- | --- | --- |
| 1 | F6 | `feat(gameday): desabilita refazer times depois do inicio` |
| 2 | `ui/Modal` + F5 | `feat(ui): modal reutilizavel` e `feat(gameday): pagamentos em modal` |
| 3 | F1 | `feat(live): destaca retomar depois do gol` |
| 4 | F2 | `feat(prefs): times em letras ou numeros` e `test(prefs): rotulo dos times` |
| 5 | F4 | `feat(live): retrospecto do time da fila` e `test(live): resumo do time` |
| 6 | F3 | `feat(live): atalho flutuante para o painel ao vivo` |

Commits pequenos, mensagens em português no estilo do histórico (`feat(live): ...`). **Não faça push nem abra PR**; o Gabriel revisa antes.

**Não inclua nos commits** arquivos fora do escopo que já estão modificados ou não rastreados no working tree: a linha `dev:docker` no `package.json`, `docs/jornada-autenticacao-ate-inscricao.md`, `docs/plano-cache-e-compressao-foto.md`, `docs/prompt-substituicao-rapida.md`, `docs/verificacao-substituicao/` e este plano. Use `git add` com caminhos explícitos.

---

## 10. Verificação

Ao final de cada funcionalidade:

1. `npm run typecheck` sem erros.
2. `npm test` passando (incluindo os testes novos `team-label` e `team-record`).
3. No navegador, com o dev server da configuração `voacraque-dev` de `.claude/launch.json`, percorra os cenários BDD da funcionalidade. Tire screenshots dos estados principais e salve em `docs/verificacao-melhorias/` (ex.: `f1-retomar-destacado.png`, `f3-atalho-pausada.png`, `f4-modal-time.png`, `f5-modal-pagamentos.png`, `f6-refazer-desabilitado.png`). Teste em largura de celular (375px), que é o uso real.

Ambiente local (Windows):

- O Postgres nativo ocupa a porta 5432. Suba o banco do Docker na 5433 (`VOACRAQUE_DB_PORT=5433 docker compose -f docker-compose.dev.yml up -d db`) e aponte `DATABASE_URL` para ela num `.env.local`. Se `docker ps` falhar (o Docker Desktop costuma estar fechado), avise o Gabriel em vez de mexer no Postgres nativo.
- O `.env` usa SMTP real. Nada desta tarefa manda e-mail, mas se precisar de algum fluxo de conta, use `MAIL_DRIVER=console`.
- O banco de dev tem só o ADMIN `adminteste` (sem SUPERADMIN). Para testar como jogador comum, use um usuário USER existente ou o seed `npm run db:seed:pelada-teste`.
- Para F1 e F3, use duas abas: uma no painel e outra navegando pelo app (e, em F1, para simular "outro aparelho retoma").

---

## 11. Fora do escopo

Anote no relatório se achar que algum destes merece uma tarefa própria, mas não implemente:

- Refatorar os modais existentes (`GoalAssistModal`, `SubstitutionModal`, `ChangePasswordModal`, `PlayerModalProvider`) para usar o `ui/Modal` novo.
- Tornar clicáveis os times **em quadra** (só os da fila entram nesta tarefa).
- Traduzir para números os textos gerados no servidor (auditoria, mensagens de erro).
- Vibração ou som no destaque do "Retomar".
- Página de configurações completa; só a preferência de times entra agora.

---

## 12. Relatório final

Ao terminar, entregue ao Gabriel:

1. Quais decisões da seção 2 foram seguidas (e, se alguma não pôde ser, por quê).
2. Lista de commits.
3. Para cada funcionalidade: cenários BDD verificados no navegador, com os screenshots, e qualquer cenário que não passou, com o motivo.
4. Decisões de implementação tomadas por conta própria.
5. Limitações conhecidas (ex.: textos do servidor continuam em letras).
6. Sugestões de próximas tarefas.
