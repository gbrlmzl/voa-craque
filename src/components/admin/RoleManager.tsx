"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayerChip } from "@/components/player";
import { useToast } from "@/components/toast";
import { Card, Select } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/labels";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  photoUrl: string | null;
  role: "SUPERADMIN" | "ADMIN" | "USER";
  hasProfile: boolean;
};

export function RoleManager({ users, currentUserId }: { users: ManagedUser[]; currentUserId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function change(user: ManagedUser, role: ManagedUser["role"]) {
    setBusy(user.id);
    try {
      const response = await fetch(`/api/usuarios/${user.id}/papel`, {
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

  return (
    <Card className="grid gap-1 p-2">
      {users.map((user) => (
        <div key={user.id} className="flex items-center gap-2 rounded-xl px-1 py-1 hover:bg-white/5">
          {user.hasProfile ? (
            <PlayerChip
              userId={user.id}
              name={user.name}
              photoUrl={user.photoUrl}
              subtitle={user.email}
              className="min-w-0 flex-1"
            />
          ) : (
            <div className="min-w-0 flex-1 px-1.5 py-1">
              <p className="truncate text-sm font-medium text-slate-100">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{user.email} · sem perfil</p>
            </div>
          )}

          <Select
            value={user.role}
            disabled={busy === user.id || user.id === currentUserId}
            onChange={(event) => change(user, event.target.value as ManagedUser["role"])}
            className="h-11 w-36 shrink-0"
            aria-label={`Papel de ${user.name}`}
          >
            <option value="USER">Jogador</option>
            <option value="ADMIN">Organizador</option>
            <option value="SUPERADMIN">Superadmin</option>
          </Select>
        </div>
      ))}
    </Card>
  );
}
