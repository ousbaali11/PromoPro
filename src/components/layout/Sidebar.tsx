"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Building2, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { navFor, ROLE_LABELS } from "@/lib/roles";
import type { Role } from "@/db/schema";
import { logout } from "@/app/login/actions";

/**
 * Navigation latérale : fond navy, indicateur d'entrée active qui glisse
 * d'un item à l'autre (layoutId), bloc utilisateur en pied.
 */
export function Sidebar({
  role,
  nom,
  prenom,
  onNavigate,
}: {
  role: Role;
  nom: string;
  prenom: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = navFor(role);
  const initiales = `${prenom[0] ?? ""}${nom[0] ?? ""}`.toUpperCase();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col overflow-y-auto bg-navy text-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold shadow-e2">
          <Building2 className="h-[18px] w-[18px] text-white" strokeWidth={2} />
        </div>
        <div>
          <p className="text-h3 leading-none tracking-tight">PromoPro</p>
          <p className="mt-1 text-label uppercase text-navy-200/80">Plateforme promoteur</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2" aria-label="Navigation principale">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-sm px-3 py-2 text-small transition-colors duration-fast ease-linear",
                "focus-visible:outline-none focus-visible:shadow-focus",
                active ? "font-medium text-white" : "text-navy-100/75 hover:bg-white/5 hover:text-white",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-actif"
                  className="absolute inset-0 rounded-sm bg-white/10 ring-1 ring-inset ring-white/10"
                  transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
                />
              )}
              {active && (
                <motion.span
                  layoutId="nav-actif-barre"
                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gold"
                  transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }}
                />
              )}
              <Icon className={cn("relative h-4 w-4 shrink-0", active ? "text-gold" : "text-navy-200/80")} />
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-3 py-3">
        <div className="flex items-center gap-3 rounded-sm px-2 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-caption font-semibold text-gold ring-1 ring-inset ring-white/10">
            {initiales}
          </span>
          <div className="min-w-0">
            <p className="truncate text-small font-medium text-white">
              {prenom} {nom}
            </p>
            <p className="truncate text-caption text-navy-200/70">{ROLE_LABELS[role]}</p>
          </div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="mt-1 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-caption text-navy-100/70 transition-colors duration-fast hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:shadow-focus"
          >
            <LogOut className="h-3.5 w-3.5" />
            Déconnexion
          </button>
        </form>
      </div>
    </aside>
  );
}
