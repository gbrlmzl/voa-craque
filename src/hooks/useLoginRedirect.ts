"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { loginHref } from "@/lib/auth/routes";

/**
 * Leva ao login e volta para a pagina atual (com a querystring) depois. Serve ao
 * botao "Quero jogar", a aba "Entrar" e a qualquer acao que a API recuse com 401.
 */
export function useLoginRedirect(): { loginHref: string; goToLogin: () => void } {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const href = loginHref(query ? `${pathname}?${query}` : pathname);

  return { loginHref: href, goToLogin: () => router.push(href) };
}
