"use client";

import { usePathname } from "next/navigation";
import { Onglets } from "@/components/ui/Onglets";

const ITEMS = [
  { href: "/client", label: "Mes biens" },
  { href: "/client/rendez-vous", label: "Rendez-vous" },
  { href: "/client/contact", label: "Contacter un service" },
];

/** Navigation de l'espace client : onglets soulignés (composant partagé Onglets), l'actif suit l'URL. */
export function ClientNav() {
  const pathname = usePathname();
  const actif = ITEMS.find((item) => (item.href === "/client" ? pathname === "/client" || pathname.startsWith("/client/biens") : pathname.startsWith(item.href)))?.href ?? "/client";
  return (
    <div className="bg-white/85 backdrop-blur-md">
      <Onglets ariaLabel="Espace client" value={actif} items={ITEMS.map((item) => ({ value: item.href, label: item.label, href: item.href }))} className="mx-auto max-w-4xl px-4 sm:px-6" />
    </div>
  );
}
