"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/client", label: "Mes biens" },
  { href: "/client/rendez-vous", label: "Rendez-vous" },
  { href: "/client/contact", label: "Contacter un service" },
];

/** Navigation de l'espace client : soulignement doré qui glisse vers l'onglet actif. */
export function ClientNav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-navy-100/80 bg-white/85 backdrop-blur-md" aria-label="Espace client">
      <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 sm:px-6">
        {ITEMS.map((item) => {
          const actif = item.href === "/client" ? pathname === "/client" || pathname.startsWith("/client/biens") : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={actif ? "page" : undefined}
              className={cn(
                "relative whitespace-nowrap px-3 py-3 text-small transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus",
                actif ? "font-medium text-navy-900" : "text-navy-400 hover:text-navy-900",
              )}
            >
              {item.label}
              {actif && (
                <motion.span
                  layoutId="client-nav-actif"
                  className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gold"
                  transition={{ type: "spring", stiffness: 500, damping: 36, mass: 0.7 }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
