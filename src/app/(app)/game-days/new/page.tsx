import { pageAdmin } from "@/lib/session";
import { GameDayForm, NEW_GAMEDAY } from "@/components/forms/GameDayForm";

export const dynamic = "force-dynamic";

export default async function NewGameDayPage() {
  await pageAdmin();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Nova pelada</h1>
      <GameDayForm initial={NEW_GAMEDAY} />
    </div>
  );
}
