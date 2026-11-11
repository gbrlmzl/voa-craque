import nextJest from "next/jest.js";
import type { Config } from "jest";

const createJestConfig = nextJest({ dir: "./" });

const shared: Config = {
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // O cliente gerado carrega o compilador de queries (WASM) com import() dinamico de
    // um .mjs, que o Jest em CommonJS nao executa. O pacote publica a mesma coisa em .js.
    "^@prisma/client/runtime/(query_compiler_fast_bg\\.[a-z]+(?:\\.wasm-base64)?)\\.mjs$":
      "<rootDir>/node_modules/@prisma/client/runtime/$1.js",
  },
  transform: {
    "^.+/src/generated/.+\\.ts$": "<rootDir>/tests/setup/transform-import-meta.cjs",
  },
  // jose, arctic e @oslojs so publicam ESM: o SWC do next/jest converte para CommonJS.
  transformIgnorePatterns: ["/node_modules/(?!(jose|arctic|@oslojs)/)"],
  setupFiles: ["<rootDir>/tests/setup/env.ts"],
};

// O createJestConfig do next/jest sobrescreve `transform` e `transformIgnorePatterns`
// do projeto; depois de resolvido, recolocamos o transform do Prisma na frente.
async function project(config: Config): Promise<Config> {
  const resolved = (await createJestConfig(config)()) as Config;
  return {
    ...resolved,
    transform: { ...(shared.transform as object), ...(resolved.transform as object) },
    transformIgnorePatterns: shared.transformIgnorePatterns,
  };
}

export default async (): Promise<Config> => ({
  projects: [
    await project({
      ...shared,
      displayName: "unit",
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/unit/**/*.test.ts"],
    }),
    await project({
      ...shared,
      displayName: "component",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/tests/component/**/*.test.tsx"],
      setupFilesAfterEnv: ["<rootDir>/tests/setup/dom.ts"],
    }),
    await project({
      ...shared,
      displayName: "integration",
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
      globalSetup: "<rootDir>/tests/setup/db-global.ts",
      setupFiles: [...(shared.setupFiles as string[]), "<rootDir>/tests/setup/db-worker.ts"],
      setupFilesAfterEnv: ["<rootDir>/tests/setup/next-mocks.ts", "<rootDir>/tests/setup/db-reset.ts"],
    }),
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/generated/**",
    "!src/**/page.tsx",
    "!src/**/layout.tsx",
    "!src/**/loading.tsx",
    "!src/**/*.d.ts",
  ],
  coverageThreshold: {
    // Catraca: sobe a cada fase ate chegar na meta de D4 (70/65/60) e nos limites por pasta.
    global: { statements: 56, lines: 55, functions: 49, branches: 47 },
  },
  coverageReporters: ["text-summary", "lcov", "json-summary"],
});
