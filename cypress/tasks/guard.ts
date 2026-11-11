// Toda task do E2E passa por aqui: o banco precisa terminar em "_e2e".
export function assertE2eDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith("_e2e")) {
    throw new Error(`Recusado: o banco "${name}" nao termina em "_e2e". As tasks do Cypress so mexem no banco do E2E.`);
  }
}

export function reply(value: unknown) {
  // O cypress.config le a ULTIMA linha do stdout como JSON.
  console.log(JSON.stringify(value ?? null));
}
