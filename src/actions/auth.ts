"use server";

import { AuthError } from "next-auth";
import { hash } from "bcryptjs";
import type { ZodError } from "zod";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { credentialsSchema, registerSchema } from "@/lib/validation";
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";

export type FormState = { message?: string; fieldErrors?: Record<string, string> };

function fieldErrorsOf(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

function safeNext(value: FormDataEntryValue | null): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: safeNext(formData.get("proximo")) });
  } catch (error) {
    if (error instanceof AuthError) return { message: "E-mail ou senha não conferem." };
    throw error;
  }
  return {};
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { fieldErrors: { email: "Já existe uma conta com este e-mail." } };
  }

  const user = await prisma.user.create({
    data: { name, email, passwordHash: await hash(password, 10) },
  });

  await recordAudit(
    { id: user.id, email: user.email, name: user.name, role: user.role, profileCompleted: false, photoUrl: null },
    {
      action: AUDIT_ACTIONS.USER_CREATED,
      entity: "User",
      entityId: user.id,
      summary: `${user.name} criou a conta`,
      after: { name: user.name, email: user.email, role: user.role },
    },
  );

  try {
    await signIn("credentials", { email, password, redirectTo: "/primeiro-acesso" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: "Conta criada. Entre com seu e-mail e senha." };
    }
    throw error;
  }
  return {};
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
