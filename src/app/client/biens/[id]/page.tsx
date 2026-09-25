import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MessageCircle, FileDown, FileImage, FileCheck2, Paperclip, Receipt, Phone } from "lucide-react";
import { requireClientSession } from "@/lib/session";
import { db } from "@/db/client";
import { biens, projets, users, contrats, paiements, visites, demandesPhotos, photosAvancement, syndics } from "@/db/schema";
import { Card, Info, PageHeader, Breadcrumb } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { addMonths, formatMoney, formatDate, formatDateTime, STATUT_BIEN_LABELS, STATUT_BIEN_TONES, DELAI_PHOTOS_MOIS, libelleStatutPaiement, toneStatutPaiement } from "@/lib/utils";
import { echeancierDuBien } from "@/lib/paiements";
import { AjouterPaiement } from "./AjouterPaiement";
import { VisiteSection } from "./VisiteSection";
import { DemandePhotosButton } from "./PhotosSection";
import { LivraisonCard, SyndicCard } from "./LivraisonSyndic";
import { TmaSection } from "./TmaSection";
import { PlansBien } from "@/components/biens/PlansBien";
import { fenetreTma, demandesTmaDuBien } from "@/lib/tma-data";

const ECH_LABEL: Record<string, string> = { EN_ATTENTE: "En attente", PARTIELLE: "Partielle", PAYEE: "Payée" };
const ECH_TONE = { EN_ATTENTE: "warning", PARTIELLE: "info", PAYEE: "success" } as const;

