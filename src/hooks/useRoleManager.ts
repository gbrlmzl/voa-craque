"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { ROLE_LABEL } from "@/lib/labels";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  role: "SUPERADMIN" | "ADMIN" | "USER";
  hasProfile: boolean;
};

export function useRoleManager() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function change(user: ManagedUser, role: ManagedUser["role"]) {
    setBusy(user.id);
    try {
      const response = await fetch(`/api/users/${user.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível alterar o papel.");
      toast.show({ message: `${user.name} agora é ${ROLE_LABEL[role]}.`, tone: "success" });
      router.refresh();
    } catch (error) {
      toast.show({ message: (error as Error).message, tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  return { busy, change };
}
