import { defineConfig } from "cypress";
import { execFileSync } from "node:child_process";
import { unlinkSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// O webpack que o Next ja traz: o Cypress usa a mesma copia, e nao ha outra no projeto.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NormalModuleReplacementPlugin } = createRequire(import.meta.url)("next/dist/compiled/webpack/webpack").webpack;

const root = path.dirname(fileURLToPath(import.meta.url));

// Tasks do E2E: rodam em Node (fora do navegador) e falam com o banco voacraque_e2e por
// scripts em cypress/tasks, executados com `tsx --env-file=.env.e2e` (o tsx resolve o
// alias "@/" do tsconfig). Nenhuma task toca outro banco: o script confere o nome.
function runTask(script: string, args: string[] = []): unknown {
  const output = execFileSync(
    "npx",
    ["tsx", "--env-file=.env.e2e", "--tsconfig", "tsconfig.json", `cypress/tasks/${script}`, ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const line = output.trim().split("\n").at(-1) ?? "null";
  return JSON.parse(line);
}

export default defineConfig({
  // As imagens de teste moram em tests/helpers/fixtures e servem ao Jest e ao Cypress.
  fixturesFolder: "tests/helpers/fixtures",
  viewportWidth: 390,
  viewportHeight: 844,
  video: true,
  videoCompression: 20,
  screenshotOnRunFailure: true,
  retries: { runMode: 2, openMode: 0 },
  defaultCommandTimeout: 8000,

  e2e: {
    baseUrl: "http://localhost:3100",
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
    setupNodeEvents(on) {
      // O Next revela as secoes em streaming (Suspense) por script que depende de timers e de
      // requestAnimationFrame. Navegador em segundo plano ou sem janela visivel os congela e a
      // pagina fica "invisivel" para o teste; estas opcoes mantem tudo rodando.
      on("before:browser:launch", (browser, launchOptions) => {
        launchOptions.args.push(
          "--disable-background-timer-throttling",
          "--disable-renderer-backgrounding",
          "--disable-backgrounding-occluded-windows",
        );
        if (browser.name === "electron") {
          launchOptions.preferences = { ...launchOptions.preferences, backgroundThrottling: false, webPreferences: { backgroundThrottling: false } } as typeof launchOptions.preferences;
        }
        return launchOptions;
      });
      // Descarta o video das specs que passaram: so a falha precisa dele.
      on("after:spec", (_spec, results) => {
        if (results?.video && results.stats.failures === 0 && results.stats.skipped === 0) {
          try {
            unlinkSync(results.video);
          } catch {
            // ja nao existe
          }
        }
      });
      on("task", {
        "db:cenario": (nome: string) => runTask("cenario.ts", [nome]),
        sessao: (username: string) => runTask("sessao.ts", [username]),
        linkRedefinicao: (email: string) => runTask("link-redefinicao.ts", [email]),
        sql: (query: string) => runTask("sql.ts", [query]),
      });
    },
  },

  component: {
    devServer: {
      framework: "next",
      bundler: "webpack",
      // As Server Actions importam Prisma e next/headers, que nao existem no navegador:
      // nos specs de componente elas viram funcoes falsas (cypress/support/stubs).
      webpackConfig: {
        plugins: [
          ...["auth", "password", "preferences"].map(
            (name) =>
              new NormalModuleReplacementPlugin(
                new RegExp(`^@/actions/${name}$`),
                path.resolve(root, `cypress/support/stubs/actions-${name}.ts`),
              ),
          ),
        ],
      },
    },
    specPattern: "cypress/component/**/*.cy.tsx",
    supportFile: "cypress/support/component.tsx",
    indexHtmlFile: "cypress/support/component-index.html",
  },
});
