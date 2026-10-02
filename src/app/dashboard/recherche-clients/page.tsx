import Link from "next/link";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Search, ShieldCheck, UserSearch } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/db/client";
import { clients, users } from "@/db/schema";
import { peutConsulterDossierClient } from "@/lib/comptes";
import { criteresValides, nettoyerCriteres, projeterResultat, rechercherClients, type ResultatClient } from "@/lib/recherche-clients";
import { formatDate } from "@/lib/utils";
import { PageHeader, Callout, Input, Section, EmptyState } from "@/components/ui/Primitives";
import { DataTable, type DataTableRow } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";

/**
 * Recherche de clients inter-commerciaux (Commercial, Responsable Commercial) :
 * détecter un doublon avant de créer un client, parmi tous les clients du
 * promoteur. Pour un client suivi par un autre commercial, seuls le nom, le
 * prénom, la date de naissance, la pièce et le nom du collègue sont montrés —
 * jamais l'adresse, le téléphone, l'e-mail ni l'historique. Les critères
 * passent par l'URL (formulaire GET), comme les autres filtres du site.
 */
export default async function RechercheClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ nom?: string; prenom?: string; dateNaissance?: string; piece?: string }>;
}) {
  const session = await requireRole(["COMMERCIAL", "RESPONSABLE_COMMERCIAL"]);
  const criteres = nettoyerCriteres(await searchParams);
  const lance = Object.keys(await searchParams).length > 0;
  const valides = criteresValides(criteres);

  const miens: ResultatClient[] = [];
  const autres: ResultatClient[] = [];
  if (valides) {
    // Toujours le promoteur de la session, jamais au-delà ; comptes supprimés exclus
    const tous = await db.query.clients.findMany({ where: and(eq(clients.promoteurId, session.promoteurId!), isNull(clients.deletedAt)) });
    const trouves = rechercherClients(tous, criteres);
    const idsCommerciaux = Array.from(new Set(trouves.map((c) => c.commercialId).filter((id): id is string => !!id)));
    const commerciaux = idsCommerciaux.length ? await db.query.users.findMany({ where: inArray(users.id, idsCommerciaux) }) : [];
    const nomCommercial = new Map(commerciaux.map((u) => [u.id, `${u.prenom} ${u.nom}`]));
    for (const c of trouves) {
      const resultat = projeterResultat(c, { consultable: peutConsulterDossierClient(session, c), commercial: c.commercialId ? (nomCommercial.get(c.commercialId) ?? null) : null });
      (c.commercialId === session.userId ? miens : autres).push(resultat);
    }
  }

  const ligne = (r: ResultatClient): DataTableRow => ({
    key: r.id,
    testId: "resultat-client",
    cells: [
      r.detail === "complet" ? (
        <Link href={r.href} className="font-medium text-navy-900 underline-offset-2 hover:underline" data-testid="resultat-lien">
          {r.prenom} {r.nom}
        </Link>
      ) : (
        <span className="font-medium text-navy-900">
          {r.prenom} {r.nom}
        </span>
      ),
      r.dateNaissance ? formatDate(r.dateNaissance) : "—",
      <span key="piece" className="font-mono text-small">
        {r.piece ?? "—"}
      </span>,
      r.commercial ?? "—",
      r.detail === "complet" ? (
        <span key="contact" className="text-small text-navy-500" data-testid="resultat-contact">
          {[r.telephone, r.email].filter(Boolean).join(" · ") || "—"}
        </span>
      ) : (
        <span key="contact" className="text-caption text-navy-400" data-testid="resultat-reserve">
          Réservé au commercial qui le suit
        </span>
      ),
    ],
    sort: [r.nom, r.dateNaissance ?? "", r.piece ?? "", r.commercial ?? "", ""],
  });
  // L'attribut data-* de la ligne passe par la clé : DataTable n'expose que testId, on annote donc les cellules
  const lignes = (liste: ResultatClient[], propriete: "mien" | "autre") =>
    liste.map((r) => {
      const l = ligne(r);
      l.cells[0] = (
        <span key="nom" data-testid="resultat-identite" data-propriete={propriete} data-detail={r.detail}>
          {l.cells[0]}
        </span>
      );
      return l;
    });
  const colonnes = [
    { header: "Client", sortable: true },
    { header: "Date de naissance", sortable: true, hideBelow: "sm" as const },
    { header: "Pièce", sortable: true },
    { header: "Commercial", sortable: true, hideBelow: "md" as const },
    { header: "Contact" },
  ];
  const total = miens.length + autres.length;

  return (
    <div>
      <PageHeader
        title="Recherche de clients"
        description="Avant de créer un client, vérifiez qu'il n'existe pas déjà chez un collègue : la recherche porte sur tous les clients du promoteur."
      />
      <form method="get" className="grid grid-cols-1 gap-3 rounded-md bg-white p-5 shadow-sm ring-1 ring-navy-100/70 sm:grid-cols-2 lg:grid-cols-5" data-testid="form-recherche-clients">
        <Input id="rc-nom" name="nom" label="Nom" defaultValue={criteres.nom ?? ""} autoComplete="off" />
        <Input id="rc-prenom" name="prenom" label="Prénom" defaultValue={criteres.prenom ?? ""} autoComplete="off" />
        <Input id="rc-date" name="dateNaissance" type="date" label="Date de naissance" defaultValue={criteres.dateNaissance ?? ""} clearable={false} />
        <Input id="rc-piece" name="piece" label="N° de CIN ou passeport" defaultValue={criteres.piece ?? ""} className="font-mono" autoComplete="off" />
        <div className="flex items-end">
          <Button type="submit" variant="gold" className="w-full" data-testid="lancer-recherche">
            <Search className="h-4 w-4" /> Rechercher
          </Button>
        </div>
      </form>
      <Callout tone="info" className="mt-4" icon={<ShieldCheck className="h-4 w-4" />}>
        Pour un client suivi par un autre commercial, seuls son nom, son prénom, sa date de naissance, sa pièce et le nom de ce collègue sont affichés, afin de confirmer qu&apos;il
        s&apos;agit de la même personne. Son dossier reste réservé au commercial qui le suit.
      </Callout>

      {lance && !valides && (
        <Callout tone="warning" className="mt-4" testId="recherche-criteres-invalides">
          Indiquez au moins un critère : un nom ou un prénom d&apos;au moins deux lettres, une date de naissance ou un numéro de pièce.
        </Callout>
      )}

      {valides && total === 0 && (
        <div className="mt-6" data-testid="recherche-clients-vide">
          <EmptyState icon={<UserSearch className="h-8 w-8" />} title="Aucun client ne correspond" description="Aucun client de ce promoteur ne correspond à ces critères : vous pouvez créer le client sans risque de doublon." />
        </div>
      )}

      {valides && total > 0 && (
        <div className="mt-6 space-y-6">
          <Section title="Vos clients" count={miens.length} testId="section-mes-clients">
            {miens.length ? (
              <DataTable columns={colonnes} rows={lignes(miens, "mien")} testId="table-recherche-mes-clients" dense />
            ) : (
              <p className="text-small text-navy-400">Aucun de vos clients ne correspond.</p>
            )}
          </Section>
          <Section title="Clients d'autres commerciaux de ce promoteur" count={autres.length} testId="section-autres-clients">
            {autres.length ? (
              <DataTable columns={colonnes} rows={lignes(autres, "autre")} testId="table-recherche-autres-clients" dense />
            ) : (
              <p className="text-small text-navy-400">Aucun client d&apos;un autre commercial ne correspond.</p>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
