/** Clique num link que tira o usuario desta pagina dentro do app? */
export function isInAppLeave(input: {
  href: string | null; // atributo href do <a>
  currentUrl: string; // location.href
  target: string | null; // atributo target
  download: boolean; // tem atributo download
  button: number; // MouseEvent.button
  modifier: boolean; // ctrl, meta, shift ou alt
}): boolean {
  // Botao do meio/direito e teclas modificadoras abrem em outra aba ou menu: a pagina atual fica.
  if (input.button !== 0 || input.modifier) return false;
  if (input.target && input.target !== "_self") return false;
  if (input.download) return false;
  if (!input.href) return false;

  let destination: URL;
  let current: URL;
  try {
    current = new URL(input.currentUrl);
    destination = new URL(input.href, current);
  } catch {
    return false;
  }

  // mailto:, tel:, javascript: e afins nao saem da pagina.
  if (destination.protocol !== "http:" && destination.protocol !== "https:") return false;
  if (destination.origin !== current.origin) return false;
  // Mesmo caminho e mesma busca: so muda (ou nem muda) o #.
  if (destination.pathname === current.pathname && destination.search === current.search) return false;
  return true;
}
