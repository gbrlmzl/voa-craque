import { prisma } from "@/lib/prisma";
import { pageUserWithProfile } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/labels";
import { Badge, SectionTitle } from "@/components/ui";
import { ProfileForm } from "@/components/forms/ProfileForm";
import { EMPTY_PROFILE, type ProfileValues } from "@/lib/profile-defaults";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await pageUserWithProfile("/profile");

  const profile = await prisma.playerProfile.findUnique({ where: { userId: user.id } });

  const initial: ProfileValues = profile
    ? {
        stars: profile.stars,
        name: profile.name,
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
        <h1 className="text-2xl font-bold tracking-tight">{user.name ?? user.username}</h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-slate-400">
          {user.email} <Badge>{ROLE_LABEL[user.role]}</Badge>
        </p>
      </div>

      <section>
        <SectionTitle>Seus dados</SectionTitle>
        <ProfileForm initial={initial} mode="edit" />
      </section>
    </div>
  );
}
