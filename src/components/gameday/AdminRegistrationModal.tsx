"use client";

import { Check, UserPlus } from "lucide-react";
import { Avatar, Stars } from "@/components/Player";
import { Button, Input, Modal } from "@/components/ui";
import { SkeletonChipList } from "@/components/Skeleton";
import { cn } from "@/lib/cn";
import { useAdminRegistration } from "@/hooks/useAdminRegistration";

export function AdminRegistrationModal({
  gameDayId,
  status,
  matchStarted,
  registeredCount,
  maxPlayers,
}: {
  gameDayId: string;
  status: "OPEN" | "TEAMS_SET" | "LIVE";
  matchStarted: boolean;
  registeredCount: number;
  maxPlayers: number;
}) {
  const state = useAdminRegistration(gameDayId, registeredCount, maxPlayers);
  const phaseMessage =
    status === "LIVE" || matchStarted
      ? "A pelada já começou. Quem você inscrever entra como reserva e pode entrar por substituição no painel ao vivo."
      : "Os times já foram montados. Quem você inscrever entra como reserva; para colocá-lo num time, use Refazer times.";
  const selectedCount = state.selected.size;

  return (
    <>
      <Button variant="secondary" size="lg" className="w-full" onClick={state.openModal}>
        <UserPlus size={18} /> Inscrever jogadores
      </Button>

      <Modal
        open={state.open}
        onClose={state.closeModal}
        title="Inscrever jogadores"
        className="flex max-h-[85dvh] max-w-md flex-col"
      >
        {status !== "OPEN" ? (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-300">{phaseMessage}</p>
        ) : null}
        <p className="text-xs text-slate-400">
          {registeredCount}/{maxPlayers} inscritos ·{" "}
          {selectedCount ? `${selectedCount} de ${state.slots} vagas escolhidas` : `${state.slots} vagas`}
        </p>
        <Input
          type="search"
          placeholder="Buscar por nome ou apelido"
          value={state.query}
          onChange={(event) => state.setQuery(event.target.value)}
          aria-label="Buscar por nome ou apelido"
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {state.loading ? (
            <SkeletonChipList rows={4} />
          ) : state.loadError ? (
            <div className="grid gap-2 py-4 text-center text-sm text-rose-300">
              <p>{state.loadError}</p>
              <Button variant="secondary" size="sm" onClick={() => void state.loadCandidates()}>
                Tentar de novo
              </Button>
            </div>
          ) : state.candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Todo mundo já está inscrito nesta pelada.</p>
          ) : state.filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Ninguém com esse nome.</p>
          ) : (
            <div className="grid gap-1">
              {state.filtered.map((candidate) => {
                const checked = state.selected.has(candidate.userId);
                return (
                  <button
                    key={candidate.userId}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => state.toggle(candidate.userId)}
                    className={cn(
                      "touch-target flex items-center gap-2 rounded-xl px-2 text-left transition-colors",
                      checked ? "bg-pitch-500/10" : "hover:bg-white/5",
                    )}
                  >
                    <Avatar name={candidate.name} photoUrl={candidate.photoUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-100">
                        {candidate.name}
                        {candidate.nickname ? ` (${candidate.nickname})` : ""}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{candidate.positionLabel}</span>
                        <Stars value={candidate.stars} size={11} />
                        {!candidate.profileCompleted ? (
                          <span className="text-amber-300">Perfil incompleto</span>
                        ) : null}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                        checked
                          ? "border-pitch-500 bg-pitch-500 text-night-950"
                          : "border-slate-600 text-transparent",
                      )}
                    >
                      <Check size={15} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid gap-3 border-t border-white/10 pt-3">
          <div className="grid grid-cols-2 gap-2">
            {([
              ["ON_SITE", "No local"],
              ["PIX", "PIX"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={state.paymentMethod === value}
                onClick={() => state.setPaymentMethod(value)}
                className={cn(
                  "touch-target rounded-xl text-sm font-semibold",
                  state.paymentMethod === value
                    ? "bg-pitch-500/15 text-pitch-300 ring-1 ring-pitch-500/50"
                    : "bg-night-800/60 text-slate-300 ring-1 ring-white/10",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              className="h-5 w-5 accent-pitch-500"
              checked={state.alreadyPaid}
              onChange={(event) => state.setAlreadyPaid(event.target.checked)}
            />
            <span>
              Já recebi o pagamento
              <span className="block text-xs text-slate-500">Sem marcar, o pagamento fica pendente em Pagamentos.</span>
            </span>
          </label>
          {state.message ? <p className="text-sm text-rose-300">{state.message}</p> : null}
          <Button size="lg" className="w-full" disabled={!selectedCount || state.busy} onClick={() => void state.submit()}>
            {state.busy
              ? "Inscrevendo..."
              : selectedCount === 1
                ? "Inscrever jogador"
                : `Inscrever ${selectedCount} jogadores`}
          </Button>
        </div>
      </Modal>
    </>
  );
}
