import { and, eq } from "drizzle-orm";
import { Phone, MessageCircle } from "lucide-react";
import { requireClientSession } from "@/lib/session";
import { db } from "@/db/client";
import { biens, users, promoteurs } from "@/db/schema";
import { Card, PageHeader } from "@/components/ui/Primitives";
import { SERVICES } from "@/lib/creneaux";

type Contact = { nom: string; telephone: string | null; precision?: string };

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
            <Card key={s.value} className="p-5">
              <p className="font-medium text-navy-900">{s.label}</p>
              <p className="text-xs text-navy-400">{s.description}</p>
              <div className="mt-3 space-y-2">
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
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-navy-50 px-3 py-2 text-sm">
      <div>
        <p className="text-navy-900">{nom}</p>
        {precision && <p className="text-xs text-navy-400">{precision}</p>}
      </div>
      {telephone ? (
        <div className="flex items-center gap-2">
          <a href={`tel:${digits}`} className="inline-flex items-center gap-1 font-medium text-navy hover:text-gold-600">
            <Phone className="h-3.5 w-3.5" /> {telephone}
          </a>
          <a
            href={`https://wa.me/${digits}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
            aria-label="WhatsApp"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
        </div>
      ) : (
        <span className="text-xs text-navy-400">Numéro non renseigné</span>
      )}
    </div>
  );
}
