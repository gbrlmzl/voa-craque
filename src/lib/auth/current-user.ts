import type { Role } from "@/generated/prisma/client";

/**
 * O usuario logado, do jeito que o servidor responde e o cliente recebe pelo
 * UserProvider. Precisa ser serializavel e nao carregar nada sensivel: este
 * modulo e importado por Client Components.
 */
export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  profileCompleted: boolean;
  /** Foto do perfil de jogador; sem ela, a foto do Google; sem as duas, null. */
  photoUrl: string | null;
  /** Falso em conta que so entra pelo Google. */
  hasPassword: boolean;
  googleLinked: boolean;
};
