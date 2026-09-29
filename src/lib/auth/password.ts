import { hash } from "bcryptjs";

/** Custo do bcrypt para toda senha nova, num lugar so: registro, troca e redefinicao. */
export const PASSWORD_HASH_COST = 10;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, PASSWORD_HASH_COST);
}
