// Troca de "@/actions/auth" nos specs de componente (ver cypress.config.ts).
import type { FormState } from "../../../src/actions/auth";

export type { FormState };
export async function loginAction(): Promise<FormState> {
  return {};
}
export async function registerAction(): Promise<FormState> {
  return {};
}
export async function googleSignInAction(): Promise<void> {}
export async function logoutAction(): Promise<void> {}
