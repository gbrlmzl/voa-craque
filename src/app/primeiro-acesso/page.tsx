import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { pageUser } from "@/lib/session";
import { EMPTY_PROFILE, ProfileForm, type ProfileValues } from "@/components/forms/ProfileForm";

export const dynamic = "force-dynamic";

/** Primeiro acesso: sem perfil de jogador, ninguem circula pelo resto do site. */
export default async function OnboardingPage() {
  const user = await pageUser();
  if (user.profileCompleted) redirect("/");

  const profile = await prisma.playerProfile.findUnique({ where: { userId: user.id } });

  const initial: ProfileValues = profile
    ? {
        nickname: profile.nickname ?? "",
        foot: profile.foot,
        position: profile.position,
        age: String(profile.age),
        heightCm: String(profile.heightCm),
        weightKg: String(profile.weightKg),
        course: profile.course,
        courseName: profile.courseName ?? "",
        photoUrl: profile.photoUrl ?? "",
      }
    : EMPTY_PROFILE;

  return (
    <div className="mx-auto max-w-md px-5 py-10">
      <div className="mb-6">
        <p className="text-sm font-semibold text-pitch-400">Bem-vindo, {user.name.split(" ")[0]}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Monte seu perfil de jogador</h1>
        <p className="mt-2 text-sm text-slate-400">
          Esses dados alimentam o sorteio de times. Leva menos de um minuto.
        </p>
      </div>

      <ProfileForm name={user.name} initial={initial} mode="onboarding" />
    </div>
  );
}
