"use client";

import { useEffect, useState } from "react";
import { Menu, X, Building2 } from "lucide-react";
import { Sidebar } from "./Sidebar";
import type { Role } from "@/db/schema";

/**
 * Coquille du dashboard : sidebar fixe ≥ 768px, tiroir avec bouton hamburger
 * en dessous. Le tiroir se referme quand on clique un lien du menu.
 */
export function DashboardShell({
  role,
  nom,
  prenom,
  roleLabel,
  bell,
  children,
}: {
  role: Role;
  nom: string;
  prenom: string;
  roleLabel: string;
  bell: React.ReactNode;
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
      {open && <div className="fixed inset-0 z-30 bg-navy-900/50 md:hidden" onClick={() => setOpen(false)} />}

      <div
        className={`fixed inset-y-0 left-0 z-40 h-screen transform transition-transform duration-200 md:sticky md:top-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar role={role} nom={nom} prenom={prenom} onNavigate={() => setOpen(false)} />
        {open && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-2 top-4 rounded-md p-1.5 text-navy-100/80 hover:bg-white/10 md:hidden"
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-navy-100 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-md p-2 text-navy hover:bg-navy-50 md:hidden"
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
              <p className="text-xs text-navy-400">PromoPro</p>
              <p className="text-sm font-medium text-navy-900">{roleLabel}</p>
            </div>
          </div>
          {bell}
        </header>
        <main className="min-w-0 flex-1 bg-cream p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
