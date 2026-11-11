import type { User } from "@/generated/prisma/client";
import { ACCESS_COOKIE_NAME } from "@/lib/auth/config";
import { signAccessToken } from "@/lib/auth/tokens";
import { clearCookies, cookieWrites, setCookie, setRequestHeader } from "./next-env";

/** Daqui em diante o teste fala como `user` (cookie de sessao valido). */
export async function actAs(user: Pick<User, "id">, now?: Date) {
  setCookie(ACCESS_COOKIE_NAME, await signAccessToken(user.id, now));
}

/** Sem cookie nenhum: visitante. */
export function asVisitor() {
  clearCookies();
}

export { cookieWrites, setRequestHeader };
