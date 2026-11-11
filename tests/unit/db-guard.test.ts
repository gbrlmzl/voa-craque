import globalSetup from "../setup/db-global";
import { restoreEnv, stubEnv } from "../helpers/env";

afterEach(() => restoreEnv());

describe("trava de seguranca dos testes de integracao", () => {
  it("o globalSetup recusa, antes de qualquer consulta, um banco que nao termina em _test", async () => {
    stubEnv("DATABASE_URL", "postgresql://voacraque:voacraque@localhost:5432/voacraque?schema=public");
    await expect(globalSetup({ maxWorkers: 1 })).rejects.toThrow(/nao termina em "_test"/);
  });

  it("recusa tambem o banco do E2E e o de desenvolvimento com sufixo parecido", async () => {
    for (const name of ["voacraque_e2e", "voacraque_dev", "test_voacraque"]) {
      stubEnv("DATABASE_URL", `postgresql://u:p@localhost:5432/${name}?schema=public`);
      await expect(globalSetup({ maxWorkers: 1 })).rejects.toThrow(/Recusado/);
    }
  });

  it("sem DATABASE_URL avisa que o .env.test deveria ter definido", async () => {
    stubEnv("DATABASE_URL", "");
    await expect(globalSetup({ maxWorkers: 1 })).rejects.toThrow(/DATABASE_URL ausente/);
  });

  it("o setup de cada worker troca para o banco proprio (_test_N) e tambem recusa banco de fora", () => {
    jest.isolateModules(() => {
      stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/voacraque_test?schema=public");
      stubEnv("JEST_WORKER_ID", "3");
      require("../setup/db-worker");
      expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/voacraque_test_3");
    });
    jest.isolateModules(() => {
      stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/voacraque?schema=public");
      expect(() => require("../setup/db-worker")).toThrow(/nao termina em "_test"/);
    });
  });
});

describe("os testes nunca herdam S3, SMTP ou Google do .env", () => {
  it("tests/setup/env.ts zera tudo antes de qualquer import", () => {
    expect(process.env.STORAGE_DRIVER).toBe("local");
    expect(process.env.MAIL_DRIVER).toBe("console");
    for (const key of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "SMTP_HOST", "SMTP_USER", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"]) {
      expect({ [key]: process.env[key] }).toEqual({ [key]: "" });
    }
    expect(process.env.UPLOAD_DIR).toMatch(/voacraque-uploads-/);
  });
});
