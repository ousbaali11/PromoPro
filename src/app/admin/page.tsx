import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { Building2, CalendarClock, Plus, Users } from "lucide-react";
import { db } from "@/db/client";
import { promoteurs, users } from "@/db/schema";
import { PageHeader, Stat, EmptyState, Card } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LinkButton } from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { ROLES_DIRECTION, titulairesActifs } from "@/lib/directions";
import { LABELS_STATUT_PROMOTEUR, TONES_STATUT_PROMOTEUR } from "./statut-promoteur";

/*
 * Administration plateforme : une fiche par promoteur (nom, logo, statut
 * d'abonnement et échéance, directions en exercice), cliquable vers la page de
 * détail /admin/promoteurs/[id] où se font toutes les actions (abonnement,
 * logo, directions).
 */
export default async function AdminPage() {
  const rows = await db.query.promoteurs.findMany({ orderBy: [desc(promoteurs.createdAt)] });
  const nb = (statut: string) => rows.filter((p) => p.statut === statut).length;
  const directions = rows.length ? await db.query.users.findMany({ where: inArray(users.role, ROLES_DIRECTION) }) : [];

  return (
    <div>
      <PageHeader
        eyebrow="Administration plateforme"
        title="Promoteurs"
        description="Chaque promoteur paie son abonnement par virement, hors plateforme. Ouvrez sa fiche pour l'activer une fois le virement constaté, gérer son logo et ses directions."
        action={
          <LinkButton href="/admin/nouveau" size="sm">
            <Plus className="h-4 w-4" /> Nouveau promoteur
          </LinkButton>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Promoteurs" value={rows.length} icon={<Building2 />} />
        <Stat label="Actifs" value={nb("ACTIF")} tone="success" />
        <Stat
          label="En attente"
          value={nb("EN_ATTENTE")}
          tone={nb("EN_ATTENTE") > 0 ? "warning" : undefined}
          hint="Virement à constater"
        />
        <Stat label="Suspendus" value={nb("SUSPENDU")} tone={nb("SUSPENDU") > 0 ? "danger" : undefined} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Aucun promoteur"
          description="Créez le premier compte promoteur : ses trois directions recevront leurs accès."
          icon={<Building2 />}
          action={
            <LinkButton href="/admin/nouveau" size="sm">
              <Plus className="h-4 w-4" /> Nouveau promoteur
            </LinkButton>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="grille-promoteurs">
          {rows.map((p) => {
            const siennes = directions.filter((u) => u.promoteurId === p.id);
            const enExercice = ROLES_DIRECTION.map((r) => titulairesActifs(siennes, r).length);
            const total = enExercice.reduce((s, n) => s + n, 0);
            const manquants = enExercice.filter((n) => n === 0).length;
            return (
              <Card
                as="li"
                key={p.id}
                interactive
                accent={p.statut === "EN_ATTENTE" ? "warning" : p.statut === "SUSPENDU" ? "danger" : undefined}
                className="relative"
                data-testid="promoteur-ligne"
              >
                <Link
                  href={`/admin/promoteurs/${p.id}`}
                  className="flex h-full cursor-pointer flex-col gap-4 rounded-lg p-5 focus-visible:outline-none focus-visible:shadow-focus"
                  data-testid="lien-fiche-promoteur"
                  aria-label={`Ouvrir la fiche de ${p.nom}`}
                >
                  <div className="flex items-start gap-3">
                    {p.logoUrl ? (
                      // Fichier servi par /api/files avec la session : pas d'optimiseur d'image Next
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-md bg-white object-contain ring-1 ring-navy-100" data-testid="logo-promoteur-image" />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-navy-50 text-navy-300" aria-hidden>
                        <Building2 className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-h3 text-navy-900" data-testid="promoteur-nom">
                        {p.nom}
                      </p>
                      <p className="mt-0.5 truncate text-caption text-navy-400">{p.contactEmail ?? "Aucun e-mail de contact"}</p>
                    </div>
                    <StatusBadge statut={p.statut} label={LABELS_STATUT_PROMOTEUR[p.statut]} tone={TONES_STATUT_PROMOTEUR[p.statut]} className="shrink-0" />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-small">
                    <dt className="flex items-center gap-1.5 text-navy-400">
                      <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Abonnement
                    </dt>
                    <dd className="text-right text-navy-900">{p.abonnementFormule ?? "—"}</dd>
                    <dt className="text-navy-400">Échéance</dt>
                    <dd className="tabular text-right text-navy-900" data-testid="promoteur-echeance">
                      {formatDate(p.abonnementFin)}
                    </dd>
                    <dt className="flex items-center gap-1.5 text-navy-400">
                      <Users className="h-3.5 w-3.5" aria-hidden /> Directions
                    </dt>
                    <dd className={`text-right ${manquants > 0 ? "text-warning-fg" : "text-navy-900"}`} data-testid="promoteur-directions">
                      {total} en exercice{manquants > 0 ? ` · ${manquants} rôle${manquants > 1 ? "s" : ""} sans titulaire` : ""}
                    </dd>
                  </dl>
                </Link>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
