// Cada worker do Jest usa o proprio banco (criado pelo globalSetup). Roda antes de
// qualquer import de @/lib/prisma.
const base = process.env.DATABASE_URL;
if (base) {
  const url = new URL(base);
  const name = url.pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(`Recusado: o banco "${name}" nao termina em "_test".`);
  }
  url.pathname = `/${name}_${process.env.JEST_WORKER_ID ?? "1"}`;
  process.env.DATABASE_URL = url.toString();
}
