import { prisma } from "@/lib/prisma";
import { pageAdmin } from "@/lib/session";
import { GameDayForm } from "@/components/forms/GameDayForm";
import { NEW_GAMEDAY } from "@/lib/gameday-defaults";

export const dynamic = "force-dynamic";

export default async function NewGameDayPage() {
  const admin = await pageAdmin("/game-days/new");

  // A chave e obrigatoria: a nova pelada ja vem com a da ultima que este organizador criou.
  const last = await prisma.gameDay.findFirst({
    where: { createdById: admin.id, pixKey: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { pixKey: true },
  });

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Nova pelada</h1>
      <GameDayForm initial={{ ...NEW_GAMEDAY, pixKey: last?.pixKey ?? "" }} />
    </div>
  );
}
