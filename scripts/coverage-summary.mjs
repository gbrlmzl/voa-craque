// Imprime o resumo de cobertura (coverage/coverage-summary.json) em Markdown.
// Uso no CI: node scripts/coverage-summary.mjs >> "$GITHUB_STEP_SUMMARY"
import { readFileSync } from "node:fs";
import path from "node:path";

const file = process.argv[2] ?? "coverage/coverage-summary.json";
const summary = JSON.parse(readFileSync(file, "utf8"));
const pct = (m) => `${m.pct}% (${m.covered}/${m.total})`;
const total = summary.total;

console.log("## Cobertura de testes\n");
console.log("| Statements | Branches | Functions | Lines |");
console.log("| --- | --- | --- | --- |");
console.log(`| ${pct(total.statements)} | ${pct(total.branches)} | ${pct(total.functions)} | ${pct(total.lines)} |\n`);

const byDir = new Map();
for (const [name, data] of Object.entries(summary)) {
  if (name === "total") continue;
  const rel = path.relative(process.cwd(), name).split(path.sep);
  const dir = rel.slice(0, rel[1] === "lib" && rel[2] && !rel[2].includes(".") ? 3 : 2).join("/");
  const acc = byDir.get(dir) ?? { s: [0, 0], b: [0, 0], f: [0, 0], l: [0, 0] };
  acc.s[0] += data.statements.covered; acc.s[1] += data.statements.total;
  acc.b[0] += data.branches.covered; acc.b[1] += data.branches.total;
  acc.f[0] += data.functions.covered; acc.f[1] += data.functions.total;
  acc.l[0] += data.lines.covered; acc.l[1] += data.lines.total;
  byDir.set(dir, acc);
}
const p = ([c, t]) => (t === 0 ? "-" : `${((c / t) * 100).toFixed(1)}%`);
console.log("| Pasta | Statements | Branches | Functions | Lines |");
console.log("| --- | --- | --- | --- | --- |");
for (const [dir, a] of [...byDir].sort(([x], [y]) => x.localeCompare(y))) {
  console.log(`| \`${dir}\` | ${p(a.s)} | ${p(a.b)} | ${p(a.f)} | ${p(a.l)} |`);
}
