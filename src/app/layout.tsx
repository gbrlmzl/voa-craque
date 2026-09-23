import type { Metadata, Viewport } from "next";
import { getSessionPromise } from "@/lib/session";
import { PlayerModalProvider } from "@/components/providers/PlayerModalProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { UserProvider } from "@/components/providers/UserProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Voa Craque",
  description: "Gestão das peladas de futsal: inscrição, times equilibrados e partida ao vivo.",
};

export const viewport: Viewport = {
  themeColor: "#060b10",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// Sem async e sem await, de proposito: a sessao segue como promise e so quem
// le o usuario espera por ela (ver src/components/providers/UserProvider.tsx).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const session = getSessionPromise();

  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <UserProvider session={session}>
          <ToastProvider>
            <PlayerModalProvider>{children}</PlayerModalProvider>
          </ToastProvider>
        </UserProvider>
      </body>
    </html>
  );
}
