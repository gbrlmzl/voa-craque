import { AppShell } from "@/components/AppShell";
import { pageUserWithProfile } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await pageUserWithProfile();

  return (
    <AppShell user={{ name: user.name, role: user.role, photoUrl: user.photoUrl }}>{children}</AppShell>
  );
}
