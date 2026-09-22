import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { Building2 } from "lucide-react";
import { requireClientSession } from "@/lib/session";
import { logout } from "@/app/login/actions";
import { db } from "@/db/client";
import { notifications as notificationsTable } from "@/db/schema";
import { NotificationBell } from "@/components/layout/NotificationBell";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await requireClientSession();

  const notifs = await db.query.notifications.findMany({
    where: and(eq(notificationsTable.recipientType, "CLIENT"), eq(notificationsTable.clientId, session.clientId)),
    orderBy: [desc(notificationsTable.createdAt)],
    limit: 20,
  });

  return (
    <div className="min-h-screen bg-cream">
      <header className="flex h-16 items-center justify-between border-b border-navy-100 bg-navy px-4 sm:px-6">
        <div className="flex items-center gap-2 text-white">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gold">
            <Building2 className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">PromoPro</p>
            <p className="text-[11px] leading-tight text-navy-100/70">
              {session.prenom} {session.nom}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell notifications={notifs} dark />
          <form action={logout}>
            <button type="submit" className="text-xs text-navy-100/70 hover:text-white">
              Déconnexion
            </button>
          </form>
        </div>
      </header>
      <nav className="border-b border-navy-100 bg-white">
        <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-4 sm:px-6">
          {[
            { href: "/client", label: "Mes biens" },
            { href: "/client/rendez-vous", label: "Rendez-vous" },
            { href: "/client/contact", label: "Contacter un service" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm text-navy-400 hover:border-gold hover:text-navy-900"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
      <main className="mx-auto max-w-3xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
