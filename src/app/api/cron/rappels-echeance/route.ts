import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gte, isNull, lte, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { biens, echeances, propositions } from "@/db/schema";
import { notifyClient } from "@/lib/notifications";

/**
 * Rappel J-7 avant échéance (section 11.8).
 *
 * À appeler une fois par jour (voir README, « Tâches planifiées ») :
 *   GET /api/cron/rappels-echeance
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Pour chaque échéance non soldée dont la date tombe dans les 7 prochains
 * jours et qui n'a pas encore reçu de rappel, le client est notifié avec la
 * date exacte, le montant restant dû, le numéro de tranche et son
 * pourcentage. La fenêtre « ≤ 7 jours » (plutôt que « = J-7 ») permet de
 * rattraper un jour de cron manqué sans jamais notifier deux fois
 * (`echeances.rappelEnvoyeAt`).
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : req.nextUrl.searchParams.get("secret");
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET non configuré." }, { status: 500 });
    }
  } else if (provided !== secret) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const now = new Date();
  const dans7Jours = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  dans7Jours.setHours(23, 59, 59, 999);
  const debut = new Date(now);
  debut.setHours(0, 0, 0, 0);

  const aRappeler = await db.query.echeances.findMany({
    where: and(
      ne(echeances.statut, "PAYEE"),
      isNull(echeances.rappelEnvoyeAt),
      gte(echeances.dateEcheance, debut),
      lte(echeances.dateEcheance, dans7Jours),
    ),
  });

  let envoyes = 0;
  for (const e of aRappeler) {
    // Uniquement les ventes en cours (proposition acceptée, bien toujours affecté au client)
    const proposition = await db.query.propositions.findFirst({ where: eq(propositions.id, e.propositionId) });
    if (!proposition || proposition.statut !== "ACCEPTEE") continue;
    const bien = await db.query.biens.findFirst({ where: eq(biens.id, e.bienId) });
    if (!bien?.clientId || bien.clientId !== proposition.clientId) continue;

    const restant = Math.max(0, e.montant - e.montantPaye);
    const date = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
      e.dateEcheance,
    );
    await notifyClient({
      clientId: bien.clientId,
      type: "RAPPEL_ECHEANCE",
      titre: `Rappel : échéance du ${date}`,
      message: `Tranche ${e.numero} (${e.pourcentage}%) de ${bien.designation} : ${Math.round(restant).toLocaleString("fr-FR")} MAD à régler avant le ${date}.`,
      lien: `/client/biens/${bien.id}`,
    });
    await db.update(echeances).set({ rappelEnvoyeAt: now }).where(eq(echeances.id, e.id));
    envoyes++;
  }

  return NextResponse.json({ ok: true, examinees: aRappeler.length, rappelsEnvoyes: envoyes, date: now.toISOString() });
}

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}
