"use client";

import { useRouter } from "next/navigation";
import { type RefObject, useEffect, useRef, useState } from "react";
import { isInAppLeave } from "@/lib/leave-guard";

type PendingLeave =
  | { kind: "link"; anchor: HTMLAnchorElement; href: string }
  | { kind: "form"; form: HTMLFormElement }
  | { kind: "action"; run: () => void };

/**
 * Segura a saida da pagina enquanto `active` (ha alteracao nao salva).
 * - Fechar/recarregar a aba: aviso nativo do navegador (o texto e dele).
 * - Qualquer link do app e qualquer <form> fora de `container` (o "Sair" do
 *   header e do menu): o clique/envio e barrado e vira `pending`, para a tela
 *   perguntar. `confirmLeave` deixa passar; `stayHere` desiste.
 * O botao "voltar" do navegador nao e interceptado.
 */
export function useLeaveGuard({
  active,
  container,
}: {
  active: boolean;
  container: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingLeave | null>(null);
  // Depois do "Descartar" o proprio clique/envio refeito precisa passar direto.
  const bypass = useRef(false);

  useEffect(() => {
    if (!active) return;
    bypass.current = false;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (bypass.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    // Captura no window: roda antes do React e do <Link>.
    const onClick = (event: MouseEvent) => {
      if (bypass.current) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      const leaving = isInAppLeave({
        href: anchor.getAttribute("href"),
        currentUrl: window.location.href,
        target: anchor.getAttribute("target"),
        download: anchor.hasAttribute("download"),
        button: event.button,
        modifier: event.ctrlKey || event.metaKey || event.shiftKey || event.altKey,
      });
      if (!leaving) return;
      event.preventDefault();
      event.stopPropagation();
      const url = new URL(anchor.href);
      setPending({ kind: "link", anchor, href: url.pathname + url.search + url.hash });
    };

    const onSubmit = (event: SubmitEvent) => {
      if (bypass.current) return;
      const form = event.target as HTMLFormElement;
      if (container.current?.contains(form)) return;
      event.preventDefault();
      event.stopPropagation();
      setPending({ kind: "form", form });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("click", onClick, true);
    window.addEventListener("submit", onSubmit, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("submit", onSubmit, true);
    };
  }, [active, container]);

  function confirmLeave() {
    const leave = pending;
    setPending(null);
    if (!leave) return;
    bypass.current = true;
    // Refaz o clique no proprio link: o <Link> navega e o que mais estiver no onClick dele roda
    // (o menu do celular fecha). Se o link sumiu da tela, navega direto.
    if (leave.kind === "link") {
      if (leave.anchor.isConnected) leave.anchor.click();
      else router.push(leave.href);
    } else if (leave.kind === "form") leave.form.requestSubmit();
    else leave.run();
  }

  function stayHere() {
    setPending(null);
  }

  /** Pede a confirmacao para uma saida que a propria tela dispara (o "Cancelar"). */
  function requestLeave(run: () => void) {
    setPending({ kind: "action", run });
  }

  return { pending: pending !== null, confirmLeave, stayHere, requestLeave };
}
