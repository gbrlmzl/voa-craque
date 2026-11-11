import { passwordChangedEmail, passwordResetEmail } from "../../src/lib/mail/templates";
import { sendMail } from "../../src/lib/mail/mailer";
import { restoreEnv, stubEnv } from "../helpers/env";

describe("passwordResetEmail", () => {
  const mail = passwordResetEmail({ username: "gabriel", url: "https://voacraque.app/reset-password?token=abc", ttlMinutes: 30 });

  it("assunto, texto e HTML levam o link e o prazo", () => {
    expect(mail.subject).toBe("Redefinir sua senha no Voa Craque");
    expect(mail.text).toContain("https://voacraque.app/reset-password?token=abc");
    expect(mail.text).toContain("30 minutos");
    expect(mail.html).toContain('href="https://voacraque.app/reset-password?token=abc"');
  });

  it("nunca carrega a senha, so o link", () => {
    expect(mail.text).not.toMatch(/senha: /i);
  });

  it("escapa nome e link com HTML", () => {
    const evil = passwordResetEmail({ username: "<script>alert(1)</script>", url: 'https://x/?a="b"&c=<d>', ttlMinutes: 5 });
    expect(evil.html).not.toContain("<script>");
    expect(evil.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(evil.html).toContain("&quot;b&quot;&amp;c=&lt;d&gt;");
  });
});

describe("passwordChangedEmail", () => {
  it("avisa a data da troca e manda recuperar a conta se nao foi a pessoa", () => {
    const mail = passwordChangedEmail({ username: "gabriel", when: "10/05/2030 20:00" });
    expect(mail.subject).toBe("Sua senha foi alterada");
    expect(mail.text).toContain("10/05/2030 20:00");
    expect(mail.text).toContain("Esqueci minha senha");
    expect(passwordChangedEmail({ username: "<b>x</b>", when: "<i>agora</i>" }).html).not.toContain("<b>x</b>");
  });
});

describe("sendMail (driver console)", () => {
  const message = { to: "a@b.com", subject: "Assunto", text: "corpo com link", html: "<p>x</p>" };
  afterEach(() => restoreEnv());

  it("fora de producao imprime a mensagem inteira no log", async () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    stubEnv("MAIL_DRIVER", "console");
    stubEnv("NODE_ENV", "development");
    await sendMail(message);
    expect(info.mock.calls[0][0]).toContain("para=a@b.com");
    expect(info.mock.calls[0][0]).toContain("corpo com link");
    info.mockRestore();
  });

  it("em producao nunca imprime o conteudo (o link daria acesso a conta)", async () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    stubEnv("MAIL_DRIVER", "console");
    stubEnv("NODE_ENV", "production");
    await sendMail(message);
    expect(info).not.toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).not.toContain("corpo com link");
    expect(error).toHaveBeenCalledTimes(1);
    info.mockRestore();
    error.mockRestore();
  });

  it("driver smtp usa o transporte do nodemailer e propaga a falha", async () => {
    jest.resetModules();
    const sendMailFn = jest.fn().mockRejectedValue(new Error("smtp fora"));
    jest.doMock("nodemailer", () => ({ createTransport: jest.fn(() => ({ sendMail: sendMailFn })) }));
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    stubEnv("MAIL_DRIVER", "smtp");
    stubEnv("SMTP_HOST", "smtp.teste");
    stubEnv("MAIL_FROM", "voa@teste");
    const { sendMail: smtpSend } = await import("../../src/lib/mail/mailer");
    await expect(smtpSend(message)).rejects.toThrow("smtp fora");
    expect(sendMailFn).toHaveBeenCalledWith({ from: "voa@teste", to: "a@b.com", subject: "Assunto", text: "corpo com link", html: "<p>x</p>" });
    error.mockRestore();
    jest.dontMock("nodemailer");
  });
});
