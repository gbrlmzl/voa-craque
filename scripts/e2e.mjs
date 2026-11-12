// E2E completo: sobe a stack (imagem do deploy + banco), roda o Cypress e derruba tudo, passe ou falhe.
// Em falha imprime o log do app antes de apagar o banco. Argumentos extras vao para `cypress run`:
//   npm run test:e2e -- --headed --spec cypress/e2e/times.cy.ts
// (em Linux com desktop use --headed: o Electron sem janela visivel nao revela o streaming do Next).
import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (args) => spawnSync(npm, args, { stdio: "inherit", shell: process.platform === "win32" }).status ?? 1;

let status = run(["run", "e2e:up"]);
if (status === 0) {
  status = run(["run", "cy:run", "--", ...process.argv.slice(2)]);
}
if (status !== 0) {
  console.error("\n[e2e] falhou; log do app:\n");
  run(["run", "e2e:logs"]);
}
run(["run", "e2e:down"]);
process.exit(status);
