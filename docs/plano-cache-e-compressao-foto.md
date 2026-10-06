# Plano de execução — compressão e cache da foto de perfil

> **Para quem executa:** leia o plano inteiro antes de mexer em qualquer arquivo. Siga as fases na
> ordem e só avance quando o checkpoint da fase passar. Se algo do plano não bater com o código
> (arquivo sumiu, API diferente), pare, descreva a divergência e siga pela alternativa mais próxima
> do espírito do plano, registrando isso no relatório final.
>
> **Para o usuário:** antes de mandar executar, leia a [seção 3](#3-pesquisa-como-o-mercado-resolve)
> (pesquisa) e confirme as decisões da [seção 4](#4-decisões-confirme-antes-de-executar). Duas delas
> ajustam o pedido original e estão marcadas com ⚠️.

---

## 0. Regras de execução

1. **Comece depois do merge de `implementa-sessao-jwt-stateless`.** Esse PR reescreve `src/proxy.ts`
   e a camada de sessão; este plano parte do `main` já com ele. Crie a branch a partir do `main`.
2. **Não faça commit nem push.** No fim, entregue o relatório da [seção 9](#9-relatório-final).
3. **Nunca apague objetos do bucket nem arquivos de `uploads/`.** O script de reprocessamento grava
   arquivos novos e mantém os originais; a limpeza é decisão do usuário.
4. **Nunca imprima valores do `.env`.**
5. **Não rode nada contra produção** (bucket, instância, banco). Os comandos de produção ficam no
   relatório para o usuário executar.
6. Convenções do repositório: comentários de código em português **sem acentos**, explicando o
   *porquê*; textos que o usuário vê **com acentos**. Imite a densidade de comentários dos arquivos
   vizinhos.

---

## 1. Objetivo e requisitos

1. **Compressão:** toda foto de perfil é reduzida no upload para o tamanho que o app realmente
   exibe, sem perda visível de qualidade. Fotos grandes (inclusive acima de 10 MB, direto da câmera
   do celular) passam a ser aceitas e comprimidas, em vez de recusadas.
2. **Cache:** a mesma foto não é baixada do bucket a cada exibição. O navegador guarda a foto e o
   servidor evita ir ao S3 para fotos já lidas recentemente.
3. **Sem regressão de segurança:** a foto continua visível só para usuário logado; o comprovante de
   pagamento continua com o controle de acesso e sem cache.
4. **Fotos já enviadas** também são reduzidas, por um script que o usuário roda uma vez.

---

## 2. Estado atual (medido em 30/09/2026)

| Item | Hoje | Onde |
|---|---|---|
| Tamanho da foto de perfil de teste em produção | **4,8 MB** (JPEG original do celular) | medido no navegador |
| Maior tamanho em que a foto aparece | 336 px físicos (avatar `xl` = 112 px CSS × DPR 3; avatar do story = 336 px) | `src/components/Player.tsx`, `src/lib/story-card.ts` |
| Limite de upload | 5 MB (`MAX_UPLOAD_MB`), igual para foto e comprovante; acima disso o upload é **recusado** | `src/lib/storage.ts:12` |
| Tipo aceito | confia no `file.type` enviado pelo navegador | `src/lib/storage.ts:25` |
| Entrega da foto (driver s3) | `/api/files/...` responde 302 para uma URL assinada **nova a cada chamada**, que vale 60 s | `src/app/api/files/[...path]/route.ts`, `signedS3Url` |
| Cache no navegador | **nenhum na prática**: como a URL assinada muda a cada chamada, o navegador baixa a foto do S3 de novo em toda tela | — |
| Proxy do Next 16 | copia o corpo de toda requisição que passa por `src/proxy.ts` e **corta em 10 MB sem avisar o cliente**: o upload chega truncado ao route handler | [docs do Next](https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize) |
| Servidor | EC2 `t4g.small` (ARM64, 2 GB de RAM divididos com Postgres e Caddy), atrás da Cloudflare | `docs/arquitetura-infraestrutura-aws.md` |
| `sharp` | já está em `node_modules` como dependência opcional do Next (0.35.4), mas **não** é dependência direta | `npm ls sharp` |

Conclusão: uma foto de 4,8 MB para ser exibida em no máximo 336 px é cerca de 100× maior do que
precisa. E, sem cache efetivo, esse peso é baixado de novo a cada tela.

---

## 3. Pesquisa: como o mercado resolve

### 3.1 Onde comprimir

| Abordagem | Como funciona | Prós | Contras | Quem usa |
|---|---|---|---|---|
| **No navegador, antes de enviar** (Canvas API, `browser-image-compression`, Compressor.js, Pica) | Desenha a imagem num `<canvas>` menor e exporta com `canvas.toBlob(tipo, qualidade)` | Upload muito menor (bom em 4G), zero CPU no servidor | O cliente não é confiável (pode ser pulado), o encoder do navegador é simples, HEIC não decodifica no Chrome | Formulários de avatar, apps com banda limitada |
| **No servidor, no upload** (`sharp`/libvips, ImageMagick, Jimp) | O servidor decodifica, redimensiona e recodifica antes de gravar | Fonte da verdade: toda foto gravada segue o padrão; encoders melhores; remove EXIF | Gasta CPU e memória do servidor, e o upload original ainda trafega | Padrão em backends Node |
| **Serviço gerenciado** (Cloudinary, imgix, Cloudflare Images, AWS Serverless Image Handler com Lambda) | O original vai para o serviço, que entrega variantes por URL | Zero código de imagem, CDN embutida | Custo mensal, dependência externa, e a foto sai do bucket privado | Produtos com muitas imagens e variantes |

Entre as bibliotecas de servidor, o **`sharp`** é a referência em Node. Ele usa a libvips, que
processa a imagem em fluxo sem carregá-la inteira na memória e costuma ser de 4 a 5 vezes mais
rápida que o ImageMagick. Também tem `limitInputPixels` contra "bombas de pixels" e remove os
metadados (EXIF, GPS) por padrão.

O padrão recomendado para avatar é **híbrido**: o navegador reduz a foto para economizar upload, e
o servidor normaliza sempre, porque é a única etapa em que se pode confiar.

### 3.2 Formato

| Formato | Tamanho típico de um avatar 512×512 | Velocidade de codificação | Suporte |
|---|---|---|---|
| JPEG (mozjpeg) | referência | rápida | universal |
| **WebP** (qualidade ~80) | ~25–35% menor que JPEG | rápida | todos os navegadores atuais, inclusive no `<canvas>` |
| AVIF | ~50% menor que JPEG | **lenta** (várias vezes mais CPU) | navegadores atuais |

Para uma imagem de 512 px, a diferença absoluta entre WebP e AVIF fica em poucos KB. Já o custo de
CPU do AVIF pesa numa `t4g.small`, por isso a escolha é **WebP**.

### 3.3 O que "sem perder qualidade" significa na prática

- **Compressão sem perda** (PNG, WebP lossless) mantém cada pixel idêntico. Numa foto de câmera,
  ela quase não reduz o tamanho, então não resolve o problema.
- **Compressão visualmente sem perda**, que é o padrão de mercado para fotos: reduzir a resolução
  para o maior tamanho exibido (com folga para telas de alta densidade) e codificar com qualidade
  entre 80 e 85. Nesse tamanho, a diferença para o original não é perceptível a olho nu.

O ganho vem principalmente da **redução de resolução**: um arquivo de 12 megapixels vira 0,26
megapixel. A recodificação completa o resto. Estimativa: de 4,8 MB para algo entre **25 e 60 KB**.

---

## 4. Decisões (confirme antes de executar)

| # | Decisão | Por quê |
|---|---|---|
| D1 | **`sharp` no servidor é a fonte da verdade**; o navegador faz uma redução prévia como melhoria progressiva | O servidor garante o padrão mesmo que o passo do cliente falhe; o cliente economiza upload em 4G |
| D2 ⚠️ | **Toda foto é processada, não só as acima de 10 MB** | Com a regra "só acima de 10 MB", a foto medida hoje (4,8 MB) continuaria com 4,8 MB. O que define o peso ideal é o tamanho exibido (336 px), não o tamanho do arquivo. Processar sempre também garante que a foto seja uma imagem de verdade e remove o GPS do EXIF |
| D3 ⚠️ | **O limite de upload da foto sobe para 20 MB** (`MAX_PHOTO_UPLOAD_MB`); o comprovante continua com 5 MB | Hoje uma foto acima de 5 MB é recusada. O pedido é que fotos grandes sejam aceitas e comprimidas, e 20 MB cobre câmeras de 50 MP com folga |
| D4 | Saída **512×512, WebP qualidade 82, recorte central**, com rotação pelo EXIF e sem metadados | 512 px cobre os 336 px exibidos com folga. O app já exibe a foto recortada no centro (`object-cover`, recorte central no story), então gravar o quadrado central não muda nada na tela |
| D5 | **A foto passa a ser servida pelo próprio `/api/files`**, com cache `private, max-age=1 ano, immutable`, mais um cache em memória no servidor. O comprovante continua com o redirect para URL assinada e sem cache | Ver [4.1](#41-por-que-servir-a-foto-pelo-servidor-e-não-por-redirect) |
| D6 | Fotos antigas são reprocessadas por script, **em modo de simulação por padrão**, e os originais ficam no bucket | Nada irreversível sem decisão do usuário |

### 4.1 Por que servir a foto pelo servidor e não por redirect

Numa conversa anterior sugeri outra saída: manter o redirect e deixar a URL assinada estável dentro
de uma janela de tempo. Com a foto em ~40 KB, servir pelo servidor é melhor:

- **A URL nunca muda** (`/api/files/fotos/<uuid>.webp`), e a chave é um UUID novo a cada upload.
  O arquivo nunca é reescrito, então o navegador pode guardá-lo como `immutable` por um ano e **não
  pede de novo nem ao servidor**. Com o redirect, a URL assinada muda a cada janela e as
  credenciais temporárias da role da EC2 rotacionam, o que força novos downloads.
- **Mesma origem:** o story no canvas deixa de depender do CORS do bucket. A regra aplicada
  continua válida e inofensiva.
- **O controle de acesso continua igual:** a rota exige usuário logado antes de responder.
- **Custo:** um `GetObject` de ~40 KB na mesma região quando falta no cache em memória. Irrelevante.

`private` impede que a Cloudflare ou qualquer cache compartilhado guarde a foto, o que é
obrigatório porque ela exige login. A [Fase 7](#fase-7--validação) confere isso pelo
`cf-cache-status`.

---

## 5. Mapa de arquivos

| Arquivo | Ação |
|---|---|
| `package.json` / `package-lock.json` | adicionar `sharp` como dependência direta (mesma versão que o Next já traz) |
| `next.config.ts` | `sharp` em `serverExternalPackages`; `experimental.proxyClientMaxBodySize: "25mb"` |
| `src/lib/profile-photo.ts` | **novo**: normalização com `sharp` (servidor) |
| `src/lib/photo-cache.ts` | **novo**: LRU em memória limitado por bytes (puro, testável) |
| `src/lib/client-image.ts` | **novo**: redução prévia no navegador |
| `src/lib/storage.ts` | limite por pasta, foto passa pela normalização, leitura de objeto do S3 e do disco |
| `src/app/api/files/[...path]/route.ts` | foto servida direto com cache imutável; comprovante sem mudança |
| `src/app/api/uploads/route.ts` | sem mudança de contrato (continua devolvendo `{ url }`) |
| `src/hooks/useProfileForm.ts` | chama a redução prévia antes do `fetch` |
| `src/components/forms/ProfileForm.tsx` | texto de ajuda do limite, se houver |
| `scripts/reprocess-photos.ts` | **novo**: reprocessa fotos antigas |
| `.env.example`, `docker-compose.yml`, `docker-compose.dev.yml` | `MAX_PHOTO_UPLOAD_MB` |
| `tests/profile-photo.test.ts`, `tests/photo-cache.test.ts` | **novos** |
| `docs/arquitetura-infraestrutura-aws.md` | seção curta sobre como a foto é gravada e servida |

---

## 6. Fases

### Fase 0 — Preparação

1. `git switch main && git pull` e confirme que o merge da sessão JWT está no `main`
   (`src/lib/auth/refresh-tokens.ts` existe).
2. `git switch -c feat/compressao-cache-foto`.
3. Rode `npm test` e `npm run typecheck` para ter a linha de base.

**Checkpoint:** testes e typecheck passando antes de qualquer mudança.

### Fase 1 — Dependência e módulo de normalização

1. `npm install sharp@0.35.4` (a mesma versão que o Next já resolve, para não duplicar binários).
   O Dockerfile usa `node:24-bookworm-slim` (glibc) e o build é `linux/arm64`. O `sharp` publica
   binário pronto para `linux-arm64` com glibc, então **o Dockerfile não muda**.
2. `next.config.ts`: acrescente `"sharp"` em `serverExternalPackages`.
3. Crie `src/lib/profile-photo.ts`, usando como base:

```ts
import sharp from "sharp";
import { badRequest } from "@/lib/http";

/** Lado do quadrado gravado. O maior uso hoje e 336 px fisicos (avatar xl em DPR 3 e o story). */
export const PHOTO_SIZE = 512;
const PHOTO_QUALITY = 82;
// Acima disso nem decodifica: protege os 2 GB da t4g contra "bomba de pixels".
const MAX_INPUT_PIXELS = 100_000_000;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

// Cache interno do libvips desligado: cada foto e processada uma vez so.
sharp.cache(false);

// Uma normalizacao por vez: a t4g divide 2 GB de RAM com o Postgres, e duas
// fotos de 50 MP decodificando juntas nao cabem com folga.
let tail: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.catch(() => undefined);
  return run;
}

/**
 * Normaliza a foto de perfil: confere que e imagem de verdade (nao confia no
 * file.type do navegador), gira pelo EXIF, recorta o quadrado central e grava
 * WebP sem metadados (o EXIF de celular traz GPS).
 */
export function normalizeProfilePhoto(input: Buffer): Promise<Buffer> {
  return oneAtATime(async () => {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
    const meta = await image.metadata().catch(() => null);
    if (!meta?.format || !ACCEPTED_FORMATS.has(meta.format)) {
      throw badRequest("Formato inválido. Envie uma imagem JPEG, PNG ou WebP.");
    }
    return image
      .rotate()
      .resize(PHOTO_SIZE, PHOTO_SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: PHOTO_QUALITY, effort: 4 })
      .toBuffer();
  });
}
```

Notas:
- Uma imagem acima de `limitInputPixels` faz o `sharp` lançar erro. Traduza esse erro para um
  `badRequest("Imagem muito grande...")` com mensagem com acentos. Confira o texto exato do erro
  na versão instalada.
- Em JPEG, a libvips reduz a imagem já na decodificação ("shrink-on-load"). Uma foto de 50 MP
  quase não ocupa memória. PNG e WebP decodificam inteiros, e é por isso que existe a fila.

**Checkpoint:** `npm run typecheck` passando.

### Fase 2 — Upload

1. **`src/lib/storage.ts`:**
   - Troque o `MAX_UPLOAD_MB` único por um limite por pasta:
     `MAX_PHOTO_UPLOAD_MB` (padrão 20) para `fotos` e `MAX_UPLOAD_MB` (padrão 5) para
     `comprovantes`. A mensagem de erro mostra o limite da pasta.
   - Em `saveUpload`, quando `folder === "fotos"`: confira o tamanho, passe os bytes por
     `normalizeProfilePhoto`, grave com extensão `webp` e `ContentType: "image/webp"`. Não use o
     `file.type` para escolher a extensão, porque a saída é sempre WebP.
   - `comprovantes` continua exatamente como está (`assertValid` pelo `file.type`).
   - Acrescente `readStoredFile(key): Promise<Buffer | null>`. No driver `s3`, faz `GetObject` e
     devolve `null` em `NoSuchKey`. No `local`, lê pelo `localFilePath` já existente. Reaproveite a
     criação do `S3Client` com um helper `s3Client()` em vez de repetir o bloco de credenciais
     pela terceira vez.
2. **`next.config.ts`:** `experimental: { ..., proxyClientMaxBodySize: "25mb" }`. Sem isso, um
   upload acima de 10 MB passa pelo `src/proxy.ts` e chega **cortado e sem erro** ao route handler.
   O `sharp` recusa o arquivo cortado e o usuário vê "Formato inválido", que confunde. 25 MB dá
   folga sobre os 20 MB por causa do envelope do `multipart/form-data`.
3. **`.env.example`, `docker-compose.yml`, `docker-compose.dev.yml`:** adicione
   `MAX_PHOTO_UPLOAD_MB` (padrão 20), com comentário no `.env.example`.
4. **Caddy e Cloudflare:** o `Caddyfile` não tem limite de corpo, e o plano gratuito da Cloudflare
   aceita até 100 MB. Não há o que mudar, mas registre isso no relatório.

**Checkpoint:** com `STORAGE_DRIVER=local`, envie pelo formulário de perfil uma foto de 12 MB (gere
uma com `sharp`, veja a Fase 7). O arquivo em `uploads/fotos/` deve ser `.webp` e 512×512, com
menos de 100 KB.

### Fase 3 — Redução prévia no navegador

Crie `src/lib/client-image.ts` (código de cliente, sem dependência nova):

```ts
/**
 * Reduz a foto no navegador antes do upload, so para economizar dados em 4G.
 * O servidor normaliza de novo de qualquer jeito; se algo aqui falhar (HEIC
 * no Chrome, navegador antigo), manda o arquivo original.
 */
export async function shrinkBeforeUpload(file: File, maxSide = 1600, quality = 0.9): Promise<File> {
  if (file.size <= 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
```

- Em `useProfileForm.uploadPhoto`, use `form.set("file", await shrinkBeforeUpload(file))`.
- O lado maior fica em 1600 px, não em 512, porque o recorte é feito no servidor e a imagem precisa
  chegar lá com folga.
- O `accept="image/jpeg,image/png,image/webp"` do `ProfileForm` continua. Com ele, o Safari do
  iPhone converte HEIC para JPEG antes de entregar o arquivo.

**Checkpoint:** no navegador, a requisição `POST /api/uploads` de uma foto de 12 MB deve sair com
menos de ~1 MB (confira em `read_network_requests`).

### Fase 4 — Cache

1. Crie `src/lib/photo-cache.ts`, um LRU puro limitado por bytes:
   - `new ByteLru({ maxBytes: 32 * 1024 * 1024, maxItemBytes: 512 * 1024 })`, com os métodos
     `get(key)` e `set(key, bytes)`. Use um `Map`, aproveitando a ordem de inserção: `get` move o
     item para o fim e `set` remove do início até caber.
   - `maxItemBytes` impede que uma foto antiga de 4,8 MB, ainda não reprocessada, ocupe o cache
     inteiro.
   - Exporte uma instância única para o processo, guardada em `globalThis` como o `prisma` faz,
     para sobreviver ao hot reload no dev.
   - Não precisa de invalidação: a chave é um UUID e o arquivo nunca é reescrito.
2. **`src/app/api/files/[...path]/route.ts`:** logo depois do `requireUser()`:
   - Se `segments[0] === "fotos"`: busca no LRU; se não estiver lá, chama `readStoredFile` e grava
     no LRU. Responde os bytes com `Content-Type` (via `contentTypeFor`, que já trata `.webp`) e
     `Cache-Control: private, max-age=31536000, immutable`. Vale para os dois drivers.
   - Se for `comprovantes`: fluxo atual sem mudança (checagem de dono, redirect assinado no `s3`).
     Acrescente `Cache-Control: no-store` na resposta local e no redirect, porque o comprovante é
     dado sensível.
   - Não sirva como imutável um arquivo que não existe: `null` continua virando `notFound`.
3. Comente no código por que a foto não usa mais o redirect, com o resumo da
   [seção 4.1](#41-por-que-servir-a-foto-pelo-servidor-e-não-por-redirect).

**Checkpoint:** abra uma tela com avatares, recarregue, e confira em `read_network_requests` que a
segunda carga da foto vem do cache do navegador (sem nova requisição, ou com o status "from cache").

### Fase 5 — Reprocessar as fotos já enviadas

Crie `scripts/reprocess-photos.ts` (rode com `npx tsx`, como `scripts/purge-tokens.ts`):

1. Busque `PlayerProfile` com `photoUrl` começando em `/api/files/fotos/` e **sem** terminar em
   `.webp`.
2. Para cada perfil: `readStoredFile` → `normalizeProfilePhoto` → grave numa chave nova
   `fotos/<uuid>.webp`, pelo mesmo helper que o `saveUpload` usa → atualize `photoUrl`.
3. **Simulação por padrão:** sem `--apply`, só lista quantas fotos seriam processadas e o total de
   bytes antes e depois (processa em memória, sem gravar nem atualizar o banco).
4. Falha numa foto (corrompida, apagada) registra o erro e segue para a próxima.
5. No fim, imprime as chaves originais que ficaram sem uso. **Não apaga nada.** A remoção fica
   para o usuário, que pode apagar à mão ou criar uma regra de ciclo de vida no bucket.

Comando para o usuário rodar em produção (vai no relatório):
`docker compose exec app npx tsx scripts/reprocess-photos.ts` e, conferido o resultado, o mesmo
comando com `--apply`.

**Checkpoint:** no banco local, com uma foto `.jpg` grande no perfil, a simulação mostra a economia
e o `--apply` troca o `photoUrl` para `.webp`, mantendo o original em `uploads/fotos/`.

### Fase 6 — Testes

`tests/profile-photo.test.ts` (gere as imagens com o próprio `sharp`, sem arquivos no repositório):
- Uma imagem de 4000×3000 com ruído, em JPEG, vira WebP de 512×512 com menos de 100 KB.
- **EXIF de rotação:** crie uma imagem metade vermelha e metade azul com `orientation: 6` e confira
  a cor de um pixel depois da normalização para provar que a rotação foi aplicada.
- A saída não tem EXIF (`metadata().exif` vazio).
- Bytes de texto com `file.type` de imagem são recusados com a mensagem de formato inválido.
- Uma imagem acima do limite de pixels é recusada. Deixe o limite injetável por parâmetro
  opcional para o teste não precisar de 100 MP.

`tests/photo-cache.test.ts`:
- Remove o item usado há mais tempo quando passa de `maxBytes`.
- `get` renova a posição do item.
- Item acima de `maxItemBytes` não é guardado.

**Checkpoint:** `npm test` e `npm run typecheck` passando.

### Fase 7 — Validação

Local (`STORAGE_DRIVER=local`, dev server pelo `preview_start`):
1. Gere uma foto grande:
   `npx tsx -e "import sharp from 'sharp'; sharp({create:{width:6000,height:4500,channels:3,noise:{type:'gaussian',mean:128,sigma:40}}}).jpeg({quality:98}).toFile('foto-teste.jpg')"`
   e confira que ela tem mais de 10 MB. Não coloque o arquivo no repositório.
2. Envie a foto pelo perfil e confira os checkpoints das Fases 2, 3 e 4.
3. Teste a redução prévia desligada (envie o arquivo direto com `fetch` pelo `javascript_tool`)
   para provar que o servidor aceita até 20 MB e não trunca no proxy.
4. Abra o story da pelada e confira que a foto aparece.
5. Envie um comprovante e confira que o fluxo continua igual, com `Cache-Control: no-store`.

Produção (lista para o usuário, **não execute**):
1. Depois do deploy, envie uma foto e confira no DevTools: `content-type: image/webp`,
   `cache-control: private, max-age=31536000, immutable`, e `cf-cache-status` **diferente de
   `HIT`** (deve vir `DYNAMIC` ou `BYPASS`). Um `HIT` indicaria que a Cloudflare guardou uma foto
   que exige login.
2. Rode o script da Fase 5 em simulação e depois com `--apply`.
3. Abra o story e confira a foto.

---

## 7. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Pico de memória na `t4g.small` com fotos enormes | Fila de uma normalização por vez, `limitInputPixels`, shrink-on-load do JPEG, redução prévia no navegador |
| Upload acima de 10 MB cortado sem aviso pelo proxy | `proxyClientMaxBodySize: "25mb"` |
| Cloudflare guardar a foto privada | `Cache-Control: private` e checagem do `cf-cache-status` |
| Usuário não gostar do recorte central | É o mesmo recorte que a tela já mostra. Um editor de recorte fica fora do escopo |
| Binário do `sharp` errado na imagem ARM | `npm ci` roda dentro do build `linux/arm64` e instala `@img/sharp-linux-arm64`. O primeiro deploy confirma, porque o upload falharia na hora |
| Script de reprocessamento falhar no meio | Uma foto por vez, erro por foto não interrompe, original preservado, simulação antes |

---

## 8. Fora do escopo

- Editor de recorte da foto no app.
- Várias variantes por foto (miniatura e grande). Com 512 px e ~40 KB, uma só basta.
- Apagar os originais do bucket: decisão do usuário depois da Fase 5.
- Foto do Google (`user.image`): é URL externa, fora do bucket.
- Ícones apagados dos quadros do story (`fillStyle` com 5% de opacidade antes do emoji em
  `src/lib/story-card.ts`): correção separada.

---

## 9. Relatório final

Ao terminar, entregue:
1. Arquivos alterados e criados, uma linha cada.
2. Resultado de `npm test` e `npm run typecheck`.
3. Tamanho da foto de teste antes e depois, e o tamanho do `POST /api/uploads` com e sem a redução
   prévia.
4. Cabeçalhos de resposta da foto e do comprovante.
5. Divergências em relação a este plano e o porquê.
6. Os comandos de produção da Fase 5 e a lista de conferência da Fase 7.

---

## Fontes

- [sharp — documentação oficial](https://sharp.pixelplumbing.com/) e [repositório do projeto (libvips)](https://github.com/lovell/sharp)
- [Sharp.js: The Best Node.js Image Framework Ever — Leapcell](https://leapcell.io/blog/sharpjs-best-nodejs-image-framework)
- [Resize and strip EXIF metadata from user uploads in Node.js — DEV Community](https://dev.to/purlo/resize-and-strip-exif-metadata-from-user-uploads-in-nodejs-f5m)
- [Node.js + Sharp in 2026: Production Image Processing Guide](https://www.hirenodejs.com/blog/nodejs-sharp-image-processing-2026)
- [Compress Images with JavaScript — Cloudinary](https://cloudinary.com/guides/image-effects/javascript-compress-image)
- [How to compress the image on the client side before uploading — SiteLint](https://www.sitelint.com/blog/how-to-compress-the-image-on-the-client-side-before-uploading)
- [Why we compress files in the browser instead of on a server — DEV Community](https://dev.to/sanjay_bharti_311289/why-we-compress-files-in-the-browser-instead-of-on-a-server-56ce)
- [Next.js — `proxyClientMaxBodySize`](https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize)
