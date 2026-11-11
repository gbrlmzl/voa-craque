import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { pageUser } from "@/lib/session";
import { adminLinksFor } from "@/lib/admin-links";
import { Card, SectionTitle } from "@/components/ui";
import { ChangePasswordModal } from "@/components/forms/ChangePasswordModal";
import { PreferencesForm } from "@/components/forms/PreferencesForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await pageUser("/settings");
  const adminLinks = adminLinksFor(user.role);

  return (
    <div className="mx-auto grid max-w-lg gap-5">
      <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>

      <section>
        <SectionTitle>Preferências</SectionTitle>
        <PreferencesForm />
      </section>

      {user.hasPassword ? (
        <section>
          <SectionTitle>Senha</SectionTitle>
          <ChangePasswordModal username={user.username} />
        </section>
      ) : null}

      {adminLinks.length > 0 ? (
        <section>
          <SectionTitle>Administração</SectionTitle>
          <Card className="grid gap-1 p-2">
            {adminLinks.map(({ href, label, description, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-white/5"
              >
                <Icon size={20} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-100">{label}</span>
                  <span className="block text-xs text-slate-500">{description}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-slate-600" />
              </Link>
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