function DocLink({ href, icon: Icon, children }: { href: string; icon: typeof FileDown; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-sm bg-navy-50 px-3 py-2 text-small font-medium text-navy ring-1 ring-inset ring-navy-100/70 transition-[background-color,box-shadow] duration-fast hover:bg-navy-100 focus-visible:outline-none focus-visible:shadow-focus"
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
    where: and(eq(contrats.bienId, bien.id), isNull(contrats.deletedAt)),
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
  const derniereDemandePhotos = await db.query.demandesPhotos.findFirst({
    where: and(eq(demandesPhotos.bienId, bien.id), eq(demandesPhotos.clientId, session.clientId)),
    orderBy: [desc(demandesPhotos.createdAt)],
  });
  const prochaineDemandePhotos = derniereDemandePhotos?.createdAt
    ? addMonths(derniereDemandePhotos.createdAt, DELAI_PHOTOS_MOIS)
    : null;
  // Server Component : rendu une fois par requête, l'horloge y est stable
  // eslint-disable-next-line react-hooks/purity
  const photosBloquees = !!prochaineDemandePhotos && prochaineDemandePhotos.getTime() > Date.now();
  const photos = await db.query.photosAvancement.findMany({
    where: eq(photosAvancement.bienId, bien.id),
    orderBy: [desc(photosAvancement.createdAt)],
  });
  const syndic = await db.query.syndics.findFirst({
    where: and(eq(syndics.bienId, bien.id), eq(syndics.clientId, session.clientId)),
    orderBy: [desc(syndics.createdAt)],
  });
  // 11.11 — navigation entre les biens du client, sans mélange des données
  const mesBiens = await db.query.biens.findMany({ where: eq(biens.clientId, session.clientId) });

  const totalPaye = ech.reduce((s, e) => s + Math.min(e.montantPaye, e.montant), 0);
  const excedent = ech.reduce((s, e) => s + Math.max(0, e.montantPaye - e.montant), 0);
  const pourcentagePaye = bien.prix > 0 ? Math.min(100, Math.round((totalPaye / bien.prix) * 100)) : 0;
  const resteAPayer = Math.max(0, ech.reduce((s, e) => s + e.montant, 0) - totalPaye - excedent);

  const whatsapp = commercial?.telephone ? `https://wa.me/${commercial.telephone.replace(/\D/g, "")}` : null;
  const contratDisponible = contrat && contrat.pdfUrl && !["EN_ATTENTE", "ANNULE"].includes(contrat.statut);
  const vendu = ["VENDU", "LIVRE"].includes(bien.statut);
  // Travaux modificatifs : fenêtre de dépôt et demandes existantes
  const fenetre = await fenetreTma(bien);
  const demandesTma = vendu ? await demandesTmaDuBien(bien.id) : [];
  const plansRenseignes = !!(bien.plan2dUrl || bien.plan3dUrl || bien.visiteVirtuelleUrl);

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumb items={[{ label: "Mes biens", href: "/client" }, { label: bien.designation }]} />
        {mesBiens.length > 1 && (
          <div className="mb-4">
            <SegmentedControl
              ariaLabel="Mes biens"
              value={bien.id}
              items={mesBiens.map((b) => ({ value: b.id, label: b.designation, href: `/client/biens/${b.id}` }))}
            />
          </div>
        )}

        <PageHeader
          eyebrow={projet?.nom}
          title={bien.designation}
          description={`${bien.nature} · ${bien.surface} m²`}
          action={
            <div className="flex flex-col items-end gap-1.5">
              <StatusBadge statut={bien.statut} label={STATUT_BIEN_LABELS[bien.statut]} tone={STATUT_BIEN_TONES[bien.statut] ?? "neutral"} />
              <p className="text-price tabular text-navy-900">{formatMoney(bien.prix)}</p>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="space-y-6 sm:col-span-2">
          {/* 11.4 — tableau de bord financier */}
          <Card className="p-5" data-testid="carte-finances">
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <p className="text-label uppercase text-navy-400">Avancement des paiements</p>
                <p className="mt-1 text-display tabular text-navy-900">{pourcentagePaye}%</p>
              </div>
              <div className="text-right text-caption text-navy-400">
                <p>
                  Payé <span className="tabular font-semibold text-navy-900">{formatMoney(totalPaye)}</span>
                </p>
                <p>
                  Reste à payer <span className="tabular font-semibold text-navy-900">{formatMoney(resteAPayer)}</span>
                </p>
                {excedent > 0 && <p className="font-medium text-success-fg">Excédent en votre faveur : {formatMoney(excedent)}</p>}
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-navy-50">
              <div className="h-full rounded-full bg-gold transition-[width] duration-slow ease-out-soft" style={{ width: `${pourcentagePaye}%` }} />
            </div>

            <div className="mt-5 space-y-2">
              {ech.map((e) => {
                const reste = Math.max(0, e.montant - e.montantPaye);
                return (
                  <div
                    key={e.id}
                    className="grid grid-cols-2 items-center gap-2 rounded-sm bg-navy-50 px-3 py-2.5 text-small sm:grid-cols-4"
                    data-testid="client-tranche"
                  >
                    <span className="font-medium text-navy-900">
                      Tranche {e.numero} · {e.pourcentage}%
                    </span>
                    <span className="tabular text-navy-400">{formatDate(e.dateEcheance)}</span>
                    <span className="text-navy-900">
                      <span className="tabular font-semibold">{formatMoney(e.montant)}</span>
                      {e.statut === "PARTIELLE" && <span className="block text-caption tabular text-navy-400">reste {formatMoney(reste)}</span>}
                    </span>
                    <span className="sm:text-right">
                      <StatusBadge statut={e.statut} label={ECH_LABEL[e.statut] ?? e.statut} tone={ECH_TONE[e.statut as keyof typeof ECH_TONE] ?? "neutral"} />
                    </span>
                  </div>
                );
              })}
              {ech.length === 0 && <p className="text-small text-navy-400">Échéancier non encore disponible.</p>}
            </div>
          </Card>

          {/* 11.8 / 11.9 — paiements et reçus */}
          <Card className="p-5" data-testid="carte-paiements">
            <h2 className="mb-3 text-h3 text-navy-900">Mes paiements</h2>
            {mesPaiements.length === 0 ? (
              <p className="flex items-center gap-2 text-small text-navy-400">
                <Receipt className="h-4 w-4" /> Aucun paiement enregistré pour l&apos;instant.
              </p>
            ) : (
              <ul className="divide-y divide-navy-50">
                {mesPaiements.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-small">
                    <div>
                      <p className="font-medium text-navy-900">
                        <span className="tabular">{formatMoney(p.montantExact ?? p.montant, p.devise)}</span>
                        {p.trancheNumero && <span className="ml-2 text-caption font-normal text-navy-400">Tranche {p.trancheNumero}</span>}
                      </p>
                      <p className="text-caption text-navy-400">
                        {p.natureOperation} · {formatDate(p.dateOperation)}
                        {p.reference && ` · réf. ${p.reference}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {p.recuPdfUrl ? (
                        <a
                          href={p.recuPdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-xs text-caption font-medium text-gold-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                        >
                          <FileDown className="h-3.5 w-3.5" /> Reçu PDF
                        </a>
                      ) : p.preuveUrl ? (
                        <a
                          href={p.preuveUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-xs text-caption text-navy-400 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                        >
                          <Paperclip className="h-3.5 w-3.5" /> Preuve
                        </a>
                      ) : null}
                      <StatusBadge
                        statut={p.statut}
                        label={libelleStatutPaiement(p.statut, "client")}
                        tone={toneStatutPaiement(p.statut)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {vendu && (
              <div className="mt-4">
                <AjouterPaiement bienId={bien.id} echeances={ech} />
              </div>
            )}
          </Card>

          {/* 11.10 — livraison */}
          {vendu && (
            <Card className="p-5" data-testid="carte-livraison">
              <h2 className="mb-3 text-h3 text-navy-900">Livraison du bien</h2>
              <LivraisonCard
                bienId={bien.id}
                statut={bien.statut}
                confirmeeClient={bien.livraisonConfirmeeClient}
                confirmeeSav={bien.livraisonConfirmeeSav}
                livreLe={bien.livreAt ? formatDate(bien.livreAt) : null}
              />
            </Card>
          )}

          {/* 12.2 — syndic */}
          {vendu && (
            <Card className="p-5" data-testid="carte-syndic">
              <h2 className="mb-3 text-h3 text-navy-900">Syndic</h2>
              <SyndicCard
                syndic={
                  syndic
                    ? { id: syndic.id, montant: formatMoney(syndic.montant), periode: syndic.periode, statut: syndic.statut, preuveUrl: syndic.preuveUrl }
                    : null
                }
              />
            </Card>
          )}

          {/* Travaux modificatifs acquéreurs */}
          {vendu && (
            <Card className="p-5" data-testid="carte-tma">
              <h2 className="mb-3 text-h3 text-navy-900">Modifications de mon bien</h2>
              <TmaSection
                bienId={bien.id}
                ouvert={fenetre.ouvert}
                dateLimite={formatDate(fenetre.dateLimite)}
                raisonFermeture={
                  bien.statut === "LIVRE"
                    ? "Le bien est livré : les demandes de modification ne sont plus possibles."
                    : bien.statut !== "VENDU"
                      ? "Les demandes de modification ne sont pas disponibles pour ce bien."
                      : null
                }
                demandes={demandesTma.map((d) => ({
                  id: d.id,
                  description: d.description,
                  statut: d.statut,
                  montant: d.montant != null ? formatMoney(d.montant) : null,
                  devisUrl: d.devisUrl,
                  croquisUrl: d.croquisUrl,
                  motifRefus: d.motifRefus,
                  dateDemande: formatDate(d.dateDemande),
                  signatureClientAt: d.signatureClientAt ? formatDateTime(d.signatureClientAt) : null,
                }))}
              />
            </Card>
          )}

          {/* 11.2 — documents */}
          <Card className="p-5" data-testid="carte-documents">
            <h2 className="mb-3 text-h3 text-navy-900">Mes documents</h2>
            <div className="flex flex-wrap gap-2">
              {contratDisponible ? (
                <DocLink href={contrat.pdfUrl!} icon={FileDown}>
                  Contrat de vente (PDF)
                </DocLink>
              ) : (
                <span className="rounded-sm border border-dashed border-navy-100 px-3 py-2 text-small text-navy-400">
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
              {bien.plan2dUrl && (
                <DocLink href={bien.plan2dUrl} icon={FileImage}>
                  Plan du bien
                </DocLink>
              )}
            </div>
            {contratDisponible && !contrat.copieSigneeUrl && (
              <p className="mt-3 text-caption text-navy-400">
                Rappel : le contrat doit être imprimé et légalisé en 4 exemplaires ; 3 vous seront restitués, le 4e
                signé et cacheté apparaîtra ici une fois numérisé.
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {/* Plans : 2D, modèle 3D, visite virtuelle */}
          {plansRenseignes && (
            <Card className="overflow-hidden" data-testid="carte-plans">
              <PlansBien
                plans={{ plan2dUrl: bien.plan2dUrl, plan3dUrl: bien.plan3dUrl, visiteVirtuelleUrl: bien.visiteVirtuelleUrl }}
                designation={bien.designation}
              />
            </Card>
          )}

          {/* 11.3 — photos d'avancement */}
          <Card className="p-5" data-testid="carte-photos">
            <h2 className="mb-3 text-h3 text-navy-900">Avancement des travaux</h2>
            <DemandePhotosButton
              bienId={bien.id}
              prochaineDisponibiliteISO={prochaineDemandePhotos?.toISOString() ?? null}
              bloque={photosBloquees}
              demandeEnAttente={derniereDemandePhotos?.statut === "EN_ATTENTE"}
            />
            {photos.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {photos.map((p) => (
                  <a
                    key={p.id}
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    title={`${p.legende ? `${p.legende} · ` : ""}${formatDate(p.createdAt)}`}
                    className="group relative aspect-square overflow-hidden rounded-sm bg-navy-50 ring-1 ring-navy-100 focus-visible:outline-none focus-visible:shadow-focus"
                  >
                    {p.url.toLowerCase().endsWith(".pdf") ? (
                      <span className="flex h-full items-center justify-center text-[10px] font-medium text-navy-400">PDF</span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.url}
                        alt={p.legende ?? "Photo d'avancement"}
                        className="h-full w-full object-cover transition-transform duration-slow ease-out-soft group-hover:scale-105"
                      />
                    )}
                  </a>
                ))}
              </div>
            )}
            {photos.length > 0 && (
              <p className="mt-2 text-caption text-navy-400">
                Dernières photos déposées le {formatDate(photos[0].createdAt)}
                {photos[0].legende && ` · ${photos[0].legende}`}
              </p>
            )}
          </Card>

          {/* 11.7 — demande de visite */}
          <Card className="p-5" data-testid="carte-visite">
            <h2 className="mb-3 text-h3 text-navy-900">Visite du bien</h2>
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

          <Card className="space-y-4 p-5" data-testid="carte-bien">
            <Info label="Prix" value={<span className="text-h2 tabular">{formatMoney(bien.prix)}</span>} />
            <Info label="Surface" value={<span className="tabular">{bien.surface} m²</span>} />
            <Info label="Nature" value={bien.nature} />
          </Card>

          {commercial && (
            <Card className="p-5" data-testid="carte-commercial">
              <Info
                label="Votre commercial"
                value={
                  <>
                    <p className="font-medium">
                      {commercial.prenom} {commercial.nom}
                    </p>
                    {commercial.telephone && (
                      <a
                        href={`tel:${commercial.telephone.replace(/\D/g, "")}`}
                        className="mt-0.5 inline-flex items-center gap-1 rounded-xs text-caption tabular text-navy-400 hover:text-navy-900 focus-visible:outline-none focus-visible:shadow-focus"
                      >
                        <Phone className="h-3 w-3" /> {commercial.telephone}
                      </a>
                    )}
                  </>
                }
              />
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex h-9 items-center gap-2 rounded-sm bg-success px-3 text-small font-medium text-white shadow-e1 transition-[background-color,box-shadow] duration-fast hover:shadow-e2 hover:brightness-110 focus-visible:outline-none focus-visible:shadow-focus"
                >
                  <MessageCircle className="h-4 w-4" /> Contacter sur WhatsApp
                </a>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
