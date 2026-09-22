import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PromoPro — Plateforme de gestion promoteur",
  description: "Gestion des projets, ventes, paiements et clients pour promoteurs immobiliers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
