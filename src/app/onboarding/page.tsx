import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { pageUser } from "@/lib/session";
import { ProfileForm } from "@/components/forms/ProfileForm";
import { EMPTY_PROFILE, type ProfileValues } from "@/lib/profile-defaults";

export const dynamic = "force-dynamic";

/** Primeiro acesso: sem perfil de jogador, ninguem circula pelo resto do site. */
export default async function OnboardingPage() {
  const user = await pageUser();
  if (user.profileCompleted) redirect("/");

  const profile = await prisma.playerProfile.findUnique({ where: { userId: user.id } });

  const initial: ProfileValues = profile
    ? {
        name: profile.name,
        nickname: profile.nickname ?? "",
        foot: profile.foot,
        position: profile.position,
        age: String(profile.age),
        heightCm: String(profile.heightCm),
        weightKg: String(profile.weightKg),
        photoUrl: profile.photoUrl ?? "",
      }
    : // Quem entrou pelo Google ja chega com a foto de la; da para trocar.
      { ...EMPTY_PROFILE, photoUrl: user.photoUrl ?? "" };

  return (
    <div className="mx-auto max-w-md px-5 py-10">
      <div className="mb-6">
        <p className="text-sm font-semibold text-pitch-400">Bem-vindo, {user.username}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Monte seu perfil de jogador</h1>
      </div>

      <ProfileForm initial={initial} mode="onboarding" />
    </div>
  );
}
