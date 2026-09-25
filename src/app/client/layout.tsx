import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Building2, LogOut } from "lucide-react";
import { getSessionActive, requireClientSession } from "@/lib/session";
import { logout } from "@/app/login/actions";
import { db } from "@/db/client";
import { notifications as notificationsTable, promoteurs } from "@/db/schema";

/*
 * L'espace client est celui du promoteur, pas de la plateforme : son nom (et
 * son logo) en en-tête et dans le titre de l'onglet. « PromoPro » n'apparaît
 * qu'à la connexion, dans l'administration et les pages techniques.
 */
export async function generateMetadata(): Promise<Metadata> {
  const session = await getSessionActive();
  if (!session || session.kind !== "client") return { title: "Espace client" };
  const promoteur = await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, session.promoteurId) });
  return { title: promoteur ? `${promoteur.nom} — Espace client` : "Espace client" };
}
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ClientNav } from "./ClientNav";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const session = await requireClientSession();
  const promoteur = await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, session.promoteurId) });

  const notifs = await db.query.notifications.findMany({
    where: and(eq(notificationsTable.recipientType, "CLIENT"), eq(notificationsTable.clientId, session.clientId)),
    orderBy: [desc(notificationsTable.createdAt)],
    limit: 20,
  });
  const initiales = `${session.prenom[0] ?? ""}${session.nom[0] ?? ""}`.toUpperCase();

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-20 bg-navy text-white shadow-e3">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/client"
            className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-sm py-1 pr-2 transition-colors duration-fast hover:bg-white/5 focus-visible:outline-none focus-visible:shadow-focus"
            aria-label={`${promoteur?.nom ?? "Espace client"} — retour à l'accueil`}
            data-testid="lien-accueil"
          >
            {promoteur?.logoUrl ? (
              // Fichier servi par /api/files avec la session : pas d'optimiseur d'image Next (il n'a pas le cookie)
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={promoteur.logoUrl}
                alt={`Logo ${promoteur.nom}`}
                className="h-9 w-9 rounded-md bg-white object-contain shadow-e2"
                data-testid="logo-promoteur-client"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold shadow-e2">
                <Building2 className="h-[18px] w-[18px]" strokeWidth={2} />
              </div>
            )}
            <div>
              <p className="text-h3 leading-none tracking-tight" data-testid="entete-promoteur">
                {promoteur?.nom ?? "Espace client"}
              </p>
              <p className="mt-1 text-label uppercase text-navy-200/80">Espace client</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationBell notifications={notifs} dark />
            <div className="ml-1 hidden items-center gap-2 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-caption font-semibold text-gold-200 ring-1 ring-inset ring-white/10">
                {initiales}
              </span>
              <span className="text-small text-navy-100">
                {session.prenom} {session.nom}
              </span>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-caption text-navy-100/70 transition-colors duration-fast hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:shadow-focus"
              >
                <LogOut className="h-3.5 w-3.5" />
                Déconnexion
              </button>
            </form>
          </div>
        </div>
      </header>
      <ClientNav />
      <main className="mx-auto max-w-4xl p-4 sm:p-6 lg:py-8">{children}</main>
    </div>
  );
}
