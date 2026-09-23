import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent } from "@/lib/security-log";

// Hash de uma senha que ninguem tem, calculado uma vez. Comparar contra ele
// quando o e-mail nao existe iguala o tempo de resposta dos dois ramos; sem
// isso, "e-mail inexistente" responderia bem mais rapido que "senha errada".
// Comeca a calcular ja no carregamento, senao a primeira tentativa depois do
// boot pagaria o hash a mais e voltaria a denunciar o e-mail inexistente.
const dummyHash = hash("voacraque:senha-que-ninguem-tem", 10);
const getDummyHash = () => dummyHash;

export type VerifiedUser = { id: string; username: string };

/**
 * A mensagem para quem tenta e sempre a mesma; a diferenca vai so para o log,
 * porque e ela que da sentido ao alerta: user_not_found repetido do mesmo IP e
 * varredura de usuarios, invalid_password repetido na mesma conta e forca bruta.
 */
export async function verifyCredentials(
  username: string,
  password: string,
  ip: string,
): Promise<VerifiedUser | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, active: true, passwordHash: true },
  });

  if (!user?.passwordHash) {
    await compare(password, await getDummyHash());
    logSecurityEvent("login_failed", { reason: user ? "no_local_password" : "user_not_found", username, ip });
    return null;
  }

  if (!(await compare(password, user.passwordHash))) {
    logSecurityEvent("login_failed", { reason: "invalid_password", userId: user.id, ip });
    return null;
  }

  // Depois do bcrypt, para "conta desativada" custar o mesmo tempo que "senha errada".
  if (!user.active) {
    logSecurityEvent("login_failed", { reason: "inactive", userId: user.id, ip });
    return null;
  }

  return { id: user.id, username: user.username };
}
