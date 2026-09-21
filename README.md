# Voa Craque

Gestão das peladas de futsal: inscrição com pagamento, sorteio de times equilibrados,
painel ao vivo operável com o polegar e ranking. Next.js 16 (App Router) + TypeScript +
PostgreSQL, tudo em um `docker compose`.

## Subir

```bash
docker compose up --build
```

Isso levanta o Postgres, aplica as migrations, roda o seed e serve a aplicação em
http://localhost:3000. O seed é idempotente: subir de novo não duplica nada.

Credenciais criadas pelo seed:

| Papel | E-mail | Senha |
| --- | --- | --- |
| Superadmin | `super@voacraque.app` | `VoaCraque123!` |
| Organizador | `organizador@voacraque.app` | `VoaCraque123!` |
| Jogadores (20) | `nome.sobrenome@voacraque.app` | `VoaCraque123!` |

Os jogadores de exemplo seguem o padrão do nome, como `gabriel.marques@voacraque.app`.
Eles já estão inscritos na pelada "Pelada de quinta", pronta para sortear os times.

### Desenvolvimento

```bash
cp .env.example .env
docker compose up -d db
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

## Variáveis de ambiente

Estão todas em `.env.example`, com valores que funcionam sem edição.

| Variável | Para que serve |
| --- | --- |
| `DATABASE_URL` | Conexão do Postgres usada pelo Prisma fora do compose |
| `VOACRAQUE_DB_USER` / `_PASSWORD` / `_NAME` | Credenciais do container do banco |
| `VOACRAQUE_DB_PORT` | Porta do banco publicada no host (padrão do arquivo: `55432`) |
| `VOACRAQUE_APP_PORT` | Porta da aplicação no host |
| `AUTH_SECRET` | Assinatura do cookie de sessão. Gere com `openssl rand -base64 32` |
| `AUTH_TRUST_HOST`, `NEXTAUTH_URL` | Origem confiável do Auth.js |
| `SUPERADMIN_EMAIL` / `_PASSWORD` / `_NAME` | Superadmin criado pelo seed |
| `SEED_SAMPLE_DATA` | `false` cria só o superadmin e as skills |
| `STORAGE_DRIVER` | `local` (volume do container) ou `s3` |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | Pasta e limite dos arquivos no driver local |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL` | Usados só quando `STORAGE_DRIVER=s3` |

O compose usa nomes próprios (`VOACRAQUE_*`) de propósito: `POSTGRES_PASSWORD` e afins
são comuns no ambiente da máquina e o Docker Compose dá precedência ao ambiente sobre
o `.env`, o que trocaria a senha do banco sem aviso.

## Papéis

**Superadmin** — um só, criado pelo seed. Liga e desliga o acesso público (com o site
desligado, todo mundo menos ele vê a página de manutenção), abre e fecha as inscrições,
muda o papel dos outros e consulta o log de auditoria.

**Organizador (admin)** — cria e edita peladas, confirma pagamento na mão, define
estrelas e skills, sorteia e monta times, opera o painel ao vivo e encerra a pelada.

**Jogador (user)** — edita o próprio perfil, se inscreve, acompanha a partida ao vivo e
vê o ranking. Não define as próprias estrelas.

A autorização é aplicada duas vezes: o proxy (`src/proxy.ts`) barra quem não tem sessão, e cada
route handler e página confere o papel de novo, porque o proxy sozinho não protege
chamada direta à API.

## Auditoria

Toda mutação relevante passa por `recordAudit` e grava ator, papel, ação, entidade, id,
diferença antes/depois, IP, user agent e data. O superadmin consulta em
`/admin/auditoria` com filtro por ator, entidade, ação e período. O encerramento
automático pela virada do cronômetro aparece com ator "Sistema".

## Suposições assumidas

1. **Quem entra no sorteio**: todo inscrito cujo pagamento não foi recusado, incluindo
   quem vai pagar no local. Excluir os pendentes deixaria de fora metade do grupo antes
   do jogo começar. O painel mostra quem ainda está devendo.
2. **Quem fica de reserva** sai no sorteio, não por força: sortear de novo troca os
   reservas. Escolher sempre os mais fracos seria constrangedor e imprevisível.
3. **Times**: no máximo cinco (A a E). Sobrando gente para um sexto time, o excedente
   vai para a reserva.
4. **Estrelas**: 1 a 5 em passos de meia estrela, nascem `null`. Jogador sem avaliação
   entra no sorteio com a mediana do grupo e aparece marcado como "sem avaliação".
5. **Força do jogador**: estrelas pesam 80%, altura 12% e peso 8%. Altura e peso saturam
   entre 1,60 m e 1,95 m e entre 55 kg e 95 kg.
6. **Equilíbrio suficiente**: o refinamento por trocas para quando a diferença entre o
   time mais forte e o mais fraco cai abaixo de 0,75 ponto. Otimizar até o fim daria
   sempre o mesmo arranjo e tiraria a graça de sortear de novo.
7. **Fim da partida**: por gols ou pelo fim do cronômetro, o que vier primeiro. Empate
   no fim do tempo tira os dois times; entram as duas próximas equipes da fila.
8. **Fim por tempo** é detectado pelo canal ao vivo, que checa o relógio a cada segundo.
   A aplicação roda em uma instância só, com trava em memória para duas conexões não
   encerrarem a mesma partida.
9. **Desfazer** um gol que encerrou a partida reabre a partida pausada, desfaz o giro da
   fila e apaga a partida seguinte que tinha sido montada. A fila anterior fica guardada
   em `Match.queueSnapshot`.
10. **Estatísticas** contam só partidas encerradas, igual ao que o painel mostra.
11. **Pagamento** não tem integração bancária: o comprovante é um arquivo anexado e o
    organizador confirma na mão. Comprovante só é visível para o dono e para os
    organizadores.
12. **Arquivos** ficam em volume local por padrão. `STORAGE_DRIVER=s3` sobe para um
    bucket da AWS; o driver local mantém o `docker compose up` funcionando sem conta na
    nuvem.
13. **Sem e-mail**: não há recuperação de senha nem redefinição pelo superadmin. Quem
    esquecer a senha precisa de uma nova conta ou de alteração direta no banco.
14. **Porta do banco**: o `.env.example` publica o Postgres em `55432` porque a máquina
    de desenvolvimento já tinha um Postgres nativo ocupando 5432. Dentro do compose a
    aplicação sempre fala com `db:5432`.

## Testes

```bash
npm test
```

Vitest cobre os dois módulos que concentram a regra de negócio, ambos puros e sem banco:

- `src/lib/team-balancer.ts` — força do jogador, mediana para quem não tem estrelas,
  distribuição de goleiros, sobra de jogadores, limite de times e variedade entre
  sorteios.
- `src/lib/match-engine.ts` — cronômetro, transições válidas e inválidas, fim por gols,
  fim por tempo, empate e rotação da fila.

Verificação de tipos:

```bash
npm run typecheck
```
