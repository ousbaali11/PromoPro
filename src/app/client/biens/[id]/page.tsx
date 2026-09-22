import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MessageCircle, ClipboardList } from "lucide-react";
import { requireClientSession } from "@/lib/session";
import { db } from "@/db/client";
import { biens, projets, users, propositions, echeances, contrats } from "@/db/schema";
import { Card, Badge } from "@/components/ui/Primitives";
import { formatMoney, formatDate, STATUT_BIEN_LABELS, STATUT_BIEN_COLORS } from "@/lib/utils";

export default async function ClientBienPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireClientSession();

  const bien = await db.query.biens.findFirst({ where: eq(biens.id, id) });
  if (!bien || bien.clientId !== session.clientId) notFound();

  const projet = await db.query.projets.findFirst({ where: eq(projets.id, bien.projetId) });
  const commercial = bien.commercialId
    ? await db.query.users.findFirst({ where: eq(users.id, bien.commercialId) })
    : null;
  const proposition = await db.query.propositions.findFirst({
    where: eq(propositions.bienId, bien.id),
  });
  const ech = proposition
    ? await db.query.echeances.findMany({ where: eq(echeances.propositionId, proposition.id) })
    : [];
  const contrat = await db.query.contrats.findFirst({ where: eq(contrats.bienId, bien.id) });

  const totalPaye = ech.reduce((s, e) => s + e.montantPaye, 0);
  const pourcentagePaye = bien.prix > 0 ? Math.round((totalPaye / bien.prix) * 100) : 0;

  const whatsapp = commercial?.telephone ? `https://wa.me/${commercial.telephone.replace(/\D/g, "")}` : null;

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
          <Card className="p-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-navy-400">Avancement des paiements</span>
              <span className="font-medium text-navy-900">{pourcentagePaye}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-navy-50">
              <div className="h-full rounded-full bg-gold" style={{ width: `${pourcentagePaye}%` }} />
            </div>

            <div className="mt-5 space-y-2">
              {ech.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between rounded-md bg-navy-50 px-3 py-2 text-sm"
                >
                  <span className="text-navy-900">
                    Tranche {e.numero} · {e.pourcentage}%
                  </span>
                  <span className="text-navy-400">{formatDate(e.dateEcheance)}</span>
                  <span className="font-medium text-navy-900">{formatMoney(e.montant)}</span>
                  <Badge
                    className={
                      e.statut === "PAYEE"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                        : "bg-amber-50 text-amber-700 ring-amber-600/20"
                    }
                  >
                    {e.statut === "PAYEE" ? "Payée" : "En attente"}
                  </Badge>
                </div>
              ))}
              {ech.length === 0 && <p className="text-sm text-navy-400">Échéancier non encore disponible.</p>}
            </div>
          </Card>

          <Card className="flex items-start gap-3 p-5">
            <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
            <div>
              <p className="text-sm font-medium text-navy-900">Contrat</p>
              <p className="mt-1 text-sm text-navy-400">
                {contrat
                  ? contrat.statut === "EN_ATTENTE"
                    ? "En cours de préparation par le Responsable Administratif."
                    : "Prêt — le téléchargement PDF sera disponible ici (à brancher, voir PROMPTS.md)."
                  : "Pas encore de contrat pour ce bien."}
              </p>
            </div>
          </Card>

          <Card className="p-5 text-sm text-navy-400">
            Plan du bien, reçus de paiement, demande de photos d&apos;avancement, prise de rendez-vous, demande de
            visite et ajout de paiement : voir <code className="text-xs">PROMPTS.md</code>, module Espace Client.
          </Card>
        </div>

        <div className="space-y-4">
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
