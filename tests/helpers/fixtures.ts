import { readFileSync } from "node:fs";
import path from "node:path";

const dir = path.join(__dirname, "fixtures");

/** Arquivos de tests/helpers/fixtures como File, prontos para um FormData. */
export function fixtureFile(name: "foto.jpg" | "comprovante.png" | "nao-imagem.txt", type?: string): File {
  const types: Record<string, string> = { jpg: "image/jpeg", png: "image/png", txt: "text/plain" };
  const bytes = readFileSync(path.join(dir, name));
  return new File([new Uint8Array(bytes)], name, { type: type ?? types[name.split(".").pop()!] });
}
