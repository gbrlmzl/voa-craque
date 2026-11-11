# Relatório de execução: testes automatizados (Jest + Cypress)

> Rascunho mantido durante a execução; versão final na Fase 7.

## Desvios e decisões do executor

- **D2-A (spike):** o Jest em CommonJS funciona com o Prisma 7 com dois ajustes: o transform `tests/setup/transform-import-meta.cjs` para `import.meta.url` e um `moduleNameMapper` que troca o `import()` do compilador de queries WASM (`query_compiler_fast_bg.postgresql.mjs`) pelo `.js` que o próprio pacote publica. `jose`/`arctic` passam pelo `transformIgnorePatterns` do plano.
- **CI:** `ci.yml` não escuta `push` na `main`: o `deploy.yml` já o chama via `workflow_call` nesse evento, e escutar nos dois rodaria a suíte duas vezes.
- Quatro arquivos de teste estavam com CRLF no working tree (o índice guarda LF); foram normalizados para LF ao migrar.

## Tabela de progresso (11.2)

| Momento | Statements | Branches | Functions | Lines | Suites | Testes |
| --- | --- | --- | --- | --- | --- | --- |
| Linha de base (23 testes migrados + spike) | 19,11% | 17,82% | 19,08% | 18,27% | 24 | 423 |
| Fim da Fase 2 (integração) | 54,33% | 46,31% | 47,50% | 54,44% | 53 | 741 |
| Fim da Fase 3 (unitário; story-card ainda no componente) | 56,04% | 47,81% | 49,24% | 55,96% | 61 | 842 |
| Fim da Fase 4 (componentes) | 95,37% | 88,21% | 96,04% | 97,33% | 73 | 1120 |

