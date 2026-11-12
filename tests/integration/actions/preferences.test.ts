import { setTeamLabelModeAction } from "@/actions/preferences";
import { TEAM_LABEL_COOKIE } from "@/lib/team-label";
import { cookieJar } from "../../helpers/next-env";
import { cookieWrites } from "../../helpers/session";

describe("setTeamLabelModeAction", () => {
  it.each(["letters", "numbers"])("valor valido (%s) grava o cookie por um ano", async (mode) => {
    expect(await setTeamLabelModeAction(mode)).toEqual({ ok: true });
    expect(cookieJar()[TEAM_LABEL_COOKIE]).toBe(mode);
    expect(cookieWrites()[0].options?.maxAge).toBe(60 * 60 * 24 * 365);
  });

  it("valor invalido devolve ok: false e nao grava nada", async () => {
    expect(await setTeamLabelModeAction("emojis")).toEqual({ ok: false });
    expect(cookieWrites()).toHaveLength(0);
  });
});
