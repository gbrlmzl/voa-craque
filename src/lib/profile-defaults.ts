export type ProfileValues = {
  stars?: number | null;
  name: string;
  nickname: string;
  foot: string;
  position: string;
  age: string;
  heightCm: string;
  weightKg: string;
  photoUrl: string;
};

/**
 * Fica fora de ProfileForm.tsx ("use client") de proposito: um valor comum
 * (nao componente) importado dali por um Server Component vira uma referencia
 * de cliente vazia no servidor, entao os campos nasceriam undefined no SSR e
 * o React acusaria input trocando de nao controlado para controlado.
 */
export const EMPTY_PROFILE: ProfileValues = {
  name: "",
  nickname: "",
  foot: "RIGHT",
  position: "ALA",
  age: "",
  heightCm: "",
  weightKg: "",
  photoUrl: "",
};

/** Algum campo editavel mudou? `stars` fica de fora: o jogador nao edita. */
export function profileChanged(a: ProfileValues, b: ProfileValues): boolean {
  return (
    a.name !== b.name ||
    a.nickname !== b.nickname ||
    a.foot !== b.foot ||
    a.position !== b.position ||
    a.age !== b.age ||
    a.heightCm !== b.heightCm ||
    a.weightKg !== b.weightKg ||
    a.photoUrl !== b.photoUrl
  );
}
