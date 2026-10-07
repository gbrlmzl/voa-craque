import type { Metadata, Viewport } from "next";
import { getTeamLabelModePromise } from "@/lib/preferences";
import { getSessionPromise } from "@/lib/session";
import { PlayerModalProvider } from "@/components/providers/PlayerModalProvider";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
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

// Sem async e sem await, de proposito: a sessao e a preferencia de nome dos
// times seguem como promise e so quem le espera por elas (ver
// src/components/providers/UserProvider.tsx).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const session = getSessionPromise();
  const teamLabelMode = getTeamLabelModePromise();

  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <UserProvider session={session}>
          <PreferencesProvider teamLabelMode={teamLabelMode}>
            <ToastProvider>
              <PlayerModalProvider>{children}</PlayerModalProvider>
            </ToastProvider>
          </PreferencesProvider>
        </UserProvider>
      </body>
    </html>
  );
}
