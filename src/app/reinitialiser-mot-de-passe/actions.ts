"use server";

import { redirect } from "next/navigation";
import { reinitialiserMotDePasse } from "@/lib/mot-de-passe-oublie";

export type ReinitState = { error?: string; jetonInvalide?: boolean } | undefined;

export async function appliquerNouveauMotDePasse(_prev: ReinitState, formData: FormData): Promise<ReinitState> {
  const jeton = String(formData.get("token") ?? "");
  const motDePasse = String(formData.get("motDePasse") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const r = await reinitialiserMotDePasse(jeton, motDePasse, confirmation);
  if (!r.ok) return { error: r.erreur, jetonInvalide: r.jetonInvalide };
  redirect("/login?motif=mot-de-passe-modifie");
}
