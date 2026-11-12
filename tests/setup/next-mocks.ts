import {
  fakeCookieStore,
  fakeHeaders,
  mailbox,
  queueAfter,
  resetNextEnv,
} from "../helpers/next-env";

// Fora de uma requisicao do Next, cookies() e headers() lancam; estes mocks leem e
// gravam o estado de tests/helpers/next-env.ts.
jest.mock("next/headers", () => ({
  cookies: async () => fakeCookieStore(),
  headers: async () => fakeHeaders(),
}));

jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  after: (task: () => unknown) => queueAfter(task),
}));

// Nenhum teste de integracao envia e-mail de verdade: as mensagens ficam na caixa de saida.
jest.mock("@/lib/mail/mailer", () => ({
  sendMail: async (message: { to: string; subject: string; text: string; html: string }) => {
    mailbox.push(message);
  },
}));

beforeEach(() => {
  resetNextEnv();
});

// Os logs de seguranca e do mailer sao ruido nos testes; quem quiser conferi-los usa
// tests/helpers/logs.ts.
beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
});
