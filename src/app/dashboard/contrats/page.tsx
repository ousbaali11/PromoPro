import { eq } from "drizzle-orm";
import { FileDown, FileCheck2 } from "lucide-react";
import { requireStaffSession } from "@/lib/session";
import { db } from "@/db/client";
import { contrats, biens, projets, clients } from "@/db/schema";
import { Card, Badge, EmptyState } from "@/components/ui/Primitives";
import { TodoModule } from "@/components/layout/TodoModule";
import { ConfirmerButton } from "./ConfirmerButton";
import { CopieSigneeForm } from "./CopieSigneeForm";
import { RendezVousSection } from "@/app/dashboard/rendez-vous/RendezVousSection";

const LABELS: Record<string, string> = {
  EN_ATTENTE: "En attente",
  PRET: "Prêt",
  ENVOYE: "Envoyé",
  SIGNE: "Signé",
  ANNULE: "Annulé (désistement)",
};
const COLORS: Record<string, string> = {
  EN_ATTENTE: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PRET: "bg-sky-50 text-sky-700 ring-sky-600/20",
  ENVOYE: "bg-navy/10 text-navy ring-navy/20",
  SIGNE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  ANNULE: "bg-slate-100 text-slate-700 ring-slate-600/20",
};

export default async function ContratsPage() {
  const session = await requireStaffSession();

  const allBiens = await db.query.biens.findMany();
  const allProjets = await db.query.projets.findMany({ where: eq(projets.promoteurId, session.promoteurId!) });
  const projetIds = new Set(allProjets.map((p) => p.id));
  const bienIds = new Set(allBiens.filter((b) => projetIds.has(b.projetId)).map((b) => b.id));
  const allClients = await db.query.clients.findMany({ where: eq(clients.promoteurId, session.promoteurId!) });

  const all = await db.query.contrats.findMany();
  const rows = all
    .filter((c) => bienIds.has(c.bienId))
    .map((c) => {
      const bien = allBiens.find((b) => b.id === c.bienId);
      const client = bien?.clientId ? allClients.find((cl) => cl.id === bien.clientId) : undefined;
      return { contrat: c, bien, client };
    });

  return (
    <TodoModule
      title="Contrats"
      description="Contrats en attente et suivi de génération."
      specSection="section 7 — Responsable Administratif"
    >
      {session.role === "RESPONSABLE_ADMINISTRATIF" && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-navy-900">Rendez-vous (service administratif)</h2>
          <RendezVousSection service="ADMINISTRATIF" session={session} canAct />
        </section>
      )}
      {rows.length === 0 ? (
        <EmptyState
          title="Aucun contrat"
          description="Les contrats apparaissent dès qu'une vente est validée par le PDG."
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-100 text-left text-xs text-navy-400">
                <th className="px-5 py-3 font-medium">Bien</th>
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ contrat, bien, client }) => (
                <tr key={contrat.id} className="border-b border-navy-50 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-900">{bien?.designation ?? "—"}</td>
                  <td className="px-5 py-3 text-navy-400">{client ? `${client.prenom} ${client.nom}` : "—"}</td>
                  <td className="px-5 py-3">
                    <Badge className={COLORS[contrat.statut]}>{LABELS[contrat.statut]}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="inline-flex items-center gap-3">
                      {contrat.pdfUrl && (
                        <a
                          href={contrat.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-gold-600 hover:underline"
                        >
                          <FileDown className="h-3.5 w-3.5" /> Contrat PDF
                        </a>
                      )}
                      {contrat.copieSigneeUrl && (
                        <a
                          href={contrat.copieSigneeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-gold-600 hover:underline"
                        >
                          <FileCheck2 className="h-3.5 w-3.5" /> Copie signée
                        </a>
                      )}
                      {contrat.statut === "EN_ATTENTE" && session.role === "RESPONSABLE_ADMINISTRATIF" && (
                        <ConfirmerButton contratId={contrat.id} />
                      )}
                      {["PRET", "ENVOYE"].includes(contrat.statut) && session.role === "RESPONSABLE_ADMINISTRATIF" && (
                        <CopieSigneeForm contratId={contrat.id} />
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </TodoModule>
  );
}
