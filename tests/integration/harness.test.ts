import { ACCESS_COOKIE_NAME } from "@/lib/auth/config";
import { GET } from "@/app/api/game-days/route";
import { actAs, asVisitor } from "../helpers/session";
import { callRoute } from "../helpers/route";
import { createGameDay, createPlayer } from "../helpers/factories";

describe("harness de integracao", () => {
  it("visitante recebe 401 em rota protegida", async () => {
    asVisitor();
    const res = await callRoute(GET);
    expect(res.status).toBe(401);
  });

  it("jogador logado lista as peladas do banco", async () => {
    const user = await createPlayer();
    await createGameDay({ title: "Pelada de quarta" });
    await actAs(user);
    const res = await callRoute(GET);
    expect(res.status).toBe(200);
    expect(res.json.gameDays).toHaveLength(1);
    expect(ACCESS_COOKIE_NAME).toBe("voacraque.session");
  });

  it("cada teste comeca com o banco vazio", async () => {
    const res = await callRoute(GET);
    expect(res.status).toBe(401);
    await createPlayer({ username: "jogador01" });
  });

  it("dois testes podem criar o mesmo username", async () => {
    await createPlayer({ username: "jogador01" });
  });
});
