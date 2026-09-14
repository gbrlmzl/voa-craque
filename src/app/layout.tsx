import type { Metadata, Viewport } from "next";
import { PlayerModalProvider } from "@/components/player";
import { ToastProvider } from "@/components/toast";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <ToastProvider>
          <PlayerModalProvider>{children}</PlayerModalProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
