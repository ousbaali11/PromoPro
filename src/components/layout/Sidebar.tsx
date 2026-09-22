"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { navFor, ROLE_LABELS } from "@/lib/roles";
import type { Role } from "@/db/schema";
import { logout } from "@/app/login/actions";

export function Sidebar({
  role,
  nom,
  prenom,
}: {
  role: Role;
  nom: string;
  prenom: string;
}) {
  const pathname = usePathname();
  const items = navFor(role);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-navy text-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gold">
          <Building2 className="h-4.5 w-4.5 text-white" />
        </div>
        <span className="text-sm font-semibold tracking-tight">PromoPro</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active ? "bg-white/10 text-white font-medium" : "text-navy-100/80 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        <div className="mb-2 px-2">
          <p className="text-sm font-medium text-white">
            {prenom} {nom}
          </p>
          <p className="text-xs text-navy-100/60">{ROLE_LABELS[role]}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-navy-100/70 hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Déconnexion
          </button>
        </form>
      </div>
    </aside>
  );
}
