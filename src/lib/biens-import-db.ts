import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { biens } from "@/db/schema";
import { normaliserTexte } from "./biens-import";

/** Désignations (normalisées) déjà présentes dans le projet, pour écarter les doublons à l'import. */
export async function designationsConnues(projetId: string): Promise<Set<string>> {
  const existants = await db.query.biens.findMany({ where: eq(biens.projetId, projetId) });
  return new Set(existants.map((b) => normaliserTexte(b.designation)).filter((d) => d.length > 0));
}
