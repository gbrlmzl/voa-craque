export function formData(values: Record<string, string | boolean | undefined | null>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === false) continue;
    form.set(key, value === true ? "on" : value);
  }
  return form;
}

/** Espera que a Server Action chame redirect(); devolve o destino. */
export async function redirectOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const digest = (error as { digest?: string }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return digest.split(";")[2];
    }
    throw error;
  }
  throw new Error("A action nao chamou redirect()");
}
