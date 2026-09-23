import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { requireStaffSession } from "@/lib/session";
import { PageHeader, Breadcrumb } from "@/components/ui/Primitives";
import { etatCompte, peutModifierClient } from "@/lib/comptes";
import { ModifierClientForm } from "./ModifierClientForm";

export default async function ModifierClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaffSession();
  const client = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!client || client.promoteurId !== session.promoteurId) notFound();
  if (!peutModifierClient(session, client)) redirect("/dashboard?erreur=acces-refuse");
  if (etatCompte(client) !== "actif") redirect(`/dashboard/clients/${client.id}`);

  const nomComplet = `${client.prenom} ${client.nom}`;
  return (
    <div className="mx-auto max-w-xl">
      <Breadcrumb items={[{ label: "Clients", href: "/dashboard/clients" }, { label: nomComplet, href: `/dashboard/clients/${client.id}` }, { label: "Modifier" }]} />
      <PageHeader eyebrow="Client" title={`Modifier ${nomComplet}`} description="Identité, pièce et coordonnées. Les changements sont tracés dans le journal d'activité." />
      <ModifierClientForm
        client={{
          id: client.id,
          nom: client.nom,
          prenom: client.prenom,
          dateNaissance: client.dateNaissance,
          lieuNaissance: client.lieuNaissance,
          adresse: client.adresse,
          pieceType: client.pieceType,
          pieceNumero: client.pieceNumero,
          pieceDocUrl: client.pieceDocUrl,
          telephone1: client.telephone1,
          telephone2: client.telephone2,
          email: client.email,
        }}
      />
    </div>
  );
}
