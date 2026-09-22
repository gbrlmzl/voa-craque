/**
 * IP do cliente a partir do X-Forwarded-For.
 *
 * Cada proxy confiavel na frente da aplicacao acrescenta o endereco que viu no
 * fim da lista; tudo que vem antes disso foi escrito pelo proprio cliente e pode
 * ser forjado. Por isso a leitura e da direita para a esquerda, pulando
 * TRUST_PROXY_HOPS - 1 entradas. Ler a primeira entrada deixaria qualquer um
 * escapar do rate limit trocando o header a cada requisicao.
 *
 * Sem proxy na frente, o `next start` preenche o header com o endereco do socket
 * so quando ele nao veio na requisicao; nesse caso um cliente ainda consegue
 * forjar o valor. Em producao, rode atras de um proxy que sobrescreva o header.
 */
export function clientIp(headers: Headers, trustedHops = trustedProxyHops()): string {
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (chain.length === 0) return headers.get("x-real-ip") ?? "unknown";

  const index = chain.length - Math.max(1, trustedHops);
  return chain[Math.max(0, index)];
}

function trustedProxyHops(): number {
  const parsed = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? "1", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
}
