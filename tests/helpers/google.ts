// Mock do arctic: o handshake com o Google nunca sai da maquina.
export const googleMock: { idToken: string; fail: boolean } = { idToken: "", fail: false };

function base64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** id_token sem assinatura (o app so le os claims, como documentado em google-oauth-state.ts). */
export function googleIdToken(claims: Record<string, unknown>) {
  return `${base64url({ alg: "none" })}.${base64url(claims)}.sem-assinatura`;
}

export function arcticMock() {
  const actual = jest.requireActual("arctic");
  class FakeGoogle {
    createAuthorizationURL(state: string) {
      return new URL(`https://accounts.google.com/o/oauth2/v2/auth?state=${state}`);
    }
    async validateAuthorizationCode() {
      if (googleMock.fail) throw new Error("code invalido");
      return { idToken: () => googleMock.idToken };
    }
  }
  return { ...actual, Google: FakeGoogle };
}
