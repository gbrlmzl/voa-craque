"use client";

import { PlayerChip } from "@/components/Player";
import { Card, Select } from "@/components/ui";
import { type ManagedUser, useRoleManager } from "@/hooks/useRoleManager";

export type { ManagedUser } from "@/hooks/useRoleManager";

export function RoleManager({ users, currentUserId }: { users: ManagedUser[]; currentUserId: string }) {
  const { busy, change } = useRoleManager();

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
