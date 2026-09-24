import Link from "next/link";
import { Building2, LogOut, ScrollText } from "lucide-react";
import { requireRole } from "@/lib/session";
import { logout } from "@/app/login/actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["SUPER_ADMIN"]);

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-navy px-4 py-2 text-white shadow-e3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold shadow-e2">
            <Building2 className="h-[18px] w-[18px]" strokeWidth={2} />
          </div>
          <div>
            <p className="text-h3 leading-none tracking-tight">PromoPro</p>
            <p className="mt-1 text-label uppercase text-navy-200/80">Administration plateforme</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href="/admin/journal"
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-caption text-navy-100/70 transition-colors duration-fast hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:shadow-focus"
          >
            <ScrollText className="h-3.5 w-3.5" />
            Journal d&apos;activité
          </Link>
          <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-caption text-navy-100/70 transition-colors duration-fast hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:shadow-focus"
          >
            <LogOut className="h-3.5 w-3.5" />
            Déconnexion
          </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
