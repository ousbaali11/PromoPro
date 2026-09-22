import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MessageCircle, FileDown, FileImage, FileCheck2, Paperclip } from "lucide-react";
import { requireClientSession } from "@/lib/session";
import { db } from "@/db/client";
import { biens, projets, users, contrats, paiements, visites } from "@/db/schema";
import { Card, Badge } from "@/components/ui/Primitives";
import { formatMoney, formatDate, STATUT_BIEN_LABELS, STATUT_BIEN_COLORS } from "@/lib/utils";
import { echeancierDuBien } from "@/lib/paiements";
import { AjouterPaiement } from "./AjouterPaiement";
import { VisiteSection } from "./VisiteSection";

const ECH_LABEL: Record<string, string> = { EN_ATTENTE: "En attente", PARTIELLE: "Partielle", PAYEE: "Payée" };
const ECH_COLOR: Record<string, string> = {
  EN_ATTENTE: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PARTIELLE: "bg-sky-50 text-sky-700 ring-sky-600/20",
  PAYEE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

function DocLink({ href, icon: Icon, children }: { href: string; icon: typeof FileDown; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-md bg-navy-50 px-3 py-2 text-sm text-navy hover:bg-navy-100"
    >
      <Icon className="h-4 w-4 text-gold-600" /> {children}
    </a>
  );
}

export default async function ClientBienPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireClientSession();

  const bien = await db.query.biens.findFirst({ where: eq(biens.id, id) });
  if (!bien || bien.clientId !== session.clientId) notFound();

  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  const commercial = bien.commercialId
    ? await db.query.users.findFirst({ where: eq(users.id, bien.commercialId) })
    : null;
  const ech = await echeancierDuBien(bien.id);
  const contrat = await db.query.contrats.findFirst({
    where: eq(contrats.bienId, bien.id),
    orderBy: [desc(contrats.createdAt)],
  });
  const mesPaiements = await db.query.paiements.findMany({
    where: and(eq(paiements.bienId, bien.id), eq(paiements.clientId, session.clientId)),
    orderBy: [desc(paiements.createdAt)],
  });
  const derniereVisite = await db.query.visites.findFirst({
    where: and(eq(visites.bienId, bien.id), eq(visites.clientId, session.clientId)),
    orderBy: [desc(visites.createdAt)],
  });

  const totalPaye = ech.reduce((s, e) => s + Math.min(e.montantPaye, e.montant), 0);
  const excedent = ech.reduce((s, e) => s + Math.max(0, e.montantPaye - e.montant), 0);
  const pourcentagePaye = bien.prix > 0 ? Math.min(100, Math.round((totalPaye / bien.prix) * 100)) : 0;
  const resteAPayer = Math.max(0, ech.reduce((s, e) => s + e.montant, 0) - totalPaye - excedent);

  const whatsapp = commercial?.telephone ? `https://wa.me/${commercial.telephone.replace(/\D/g, "")}` : null;
  const contratDisponible = contrat && contrat.pdfUrl && !["EN_ATTENTE", "ANNULE"].includes(contrat.statut);

  return (
    <div>
      <Link href="/client" className="mb-4 inline-block text-sm text-navy-400 hover:text-navy-900">
        ← Mes biens
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy-900">{bien.designation}</h1>
          <p className="mt-1 text-sm text-navy-400">{projet?.nom}</p>
        </div>
        <Badge className={STATUT_BIEN_COLORS[bien.statut]}>{STATUT_BIEN_LABELS[bien.statut]}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="space-y-4 sm:col-span-2">
          {/* 11.4 — tableau de bord financier */}
          <Card className="p-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-navy-400">Avancement des paiements</span>
              <span className="font-medium text-navy-900">{pourcentagePaye}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-navy-50">
              <div className="h-full rounded-full bg-gold" style={{ width: `${pourcentagePaye}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-navy-400">
              <span>Payé : <span className="font-medium text-navy-900">{formatMoney(totalPaye)}</span></span>
              <span>Reste à payer : <span className="font-medium text-navy-900">{formatMoney(resteAPayer)}</span></span>
              {excedent > 0 && (
                <span className="text-emerald-700">Excédent en votre faveur : {formatMoney(excedent)}</span>
              )}
            </div>

            <div className="mt-5 space-y-2">
              {ech.map((e) => {
                const reste = Math.max(0, e.montant - e.montantPaye);
                return (
                  <div
                    key={e.id}
                    className="grid grid-cols-2 items-center gap-2 rounded-md bg-navy-50 px-3 py-2 text-sm sm:grid-cols-4"
                  >
                    <span className="text-navy-900">
                      Tranche {e.numero} · {e.pourcentage}%
                    </span>
                    <span className="text-navy-400">{formatDate(e.dateEcheance)}</span>
                    <span className="text-navy-900">
                      <span className="font-medium">{formatMoney(e.montant)}</span>
                      {e.statut === "PARTIELLE" && (
                        <span className="block text-xs text-navy-400">reste {formatMoney(reste)}</span>
                      )}
                    </span>
                    <span className="sm:text-right">
                      <Badge className={ECH_COLOR[e.statut]}>{ECH_LABEL[e.statut] ?? e.statut}</Badge>
                    </span>
                  </div>
                );
              })}
              {ech.length === 0 && <p className="text-sm text-navy-400">Échéancier non encore disponible.</p>}
            </div>
          </Card>

          {/* 11.8 / 11.9 — paiements et reçus */}
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-navy-900">Mes paiements</p>
            </div>
            {mesPaiements.length === 0 ? (
              <p className="text-sm text-navy-400">Aucun paiement enregistré pour l&apos;instant.</p>
            ) : (
              <ul className="divide-y divide-navy-50">
                {mesPaiements.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-navy-900">
                        {formatMoney(p.montantExact ?? p.montant, p.devise)}
                        {p.trancheNumero && <span className="ml-2 text-xs font-normal text-navy-400">Tranche {p.trancheNumero}</span>}
                      </p>
                      <p className="text-xs text-navy-400">
                        {p.natureOperation} · {formatDate(p.dateOperation)}
                        {p.reference && ` · réf. ${p.reference}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {p.recuPdfUrl ? (
                        <a href={p.recuPdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-gold-600 hover:underline">
                          <FileDown className="h-3.5 w-3.5" /> Reçu PDF
                        </a>
                      ) : p.preuveUrl ? (
                        <a href={p.preuveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-navy-400 hover:underline">
                          <Paperclip className="h-3.5 w-3.5" /> Preuve
                        </a>
                      ) : null}
                      <Badge
                        className={
                          p.statut === "VALIDE"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                            : "bg-amber-50 text-amber-700 ring-amber-600/20"
                        }
                      >
                        {p.statut === "VALIDE" ? "Validé" : "En vérification"}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {["VENDU", "LIVRE"].includes(bien.statut) && (
              <div className="mt-4">
                <AjouterPaiement bienId={bien.id} echeances={ech} />
              </div>
            )}
          </Card>

          {/* 11.2 — documents */}
          <Card className="p-5">
            <p className="mb-3 text-sm font-medium text-navy-900">Mes documents</p>
            <div className="flex flex-wrap gap-2">
              {contratDisponible ? (
                <DocLink href={contrat.pdfUrl!} icon={FileDown}>
                  Contrat de vente (PDF)
                </DocLink>
              ) : (
                <span className="rounded-md bg-navy-50 px-3 py-2 text-sm text-navy-400">
                  {contrat && contrat.statut === "EN_ATTENTE"
                    ? "Contrat en cours de préparation par le Responsable Administratif."
                    : "Pas encore de contrat pour ce bien."}
                </span>
              )}
              {contrat?.copieSigneeUrl && (
                <DocLink href={contrat.copieSigneeUrl} icon={FileCheck2}>
                  Copie signée et cachetée
                </DocLink>
              )}
              {bien.planUrl && (
                <DocLink href={bien.planUrl} icon={FileImage}>
                  Plan du bien
                </DocLink>
              )}
            </div>
            {contratDisponible && !contrat.copieSigneeUrl && (
              <p className="mt-3 text-xs text-navy-400">
                Rappel : le contrat doit être imprimé et légalisé en 4 exemplaires ; 3 vous seront restitués, le 4e
                signé et cacheté apparaîtra ici une fois numérisé.
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {/* 11.7 — demande de visite */}
          <Card className="p-5">
            <p className="mb-3 text-sm font-medium text-navy-900">Visite du bien</p>
            <VisiteSection
              bienId={bien.id}
              visite={
                derniereVisite
                  ? {
                      id: derniereVisite.id,
                      statut: derniereVisite.statut,
                      dateVisite: derniereVisite.dateVisite?.toISOString() ?? null,
                      autorisationUrl: derniereVisite.autorisationUrl,
                      motifRefus: derniereVisite.motifRefus,
                    }
                  : null
              }
            />
          </Card>

          <Card className="p-5">
            <p className="text-xs text-navy-400">Prix</p>
            <p className="mt-1 text-lg font-semibold text-navy-900">{formatMoney(bien.prix)}</p>
            <p className="mt-3 text-xs text-navy-400">Surface</p>
            <p className="mt-1 text-navy-900">{bien.surface} m²</p>
          </Card>

          {commercial && (
            <Card className="p-5">
              <p className="text-xs text-navy-400">Votre commercial</p>
              <p className="mt-1 font-medium text-navy-900">
                {commercial.prenom} {commercial.nom}
              </p>
              {commercial.telephone && <p className="text-xs text-navy-400">{commercial.telephone}</p>}
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Contacter sur WhatsApp
                </a>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
