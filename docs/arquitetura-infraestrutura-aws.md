# Arquitetura de infraestrutura AWS — Voa Craque em produção

Registro da infraestrutura escolhida para colocar o Voa Craque em produção na AWS, o
raciocínio por trás de cada decisão e os componentes que a compõem. Serve como referência
para operar, revisar ou refazer esse ambiente depois.

> **Contexto da conta**: a conta AWS (`636227829069`) já tem outro sistema em produção — o
> **Cronos** (sistema de despesas), rodando via ECS num cluster (`ec2-sistema-despesas`) numa
> única EC2 `t4g.small` em `us-east-2`, com 4 serviços (`cronos-front`, `cronos-app`,
> `cronos-edge`, `cronos-data`) e Cloudflare na frente. O Voa Craque **não** compartilha essa
> instância — ver seção 1.

---

## Índice

1. [Por que uma instância separada, não um 5º serviço no ECS existente](#1-por-que-uma-instância-separada-não-um-5º-serviço-no-ecs-existente)
2. [Visão geral do fluxo de rede](#2-visão-geral-do-fluxo-de-rede)
3. [Região](#3-região)
4. [Rede e Security Group](#4-rede-e-security-group)
5. [Identidade da instância (IAM)](#5-identidade-da-instância-iam)
6. [Armazenamento de arquivos (S3)](#6-armazenamento-de-arquivos-s3)
7. [Computação (EC2)](#7-computação-ec2)
8. [Banco de dados](#8-banco-de-dados)
9. [DNS e TLS (Cloudflare)](#9-dns-e-tls-cloudflare)
10. [Deploy](#10-deploy)
11. [Estimativa de custo](#11-estimativa-de-custo)
12. [Em aberto](#12-em-aberto)
13. [Referências](#13-referências)

---

## 1. Por que uma instância separada, não um 5º serviço no ECS existente

A instância `t4g.small` que já existe está inteiramente ocupada pelo Cronos: CPU folgada
(~2,3% de uso médio), mas só 2 GB de RAM divididos entre 4 serviços, sem CloudWatch Agent
instalado (logo, sem visibilidade real de memória sobrando), sem chave SSH (acesso só via
SSM) e com o Security Group liberando só 80/443 vindos da Cloudflare — sem porta livre nem
load balancer para pendurar um 5º serviço.

O ECS suporta oficialmente rodar aplicações não relacionadas na mesma instância/cluster,
desde que se reserve CPU/memória por task ([ECS Best Practices
Guide](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/application.html)).
Mas o Well-Architected Framework recomenda o oposto quando os workloads são independentes e
um deles já é produção crítica:

- **Reliability** — arquitetura *bulkhead*: conter uma falha a um subconjunto pequeno, não
  deixar ela se propagar ([REL10-BP01](https://docs.aws.amazon.com/wellarchitected/2025-02-25/framework/rel_fault_isolation_multiaz_region_system.html)).
- Hospedar múltiplos workloads na mesma instância/load balancer "pode amplificar o raio de
  impacto de problemas de configuração e escalonamento" ([ELB Best
  Practices](https://aws.github.io/aws-elb-best-practices/reliability/workload_architecture/)).
- **Security** — separar workloads por fronteira de isolamento quando têm criticidade
  diferente ([SEC01-BP01](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_securely_operate_multi_accounts.html)).

Uma aplicação nova, sem histórico de produção, dividindo host com um sistema financeiro já
em uso é exatamente o cenário que essas práticas pedem para isolar: um pico de memória ou
tráfego do Voa Craque não pode arriscar derrubar containers do Cronos via OOM killer do
Linux. Uma segunda `t4g.small` custa pouco (seção 11) perto desse risco — por isso o Voa
Craque ganha instância, rede e IAM role próprias, sem nada compartilhado com o Cronos além
da conta AWS.

## 2. Visão geral do fluxo de rede

```
Jogador (navegador)
      │  HTTPS
      ▼
Cloudflare (proxy laranja em voacraque.gabrielmizael.com)
  - termina TLS do lado do cliente
  - só repassa tráfego que já passou pelo edge da Cloudflare
      │  HTTPS (Full strict — Cloudflare valida o cert de origem)
      ▼
EC2 t4g.small (sa-east-1) — Security Group só libera 80/443 vindos dos IPs da Cloudflare
      │
      ▼
Caddy (container) — termina TLS com certificado de origem da Cloudflare
      │  HTTP interno (rede Docker)
      ▼
app (container Next.js, porta 3000 — não publicada no host)
      │                                  │
      ▼                                  ▼
db (Postgres, container,          S3 (bucket privado)
    não publicado no host)        via IAM role da instância,
                                   URL assinada de 60s
```

Nenhum componente além do Caddy fala diretamente com a internet: `app` e `db` só existem
dentro da rede interna do `docker compose`, e a própria instância só aceita conexão de
dentro da Cloudflare — não existe IP público "cru" servindo a aplicação.

## 3. Região

**`sa-east-1` (São Paulo)**, não `us-east-2` (onde está o Cronos). Critério: latência. O
painel ao vivo da partida faz *polling* a cada segundo (ver `docs/arquitetura-modulo-autenticacao.md`
e o motor de partida em `src/lib/match-engine.ts`) e os jogadores estão no Brasil — `us-east-2`
adiciona ~120-150ms de RTT desnecessários; `sa-east-1` fica na casa de 10-40ms. O custo sobe
um pouco (`sa-east-1` costuma ser ~30-50% mais caro que regiões dos EUA), mas a diferença
absoluta é pequena para uma única `t4g.small` (seção 11).

Efeito colateral: a *managed prefix list* da Cloudflare que o Cronos já usa em `us-east-2`
não é reaproveitável (prefix lists são recursos regionais) — recriamos uma equivalente em
`sa-east-1` com os mesmos CIDRs publicados em `cloudflare.com/ips-v4`.

## 4. Rede e Security Group

- VPC e subnets: a VPC **default** da conta em `sa-east-1` (172.31.0.0/16), instância numa
  das subnets públicas (`sa-east-1a`). Não há tráfego entre o Voa Craque e a VPC do Cronos
  (regiões diferentes, sem peering) — isolamento total também na camada de rede.
- **Security Group `voacraque-sg`**: entrada liberada só em `80/tcp` e `443/tcp`, e só a
  partir de uma *managed prefix list* com os CIDRs da Cloudflare. Nenhuma porta 22 aberta.
  Saída livre (padrão), necessária para `apt`, Docker Hub/registry e as chamadas ao S3.
- Esse desenho reproduz, de propósito, o mesmo padrão que o Cronos já usa (só Cloudflare
  alcança a origem) — mantém as duas produções da conta com a mesma postura de segurança de
  borda, mesmo isoladas uma da outra.

## 5. Identidade da instância (IAM)

Em vez de chave SSH, a instância usa:

- **AWS Systems Manager Session Manager** para acesso interativo — exige só a policy
  gerenciada `AmazonSSMManagedInstanceCore` na role da instância; não abre porta nenhuma,
  as sessões são auditáveis via CloudTrail/SSM. É como o Cronos já é acessado hoje.
- Uma **role IAM** (`voacraque-ec2-role`) com uma policy inline restrita a
  `s3:PutObject`/`s3:GetObject` só no bucket de uploads do Voa Craque — nada de listar
  outros buckets da conta ou tocar em recursos do Cronos.
- O SDK da aplicação (`@aws-sdk/client-s3`) usa essa role automaticamente via IMDS: o `.env`
  de produção não carrega `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` — não existe credencial
  de longa duração para vazar.

Quando a role é criada pelo **console** com "Serviço da AWS → EC2" como entidade confiável,
o instance profile (o "envelope" que a EC2 veste para assumir a role) é criado
automaticamente com o mesmo nome da role — só via CLI/API é que são dois recursos
separados a criar manualmente ([IAM User Guide — instance
profiles](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2_instance-profiles.html)).

## 6. Armazenamento de arquivos (S3)

Bucket **privado** (Block Public Access ligado — hoje o padrão do console para todo bucket
novo), com criptografia SSE-S3 (também padrão automático da AWS desde 2023 para todo bucket)
e versionamento ligado manualmente.

Correção feita no código antes de ligar o driver `s3` (ver `src/lib/storage.ts` e
`src/app/api/files/[...path]/route.ts`): a implementação original devolvia a URL pública
direta do bucket para qualquer arquivo salvo — o que vazaria comprovante de pagamento (dado
sensível) para qualquer um com o link, contornando a checagem de dono/organizador que já
existia para o driver local. Agora os dois drivers passam pela mesma rota autenticada
`/api/files`: no driver `s3`, ela gera uma *URL assinada* (`GetObjectCommand` +
`@aws-sdk/s3-request-presigner`) válida por 60 segundos, só depois de confirmar que quem
pediu pode ver aquele arquivo.

## 7. Computação (EC2)

- **Tipo**: `t4g.small` (Graviton/ARM64, 2 vCPU, 2 GiB RAM) — mesma família que o Cronos já
  usa, dimensionamento inicial razoável para Next.js + Postgres numa aplicação pequena; CPU
  tende a sobrar (o Cronos, com 4 serviços, usa ~2% numa instância do mesmo tipo). Trocar de
  tipo depois é só parar a instância, mudar o `InstanceType` e ligar de novo.
- **AMI**: Ubuntu Server 24.04 LTS ARM64 (Canonical, conta `099720109477`) — buscada pela
  mais recente disponível em vez de fixar um ID, já que a Canonical publica novas AMIs
  regularmente (patches de segurança).
- **Disco**: 20 GiB gp3 — folga confortável para imagens Docker, o volume do Postgres e o
  código da aplicação.
- Sem par de chaves (`key-name` vazio) — acesso exclusivo via SSM.
- `user data` (cloud-init) instala Docker Engine + o plugin `docker compose` do repositório
  oficial da Docker no primeiro boot.

## 8. Banco de dados

**Postgres em container Docker na própria instância** (`docker-compose.yml`), não Amazon
RDS — decisão explícita para começar mais barato e mais simples, mantendo o mesmo modelo já
usado em desenvolvimento. Trade-off aceito conscientemente: sem failover nem backup
automático gerenciados: backup fica por conta de uma rotina própria (`pg_dump` agendado para
o S3 — ver seção 12) que ainda não está implementada. Migrar para RDS depois, se o volume de
dados ou a exigência de disponibilidade crescerem, não exige mudança de código — só o
`DATABASE_URL` muda.

## 9. DNS e TLS (Cloudflare)

- **Domínio**: `voacraque.gabrielmizael.com`, DNS já hospedado na Cloudflare.
- Registro `A` apontando para o Elastic IP da instância, com **proxy (nuvem laranja)
  ligado** — é a Cloudflare que aparece publicamente para o mundo; o IP real da instância só
  é alcançável pelos ranges dela (Security Group, seção 4).
- **Certificado de origem**: um Cloudflare Origin CA Certificate (validade de até 15 anos,
  confiável só pela própria Cloudflare — suficiente aqui porque nada além da Cloudflare
  consegue alcançar a porta 443 mesmo). Evita depender de Let's Encrypt com desafio HTTP-01,
  que exigiria abrir a porta 80 para a internet inteira (incompatível com o Security Group
  restrito).
- **Modo SSL "Full (strict)" só para esse subdomínio**, via *Configuration Rule* da
  Cloudflare com condição `Hostname equals voacraque.gabrielmizael.com` — em vez de mudar o
  modo do domínio inteiro `gabrielmizael.com`, que poderia afetar outros registros já
  existentes nele.
- Dentro da instância, o Caddy é quem termina esse TLS e faz proxy reverso para o container
  `app` na porta 3000 (interna, não publicada no host).

## 10. Deploy

Build-once, publish, pull — não build no host de produção. Todo push em `main` roda o
workflow `.github/workflows/deploy.yml`:

1. **Testes**: `npm run typecheck` + `npm test` (Vitest). Só passa daqui quem passou.
2. **Build da imagem**: a partir do `Dockerfile` existente, para `linux/arm64` (mesma
   arquitetura da `t4g.small`, via QEMU + Buildx, já que os runners do GitHub são x86_64) —
   publicada no **ECR** (`voacraque`), com duas tags: o SHA do commit e `latest`.
3. **Deploy**: o workflow autentica na AWS via **OIDC** (`voacraque-github-actions-role`,
   confiança restrita a `repo:gbrlmzl/voa-craque:*` — nenhuma access key de longa duração
   fica guardada no GitHub) e dispara `aws ssm send-command` na instância, que roda
   `git pull` (traz mudanças no `docker-compose*.yml`/`Caddyfile`/scripts) seguido de
   `scripts/remote-deploy.sh`: login no ECR (via a IAM role da própria instância, sem
   credencial nova), `docker compose pull app` puxando a tag do commit, e
   `docker compose up -d`.

O repositório é clonado na instância uma única vez (`/opt/voacraque`), via uma **chave de
deploy só-leitura** gerada na própria máquina — usada só para o `git pull` trazer os arquivos
de configuração, não o código da aplicação em si (esse vem embutido na imagem).

`docker-compose.prod.yml` usa a tag `!reset` (Compose v2.24+) para remover a publicação de
porta do `app` e do `db` no host (definida no `docker-compose.yml` base para uso local) e
define `image:` para o `app` (em vez do `build:` local herdado do arquivo base, que
continua existindo e é usado só em desenvolvimento) — além de adicionar o serviço `caddy`,
único a publicar 80/443.

Rollback: reexecutar o job de deploy manualmente para um commit anterior (a imagem daquele
SHA já existe no ECR), sem precisar de rebuild.

## 11. Estimativa de custo

Valores aproximados, sob demanda, em `sa-east-1` (o usuário IAM usado neste projeto não tem
permissão `pricing:GetProducts` para consulta exata via API — conferir no [AWS Pricing
Calculator](https://calculator.aws) antes de decidir por Savings Plan ou Reserved Instance):

| Item | Custo aproximado/mês |
| --- | --- |
| EC2 `t4g.small` (24/7) | ~US$ 18-20 |
| EBS gp3 20 GiB | ~US$ 2 |
| Elastic IP (associado a instância ligada) | US$ 0 |
| S3 (poucos GB de fotos/comprovantes) | centavos |
| Transferência de saída (via Cloudflare) | poucos dólares, proporcional ao tráfego |
| **Total** | **~US$ 20-25/mês** |

Se a instância for parada sem o Elastic IP desassociado, ele passa a ser cobrado
(~US$ 3,6/mês) — desassociar ou liberar o EIP se a instância ficar parada por muito tempo.

## 12. Em aberto

Itens conscientemente deixados de fora deste primeiro corte, para revisitar depois:

- **Backup do Postgres**: hoje não existe. Proposta: `pg_dump` agendado (cron na instância
  ou um segundo container) gravando no mesmo bucket S3, com lifecycle de expiração.
- **`npm run db:purge-sessions` em cron diário**, como o README já recomenda.
- **Monitoramento de memória**: instalar o CloudWatch Agent (nem a instância do Cronos tem
  hoje) para ter alarme antes de um OOM, não descobrir depois.
- **Renovação do certificado de origem da Cloudflare**: validade de 15 anos, não é urgente,
  mas vale anotar a data em algum lugar visível.

## 13. Referências

- [ECS Best Practices Guide — Application](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/application.html)
- [REL10-BP01 — Deploy the workload to multiple locations](https://docs.aws.amazon.com/wellarchitected/2025-02-25/framework/rel_fault_isolation_multiaz_region_system.html)
- [ELB Best Practices Guides — Workload Architecture](https://aws.github.io/aws-elb-best-practices/reliability/workload_architecture/)
- [SEC01-BP01 — Separate workloads using accounts](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_securely_operate_multi_accounts.html)
- [IAM User Guide — Use instance profiles](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2_instance-profiles.html)
- [Amazon S3 — Block Public Access](https://aws.amazon.com/s3/features/block-public-access/)
- [Amazon S3 now automatically encrypts all new objects](https://aws.amazon.com/about-aws/whats-new/2023/01/amazon-s3-automatically-encrypts-new-objects)
- [EC2 User Guide — Launch an instance using the launch instance wizard](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-launch-instance-wizard.html)
- Cloudflare — [IP Ranges (ips-v4)](https://www.cloudflare.com/ips-v4)
