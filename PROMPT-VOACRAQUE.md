# Prompt de execução — Voa Craque

Este arquivo tem duas partes: as decisões que precisei assumir (revise e edite) e o prompt final pronto para enviar.

---

## Parte 1 — Decisões assumidas (edite o que discordar)

| # | Ponto em aberto na sua descrição | Decisão assumida |
|---|---|---|
| 1 | Autenticação | Auth.js v5 (NextAuth) com provider de credenciais, senha em bcrypt, sessão por cookie JWT |
| 2 | ORM / migrations | Prisma com migrations versionadas |
| 3 | Tempo real | SSE (Server-Sent Events) em rota do App Router, com fallback de polling a cada 3s |
| 4 | Upload de comprovante e foto | Arquivo em volume Docker, servido por route handler autenticado; JPEG/PNG/WebP até 5 MB |
| 5 | Estrelas de habilidade | Escala de 1 a 5 com incremento de 0,5; nasce `null` |
| 6 | Tamanho do time | 5 jogadores (futsal); 20 inscritos viram 4 times |
| 7 | Sobra de jogadores | Vira lista de reservas da pelada, entra nas trocas entre partidas |
| 8 | Fim da partida | Termina por gols (padrão 2) ou por fim do cronômetro, o que vier primeiro |
| 9 | Empate no fim do tempo | Os dois times saem e vão para o fim da fila; entram os dois próximos |
| 10 | Classificação das skills | Positivas: titã, brocador, garçom, raçudo, diferenciado. Negativas: ensaboado, ele se esforça, não marca, piter, açougueiro |
| 11 | Preço | Padrão R$ 4,50 por jogador, editável por pelada |
| 12 | Superadmin inicial | Criado pelo seed a partir de variáveis de ambiente |
| 13 | Testes | Vitest cobrindo o algoritmo de sorteio e a máquina de estados da partida; o resto sem teste automatizado |
| 14 | Idioma | Interface em português do Brasil; código, tabelas e identificadores em inglês |

---

## Parte 2 — Prompt final

### System prompt

```xml
<role>
Você é um engenheiro full-stack sênior especializado em Next.js, TypeScript e PostgreSQL,
construindo do zero uma aplicação web para gestão de peladas de futsal universitário.
</role>

<tone_preference>
Mantenha as saídas razoavelmente concisas.
</tone_preference>
```

### Mensagem

