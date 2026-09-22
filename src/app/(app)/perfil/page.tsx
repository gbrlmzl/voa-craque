import { prisma } from "@/lib/prisma";
import { pageUserWithProfile } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/labels";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { SkillTag, Stars } from "@/components/player";
import { EMPTY_PROFILE, ProfileForm, type ProfileValues } from "@/components/forms/ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await pageUserWithProfile();

  const profile = await prisma.playerProfile.findUnique({
    where: { userId: user.id },
    include: { skills: { include: { skill: true } } },
  });

  const initial: ProfileValues = profile
    ? {
        nickname: profile.nickname ?? "",
        foot: profile.foot,
        position: profile.position,
        age: String(profile.age),
        heightCm: String(profile.heightCm),
        weightKg: String(profile.weightKg),
        photoUrl: profile.photoUrl ?? "",
      }
    : EMPTY_PROFILE;

  return (
    <div className="mx-auto grid max-w-lg gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-slate-400">
          {user.email} <Badge>{ROLE_LABEL[user.role]}</Badge>
        </p>
      </div>

      <section>
        <SectionTitle hint="definido pelo organizador">Sua avaliação</SectionTitle>
        <Card className="grid gap-3">
          <Stars value={profile?.stars ?? null} size={20} />
          {profile && profile.skills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {profile.skills.map((entry) => (
                <SkillTag key={entry.skillId} label={entry.skill.label} polarity={entry.skill.polarity} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Nenhuma skill atribuída ainda.</p>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>Seus dados</SectionTitle>
        <ProfileForm name={user.name} initial={initial} mode="edit" />
      </section>

      <section>
        <SectionTitle>Formas de entrar</SectionTitle>
        <Card className="grid gap-2 text-sm">
          <SignInMethod label="E-mail e senha" enabled={user.hasPassword} />
          <SignInMethod label="Google" enabled={user.googleLinked} />
        </Card>
      </section>
    </div>
  );
}

function SignInMethod({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-300">{label}</span>
      <Badge tone={enabled ? "good" : "neutral"}>{enabled ? "Ativo" : "Não usado"}</Badge>
    </div>
  );
}
