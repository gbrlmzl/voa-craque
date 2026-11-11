/** Eventos de seguranca (logSecurityEvent) emitidos desde o inicio do teste. */
export function securityEvents(): Array<{ event: string; [key: string]: unknown }> {
  const calls = (console.warn as unknown as jest.Mock).mock.calls as unknown[][];
  return calls
    .map((args) => {
      try {
        return JSON.parse(String(args[0]));
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { type: string; event: string } => entry?.type === "security");
}
