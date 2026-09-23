import { and, eq } from "drizzle-orm";
import { Phone, MessageCircle, Briefcase, Wrench, FileText, Landmark } from "lucide-react";
import { requireClientSession } from "@/lib/session";
import { db } from "@/db/client";
import { biens, users, promoteurs } from "@/db/schema";
import { Card, PageHeader } from "@/components/ui/Primitives";
import { SERVICES } from "@/lib/creneaux";

type Contact = { nom: string; telephone: string | null; precision?: string };

const ICONES: Record<string, React.ReactNode> = {
  COMMERCIAL: <Briefcase />,
  SAV: <Wrench />,
  ADMINISTRATIF: <FileText />,
  RECOUVREMENT: <Landmark />,
};

/** Section 11.6 — numéro de contact de chaque service. */
export default async function ClientContactPage() {
  const session = await requireClientSession();
  const promoteur = await db.query.promoteurs.findFirst({ where: eq(promoteurs.id, session.promoteurId) });
  const mesBiens = await db.query.biens.findMany({ where: eq(biens.clientId, session.clientId) });
  const staff = await db.query.users.findMany({
    where: and(eq(users.promoteurId, session.promoteurId), eq(users.actif, true)),
  });
  const premier = (role: string) => staff.find((u) => u.role === role);

  const contactsParService: Record<string, Contact[]> = { COMMERCIAL: [], SAV: [], ADMINISTRATIF: [], RECOUVREMENT: [] };

  // Service commercial : le commercial de chaque bien (cloisonnement par bien, 11.11)
  const commerciaux = new Map<string, Contact>();
  for (const b of mesBiens) {
    const c = b.commercialId ? staff.find((u) => u.id === b.commercialId) : null;
    if (!c) continue;
    const existing = commerciaux.get(c.id);
    if (existing) existing.precision = `${existing.precision}, ${b.designation}`;
    else commerciaux.set(c.id, { nom: `${c.prenom} ${c.nom}`, telephone: c.telephone, precision: b.designation });
  }
  contactsParService.COMMERCIAL = [...commerciaux.values()];

  for (const [service, role] of [
    ["SAV", "SERVICE_APRES_VENTE"],
    ["ADMINISTRATIF", "RESPONSABLE_ADMINISTRATIF"],
    ["RECOUVREMENT", "RECOUVREMENT"],
  ] as const) {
    const u = premier(role);
    contactsParService[service] = u ? [{ nom: `${u.prenom} ${u.nom}`, telephone: u.telephone }] : [];
  }

  const fallback = promoteur?.contactTelephone ?? null;

  return (
    <div>
      <PageHeader title="Contacter un service" description="Choisissez le service concerné : son numéro de contact s'affiche." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SERVICES.map((s) => {
          const contacts = contactsParService[s.value];
          return (
            <Card key={s.value} className="p-5" data-testid="carte-service">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-navy-50 text-navy [&_svg]:h-5 [&_svg]:w-5">
                  {ICONES[s.value]}
                </span>
                <div className="min-w-0">
                  <p className="text-h3 text-navy-900">{s.label}</p>
                  <p className="text-caption text-navy-400">{s.description}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {contacts.length === 0 && (
                  <ContactLigne nom={promoteur?.nom ?? "Standard"} telephone={fallback} precision="standard du promoteur" />
                )}
                {contacts.map((c) => (
                  <ContactLigne key={c.nom} {...c} telephone={c.telephone ?? fallback} />
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ContactLigne({ nom, telephone, precision }: Contact) {
  const digits = telephone?.replace(/\D/g, "") ?? "";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-navy-50 px-3 py-2.5 text-small">
      <div>
        <p className="font-medium text-navy-900">{nom}</p>
        {precision && <p className="text-caption text-navy-400">{precision}</p>}
      </div>
      {telephone ? (
        <div className="flex items-center gap-2">
          <a
            href={`tel:${digits}`}
            className="inline-flex items-center gap-1.5 rounded-xs font-medium tabular text-navy transition-colors duration-fast hover:text-gold-600 focus-visible:outline-none focus-visible:shadow-focus"
          >
            <Phone className="h-3.5 w-3.5" /> {telephone}
          </a>
          <a
            href={`https://wa.me/${digits}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-success text-white shadow-e1 transition-[box-shadow,filter] duration-fast hover:shadow-e2 hover:brightness-110 focus-visible:outline-none focus-visible:shadow-focus"
            aria-label="WhatsApp"
          >
            <MessageCircle className="h-4 w-4" />
          </a>
        </div>
      ) : (
        <span className="text-caption text-navy-400">Numéro non renseigné</span>
      )}
    </div>
  );
}
