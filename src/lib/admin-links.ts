import { ClipboardList, ScrollText, Settings, Users, type LucideIcon } from "lucide-react";
import type { Role } from "@/generated/prisma/client";

export type AdminLink = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  roles: Role[];
};

/** Telas de gestao, listadas em /settings conforme o papel de quem entrou. */
export const ADMIN_LINKS: AdminLink[] = [
  {
    href: "/players",
    label: "Avaliar jogadores",
    description: "Dê notas e acompanhe a avaliação dos jogadores.",
    icon: ClipboardList,
    roles: ["ADMIN", "SUPERADMIN"],
  },
  {
    href: "/admin/users",
    label: "Usuários e papéis",
    description: "Defina quem é jogador, admin ou superadmin.",
    icon: Users,
    roles: ["SUPERADMIN"],
  },
  {
    href: "/admin/system",
    label: "Sistema",
    description: "Site público, inscrições, manutenção e MMR.",
    icon: Settings,
    roles: ["SUPERADMIN"],
  },
  {
    href: "/admin/audit",
    label: "Auditoria",
    description: "Histórico das ações feitas no sistema.",
    icon: ScrollText,
    roles: ["SUPERADMIN"],
  },
];

export function adminLinksFor(role: Role): AdminLink[] {
  return ADMIN_LINKS.filter((link) => link.roles.includes(role));
}
