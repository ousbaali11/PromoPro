import { Building2 } from "lucide-react";
import { requireRole } from "@/lib/session";
import { logout } from "@/app/login/actions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["SUPER_ADMIN"]);

  return (
    <div className="min-h-screen bg-cream">
      <header className="flex h-16 items-center justify-between border-b border-navy-100 bg-navy px-6">
        <div className="flex items-center gap-2 text-white">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gold">
            <Building2 className="h-4.5 w-4.5" />
          </div>
          <span className="text-sm font-semibold">PromoPro — Administration plateforme</span>
        </div>
        <form action={logout}>
          <button type="submit" className="text-xs text-navy-100/70 hover:text-white">
            Déconnexion
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
