import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Modulos que so existem no servidor (banco, S3, SMTP, cookies, segredos). Um componente
// ou hook de cliente pode importar o TIPO deles (`import type`), nunca o valor: o valor
// arrastaria o Prisma / `node:*` para o bundle do navegador.
const SERVER_ONLY_PATHS = [
  "@/lib/prisma",
  "@/lib/storage",
  "@/lib/session",
  "@/lib/audit",
  "@/lib/rate-limit",
  "@/lib/security-log",
  "@/lib/realtime",
  "@/lib/client-ip",
  "@/lib/photo-cache",
  "@/lib/auth/config",
  "@/lib/auth/credentials",
  "@/lib/auth/current-user",
  "@/lib/auth/establish-session",
  "@/lib/auth/google",
  "@/lib/auth/google-oauth",
  "@/lib/auth/google-oauth-state",
  "@/lib/auth/password",
  "@/lib/auth/password-reset",
  "@/lib/auth/password-reset-state",
  "@/lib/auth/refresh-tokens",
  "@/lib/auth/refresh-token-state",
  "@/lib/auth/session-cookies",
  "@/lib/auth/tokens",
  "@prisma/client",
  "@prisma/adapter-pg",
  "next/headers",
  "next/server",
].map((name) => ({
  name,
  allowTypeImports: true,
  message: "Modulo so de servidor: em componente/hook de cliente use apenas `import type`.",
}));

export default defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "coverage/**",
    "node_modules/**",
    "src/generated/**",
    "uploads/**",
    "next-env.d.ts",
    "cypress/screenshots/**",
    "cypress/videos/**",
    "cypress/downloads/**",
  ]),

  // ---------------------------------------------------------------------------
  // Regras gerais (todo o projeto)
  // ---------------------------------------------------------------------------
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      // Corretude e seguranca
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-throw-literal": "error",
      "no-self-compare": "error",
      "no-template-curly-in-string": "error",
      "no-unsafe-optional-chaining": "error",
      "no-return-assign": "error",
      "no-duplicate-imports": "off", // coberto por import/no-duplicates
      "import/no-duplicates": "error",
      "no-console": ["error", { allow: ["warn", "error", "info"] }],
      "react/no-danger": "error",
      "react/jsx-no-target-blank": "error",
      "react/self-closing-comp": "error",
      "react/jsx-no-useless-fragment": ["error", { allowExpressions: true }],
      "react/hook-use-state": "error",

      // TypeScript
      "@typescript-eslint/consistent-type-imports": [
        "error",
        // `import("x").Tipo` e usado nos testes do Cypress para tipar sem importar o modulo.
        { prefer: "type-imports", fixStyle: "inline-type-imports", disallowTypeAnnotations: false },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", "ts-ignore": true, minimumDescriptionLength: 10 },
      ],
      "@typescript-eslint/no-non-null-asserted-optional-chain": "error",

      // Prisma: SQL cru so com template literal parametrizado ($queryRaw`...`)
      "no-restricted-properties": [
        "error",
        { property: "$queryRawUnsafe", message: "Use $queryRaw com template literal (parametrizado)." },
        { property: "$executeRawUnsafe", message: "Use $executeRaw com template literal (parametrizado)." },
      ],

      // App Router: o roteador de cliente certo e o de next/navigation
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "next/router", message: "App Router: use next/navigation." }] },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // Acessibilidade: o Cypress localiza tudo por role/label (Testing Library), entao
  // o markup acessivel e parte do contrato. O preset do Next so liga 6 regras.
  // ---------------------------------------------------------------------------
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // Fundo clicavel de modal e autoFocus em campo de modal sao padroes intencionais do
      // app (Escape fecha, o foco vai para o campo): as regras de clique/autofocus ficam de fora.
      "jsx-a11y/interactive-supports-focus": "error",
      // `Input` e `Select` sao wrappers de <input>/<select>: o plugin nao os enxerga sozinho.
      "jsx-a11y/label-has-associated-control": [
        "error",
        { assert: "either", controlComponents: ["Input", "Select", "Textarea"] },
      ],
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/no-redundant-roles": "error",
      "jsx-a11y/heading-has-content": "error",
      "jsx-a11y/iframe-has-title": "error",
      "jsx-a11y/html-has-lang": "error",
      "jsx-a11y/tabindex-no-positive": "error",
      "jsx-a11y/mouse-events-have-key-events": "error",
    },
  },

  // ---------------------------------------------------------------------------
  // Regras que precisam de tipos (typescript-eslint com o tsconfig da raiz).
  // Os testes de Cypress tem o proprio tsconfig e ficam de fora.
  // ---------------------------------------------------------------------------
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}", "prisma/**/*.ts", "scripts/**/*.ts"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Promise solta: Server Action sem await, fetch sem tratamento, envio de e-mail que falha calado.
      "@typescript-eslint/no-floating-promises": "error",
      // `onClick={async () => ...}` e comum em React: so reclama de async onde se espera retorno.
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      "@typescript-eslint/await-thenable": "error",
      // Enums do Prisma (status da pelada, partida, pagamento): um valor novo no schema
      // quebra o typecheck em todo switch que nao o trata.
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/no-for-in-array": "error",
    },
  },

  // ---------------------------------------------------------------------------
  // Fronteira cliente/servidor
  // ---------------------------------------------------------------------------
  {
    files: ["src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "next/router", message: "App Router: use next/navigation." }],
          patterns: [
            {
              group: ["@/services/*", "@/generated/prisma/client", "@/generated/prisma/internal/*", "node:*", "fs", "path"],
              allowTypeImports: true,
              message: "Codigo de cliente nao importa servicos nem Node: `import type` para tipos, Server Action para dados.",
            },
          ],
        },
      ],
      "@typescript-eslint/no-restricted-imports": ["error", { paths: SERVER_ONLY_PATHS }],
    },
  },

  // ---------------------------------------------------------------------------
  // Testes (Jest) e Cypress
  // ---------------------------------------------------------------------------
  {
    files: ["tests/**/*.{ts,tsx,cjs}", "cypress/**/*.ts", "cypress.config.ts", "jest.config.ts"],
    rules: {
      // Teste de verdade nao pode ir para a main com `.only` esquecido.
      "no-restricted-properties": [
        "error",
        { object: "it", property: "only", message: "Remova o .only antes de commitar." },
        { object: "test", property: "only", message: "Remova o .only antes de commitar." },
        { object: "describe", property: "only", message: "Remova o .only antes de commitar." },
        { object: "context", property: "only", message: "Remova o .only antes de commitar." },
      ],
      // Mocks e helpers precisam de `any`/`require` para contornar o sistema de modulos do Jest.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "off",
    },
  },
  {
    // `expect(x).to.be.true` (Chai) e uma expressao por definicao.
    files: ["cypress/**/*.ts"],
    rules: { "@typescript-eslint/no-unused-expressions": "off" },
  },

  // Scripts de linha de comando e seeds escrevem no stdout de proposito.
  {
    files: ["scripts/**", "prisma/**"],
    rules: { "no-console": "off" },
  },

  // postcss/jest/next config exportam um objeto anonimo por contrato do framework.
  {
    files: ["*.config.{ts,mjs,js}"],
    rules: { "import/no-anonymous-default-export": "off" },
  },
]);
