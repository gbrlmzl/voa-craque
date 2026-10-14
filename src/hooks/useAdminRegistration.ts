"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/providers/ToastProvider";
import { remainingSlots } from "@/lib/admin-registration";

export type RegistrationCandidate = {
  userId: string;
  name: string;
  nickname: string | null;
  photoUrl: string | null;
  positionLabel: string;
  stars: number | null;
  profileCompleted: boolean;
};

export function useAdminRegistration(
  gameDayId: string,
  registeredCount: number,
  maxPlayers: number,
) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<RegistrationCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "ON_SITE">("ON_SITE");
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const slots = remainingSlots(registeredCount, maxPlayers);

  async function loadCandidates() {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/game-days/${gameDayId}/registrations/candidates`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar os jogadores.");
      setCandidates(body.candidates);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function openModal() {
    setOpen(true);
    setQuery("");
    setSelected(new Set());
    setMessage(null);
    void loadCandidates();
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
  }

  function toggle(userId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else if (next.size < slots) {
        next.add(userId);
      } else {
        setMessage("Não há mais vagas. Aumente o limite em Editar pelada.");
      }
      return next;
    });
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return candidates;
    return candidates.filter((candidate) =>
      `${candidate.name} ${candidate.nickname ?? ""}`.toLowerCase().includes(normalized),
    );
  }, [candidates, query]);

  async function removeCreated(ids: string[]) {
    for (const registrationId of ids) {
      const response = await fetch(`/api/game-days/${gameDayId}/registrations/${registrationId}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível desfazer.");
    }
    router.refresh();
    toast.show({ message: "Inscrição desfeita.", tone: "neutral" });
  }

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/game-days/${gameDayId}/registrations/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [...selected], paymentMethod, alreadyPaid }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível inscrever.");
      const created = body.created as { registrationId: string; name: string }[];
      const count = created.length;
      const reserveSuffix = body.asReserve ? " como reserva" : "";
      const message =
        count === 1
          ? `${created[0].name} inscrito${reserveSuffix}.`
          : `${count} jogadores inscritos${reserveSuffix}.`;
      setOpen(false);
      setSelected(new Set());
      router.refresh();
      toast.show({
        message,
        tone: "success",
        actionLabel: "Desfazer",
        onAction: () => {
          void removeCreated(created.map((row) => row.registrationId)).catch((error: unknown) => {
            toast.show({ message: (error as Error).message, tone: "error" });
          });
        },
      });
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return {
    open,
    openModal,
    closeModal,
    candidates,
    filtered,
    loading,
    loadError,
    loadCandidates,
    query,
    setQuery,
    selected,
    toggle,
    paymentMethod,
    setPaymentMethod,
    alreadyPaid,
    setAlreadyPaid,
    busy,
    message,
    submit,
    slots,
  };
}