```xml
<context>
O projeto se chama "Voa Craque" e começa de uma pasta vazia em C:\Users\gabri\Documents\Projetos\voacraque.
Não existe código, banco nem design anteriores. Você decide toda a arquitetura.

O público são alunos de graduação (cursos LCC e SI) que organizam peladas de futsal recorrentes.
Três coisas moldam as decisões de produto:

1. O uso principal é no celular, dentro da quadra, com a mão suja e pouco tempo. O painel ao vivo
   do organizador precisa ser operável com o polegar, com alvos de toque grandes e sem confirmações
   desnecessárias. É por isso que ações de gol e assistência usam snackbar com desfazer em vez de
   diálogo de confirmação.
2. O organizador digita estatística enquanto a partida acontece. Erro de digitação é frequente e
   precisa ser reversível em segundos, sem sair da tela.
3. Quem está esperando na fila acompanha pelo próprio celular. A tela de acompanhamento é leitura
   pura e precisa refletir placar, cronômetro e eventos em poucos segundos.

O sistema é pequeno em escala — dezenas de usuários, uma instância — mas precisa de trilha de
auditoria completa, porque estatística de pelada gera discussão e o superadmin precisa conseguir
provar quem alterou o quê.
</context>

<scope>
Entregue o que foi pedido, no escopo pretendido. Tome as decisões de rotina sozinho e me consulte
só quando leituras diferentes do pedido levariam a trabalhos materialmente diferentes. Se o pedido
parecer equivocado ou existir abordagem melhor, diga isso em uma frase e siga com a tarefa como
pedida, em vez de estreitar, ampliar ou transformar o escopo em silêncio. Termine a tarefa inteira
e pare antes de ações claramente além do que foi pedido.

Dentro do escopo:
- Projeto Next.js (App Router) com TypeScript, do zero, rodando em Docker Compose junto com PostgreSQL.
- Schema do banco, migrations e seed.
- Autenticação, três papéis (superadmin, admin, user) e autorização em todas as rotas e route handlers.
- As doze funcionalidades descritas em <task>.
- Interface completa em português do Brasil, responsiva, com prioridade para celular.
- README com instruções de subida e um arquivo .env.example.

Fora do escopo:
- Integração real com PIX, gateway de pagamento ou conciliação bancária. O comprovante é só um
  arquivo anexado que o admin confirma na mão.
- Envio de e-mail, push, recuperação de senha por e-mail e notificações externas.
- App nativo, PWA offline, deploy em nuvem, CI/CD.
- Multi-tenancy ou suporte a mais de um grupo de pelada.
</scope>

<constraints>
- Stack obrigatória: Next.js na versão estável mais recente com App Router, TypeScript em modo strict,
  PostgreSQL, tudo orquestrado por um único docker-compose.
- Use Prisma como ORM, com migrations versionadas e um script de seed.
- Use Auth.js v5 com provider de credenciais e senha em bcrypt. Autorize por papel tanto no middleware
  quanto dentro de cada route handler e server action, porque middleware sozinho não protege chamadas
  diretas à API.
- Use Tailwind CSS. Use componentes próprios ou shadcn/ui; evite outras bibliotecas de UI.
- Tempo real por SSE em um route handler do App Router, com fallback de polling. Não introduza servidor
  WebSocket separado — a aplicação roda em uma instância só.
- Nunca exponha hash de senha, e-mail de terceiros ou dados de auditoria em respostas destinadas ao papel user.
- Valide toda entrada com Zod no limite da requisição e mantenha as constraints também no banco
  (NOT NULL, UNIQUE, FK, CHECK).
- Escreva o código, os nomes de tabela e os identificadores em inglês. Escreva todo texto de interface
  em português do Brasil.
- Mantenha regra de negócio fora dos componentes React e dos route handlers: coloque em módulos de
  serviço puros em src/lib ou src/services, testáveis sem subir a aplicação.
- Quando faltar informação que não muda a arquitetura, assuma o valor mais simples e registre a suposição
  numa seção do README. Pergunte apenas quando a escolha mudaria o modelo de dados.
</constraints>

<examples>
  <example>
    <input>
    Sorteio de times: 20 inscritos confirmados, estrelas entre 2 e 5, alturas entre 1,62 m e 1,93 m.
    A pelada está configurada para 5 jogadores por time.
    </input>
    <output>
    Gera 4 times de 5. A força de cada jogador é dominada pelas estrelas, com ajuste menor por altura e peso.
    O algoritmo distribui por snake draft sobre a lista ordenada por força e depois roda trocas de pares
    enquanto elas reduzirem a diferença entre o time mais forte e o mais fraco. A tela mostra a força média
    de cada time para o admin conferir, e um botão para sortear de novo.
    </output>
  </example>
  <example>
    <input>
    Caso de borda: 7 dos 20 inscritos ainda estão com estrelas null porque o admin não avaliou.
    </input>
    <output>
    Esses jogadores entram no sorteio com a mediana das estrelas do grupo e recebem marcação visual de
    "não avaliado" no card do time. O admin vê um aviso acima do botão de sortear dizendo quantos jogadores
    estão sem avaliação, e o sorteio acontece mesmo assim.
    </output>
  </example>
  <example>
    <input>
    Caso de borda: 18 confirmados, 5 por time. Sobram 3 jogadores.
    </input>
    <output>
    Monta 3 times de 5 e coloca os 3 restantes como reservas da pelada, listados abaixo dos times.
    O admin pode mover um reserva para dentro de qualquer time na montagem manual.
    </output>
  </example>
  <example>
    <input>
    Partida A x B termina 1 x 1 porque o cronômetro zerou antes de alguém chegar a 2 gols.
    A fila é [C, D].
    </input>
    <output>
    Os dois times saem. A partida é registrada como empate: ambos ganham uma partida jogada, nenhum
    ganha partida vencida. A fila passa a ser [C, D, A, B] e a próxima partida é C x D. A tela mostra
    "Empate — os dois saem" e o botão "Próxima partida".
    </output>
  </example>
  <example>
    <input>
    Admin toca no ícone de gol do jogador errado e toca em "Desfazer" no snackbar 2 segundos depois.
    </input>
    <output>
    O evento de gol é removido, o placar volta ao valor anterior e o total do jogador é recalculado.
    Quem acompanha pela tela de espectador recebe a reversão pelo mesmo canal de tempo real.
    O log de auditoria guarda tanto a criação quanto a remoção do evento.
    </output>
  </example>
</examples>

<autonomy>
Considere a reversibilidade e o impacto de cada ação. Criar e editar arquivos do projeto, rodar
migrations no banco local do compose, rodar build e rodar testes: siga direto, sem perguntar.

Peça confirmação antes de:
- Apagar arquivos ou diretórios que você não criou nesta execução
- Rodar prisma migrate reset, dropar o banco ou remover volumes do Docker
- Qualquer git init, commit, push ou criação de repositório remoto
- Instalar algo fora da stack definida em <constraints>

Não delegue esta tarefa a subagentes. Ela é um projeto único e coeso, em que as partes compartilham
schema e tipos; dividir entre agentes gera retrabalho de integração.
</autonomy>

<instructions>
1. Escreva o schema Prisma inteiro primeiro: usuários e papéis, perfil de jogador, skills, peladas,
   inscrições e pagamentos, times, fila de times, partidas, eventos de partida, configurações do
   sistema e log de auditoria. Gere a migration inicial e o seed com o superadmin, a lista de skills
   e alguns jogadores de exemplo.
2. Implemente autenticação e autorização: cadastro, login, middleware de sessão, guarda por papel e
   o fluxo de onboarding que força o preenchimento do perfil no primeiro acesso.
3. Implemente o log de auditoria como uma função de serviço única chamada por toda mutação relevante,
   e a página de consulta do superadmin com filtro por ator, entidade, ação e período.
4. Implemente a gestão de peladas, inscrição, pagamento e confirmação manual.
5. Implemente o algoritmo de balanceamento em um módulo puro, com testes Vitest cobrindo os casos de
   estrelas null, sobra de jogadores e distribuição de goleiros. Depois ligue a montagem manual.
6. Implemente a máquina de estados da partida em um módulo puro, também com testes: iniciar, pausar,
   retomar, marcar gol, marcar assistência, desfazer, encerrar por gols, encerrar por tempo, empate,
   rotação de fila e próxima partida.
7. Ligue a máquina de estados ao painel ao vivo do admin e à tela de espectador pelo canal SSE.
8. Implemente ranking, modal de jogador e o encerramento da pelada.
9. Finalize o Dockerfile, o docker-compose, o .env.example e o README. O critério de pronto é:
   `docker compose up` sobe o banco, aplica as migrations, roda o seed e serve a aplicação; é possível
   logar como superadmin, criar uma pelada, inscrever jogadores, sortear times, rodar uma partida
   inteira com gols e desfazer, ver a partida em tempo real numa segunda aba e encerrar a pelada.
</instructions>

<output_format>
Antes da primeira chamada de ferramenta, diga em uma frase o que você vai fazer. Durante o trabalho,
dê atualização breve só quando encontrar algo importante ou mudar de direção. Ao terminar, comece pelo
resultado: o que foi construído e como rodar, com o detalhe de apoio depois.

Resposta final ao usuário: até 400 palavras, começando pelo comando de subida, seguido pelas credenciais
do seed, pela lista de decisões de arquitetura que valem revisão e por qualquer coisa que ficou faltando.

Arquivos escritos em disco: ajuste o tamanho ao que a tarefa exige. Cubra a substância, sem encher com
seções de enchimento, resumos redundantes ou boilerplate. O README cobre subida, variáveis de ambiente,
papéis, suposições assumidas e como rodar os testes, nada além disso.
</output_format>

<task>
Construa a aplicação "Voa Craque" por inteiro, com as funcionalidades abaixo.

## Papéis

- superadmin: um único usuário, criado pelo seed. Gerencia aspectos do sistema, liga e desliga o acesso
  público ao site (quando desligado, todo mundo exceto ele vê uma página de manutenção) e consulta o log
  de auditoria. O log registra criação de usuário, alteração de dados de usuário, criação e edição de
  pelada, confirmação de pagamento, sorteio e montagem de times, eventos de partida e desfazimentos,
  encerramento de pelada e mudanças de papel. Cada registro guarda ator, ação, entidade, id da entidade,
  diferença antes/depois, IP, user agent e data e hora.
- admin: organizadores da pelada. Criam e gerenciam peladas, confirmam pagamentos, definem estrelas e
  skills dos jogadores, montam e sorteiam times e operam o painel ao vivo.
- user: os demais alunos. Editam o próprio perfil, se inscrevem em peladas, acompanham a partida ao vivo
  e consultam o ranking.

## Funcionalidades

1. Criar conta e fazer login.

2. No primeiro login, o usuário é levado a completar o perfil de jogador antes de acessar o resto do site:
   foto, pé que chuta, posição preferida no futsal, idade, altura, peso e curso (LCC, SI ou outro).
   As estrelas de habilidade nascem null e só o admin define. O admin também atribui skills e contra-skills
   a partir desta lista fixa: ensaboado, titã, brocador, garçom, ele se esforça, raçudo, não marca,
   diferenciado, piter, açougueiro.

3. O admin cria uma pelada com data, hora, local, preço por jogador (padrão R$ 4,50), duração das partidas,
   número de gols que encerra a partida (padrão 2) e número máximo de jogadores (padrão 20).

4. Qualquer usuário se inscreve na pelada e escolhe pagar por PIX, anexando comprovante, ou pagar no local.
   O admin confirma o recebimento manualmente. A inscrição tem status de pagamento visível para o próprio
   jogador e para o admin.

5. O admin sorteia os times com um algoritmo de equilíbrio baseado em estrelas, altura e peso. Mostre a
   força resultante de cada time e permita sortear de novo.

6. O admin também pode montar os times manualmente, movendo jogadores entre times e reservas.

7. Depois que os times de uma pelada estão definidos (time A, B, C, D, E), abre uma seção de gestão do
   jogo ao vivo para o admin, com: cronômetro regressivo que pode ser pausado e retomado; placar; lista
   com os 5 jogadores de cada time, cada um com um ícone de bola de futebol brilhante para gol e um ícone
   de assistência. Ao tocar em gol ou assistência, sobe um snackbar de 4 segundos com botão "Desfazer",
   para reverter a ação em caso de erro. Quando um time atinge o número de gols configurado, ele vence,
   as estatísticas são contabilizadas e aparece a opção "Próxima partida"; ao tocar nela, a tela volta
   zerada com os novos times e um botão "Iniciar partida".

8. Os demais usuários acompanham a partida em andamento em tempo real pelo site: eventos, placar,
   cronômetro e estatísticas.

9. Em um ponto da interface que você julgar conveniente pelo seu próprio critério de design, o admin tem a
   opção "Encerrar pelada", que encerra a pelada do dia: a fila das próximas equipes é zerada, as
   estatísticas são contabilizadas e não é mais possível iniciar partidas nem acompanhar ao vivo.

10. Regra de negócio: quando dois times empatam, os dois saem, e as duas próximas equipes da lista de
    espera entram para jogar.

11. Ranking de jogadores, com gols, assistências, partidas jogadas, partidas vencidas, taxa de vitória e
    as demais estatísticas que fizerem sentido a partir dos dados registrados. Ordenável por coluna.

12. Ao tocar no nome ou no ícone de um jogador no ranking ou em qualquer outra parte do site, abre um modal
    com as informações dele: foto, nome, altura, idade, peso, estrelas e skills/contra-skills. O painel de
    gestão do jogo ao vivo é a única exceção: lá o toque no jogador registra gol ou assistência, não abre modal.

## Stack

Next.js na versão estável mais recente com TypeScript e PostgreSQL, tudo dockerizado em um docker-compose.
</task>
```
