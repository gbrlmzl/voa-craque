// Confere o TOTAL da cobertura (coverage/coverage-summary.json) contra a meta de D4.
// O coverageThreshold do Jest tira do "global" as pastas que tem limite proprio, entao o
// total do projeto inteiro e conferido aqui. Uso: node scripts/check-coverage.mjs
import { readFileSync } from "node:fs";

const MIN = { statements: 70, lines: 70, functions: 65, branches: 60 };
const { total } = JSON.parse(readFileSync("coverage/coverage-summary.json", "utf8"));

const failures = Object.entries(MIN).filter(([metric, min]) => total[metric].pct < min);
for (const [metric, min] of Object.entries(MIN)) {
  console.log(`${metric.padEnd(10)} ${String(total[metric].pct).padStart(6)}%  (minimo ${min}%)`);
}
if (failures.length > 0) {
  console.error(
    `\nJest: coverageThreshold global nao atingido em ${failures.map(([metric]) => metric).join(", ")}.`,
  );
  process.exit(1);
}
