"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X, Building2 } from "lucide-react";
import { Sidebar } from "./Sidebar";
import type { Role } from "@/db/schema";

/**
 * Coquille du dashboard : sidebar fixe ≥ 768px, tiroir animé avec bouton
 * hamburger en dessous. Le tiroir se referme quand on clique un lien du menu.
 */
export function DashboardShell({
  role,
  nom,
  prenom,
  roleLabel,
  bell,
  recherche,
  children,
}: {
  role: Role;
  nom: string;
  prenom: string;
  roleLabel: string;
  bell: React.ReactNode;
  /** Recherche globale (bouton + Ctrl/Cmd+K), à droite de l'en-tête */
  recherche?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex min-h-screen">
      {/* Voile mobile */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-30 bg-navy-900/50 backdrop-blur-[2px] md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "linear" }}
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <div
        className={`fixed inset-y-0 left-0 z-40 h-screen transform transition-transform duration-slow ease-out-soft md:sticky md:top-0 md:translate-x-0 ${
          open ? "translate-x-0 shadow-e5" : "-translate-x-full"
        }`}
      >
        <Sidebar role={role} nom={nom} prenom={prenom} onNavigate={() => setOpen(false)} />
        {open && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-2 top-4 rounded-sm p-1.5 text-navy-100/80 transition-colors duration-fast hover:bg-white/10 md:hidden"
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-navy-100/80 bg-white/85 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-sm p-2 text-navy transition-colors duration-fast hover:bg-navy-50 focus-visible:outline-none focus-visible:shadow-focus md:hidden"
              aria-label="Ouvrir le menu"
              aria-expanded={open}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 md:hidden">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gold">
                <Building2 className="h-4 w-4 text-white" />
              </div>
            </div>
            <div>
              <p className="text-label uppercase text-navy-400">PromoPro</p>
              <p className="text-small font-medium text-navy-900">{roleLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {recherche}
            {bell}
          </div>
        </header>
        <main className="min-w-0 flex-1 bg-cream p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
