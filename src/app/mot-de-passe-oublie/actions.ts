"use server";

import { headers } from "next/headers";
import { consommer, messageLimite } from "@/lib/rate-limit";
import { demanderReinitialisation } from "@/lib/mot-de-passe-oublie";
import { MESSAGE_DEMANDE_ENVOYEE } from "@/lib/reinitialisation-regles";

export type DemandeState = { error?: string; message?: string; sansEmail?: boolean } | undefined;

// Limite de débit (même principe que /login) : 3 demandes par identifiant et 10 par adresse IP, sur 15 minutes
const FENETRE_MS = 15 * 60 * 1000;
const MAX_PAR_IDENTIFIANT = 3;
const MAX_PAR_IP = 10;

async function adresseIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "inconnue";
}

/** Origine publique de l'application pour le lien (APP_URL sinon l'hôte de la requête, derrière le proxy Railway). */
async function origineApplication() {
  const configuree = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configuree) return configuree;
  const h = await headers();
  const hote = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (hote.startsWith("localhost") ? "http" : "https");
  return `${proto}://${hote}`;
}

export async function demanderLien(_prev: DemandeState, formData: FormData): Promise<DemandeState> {
  const identifiant = String(formData.get("identifiant") ?? "").trim();
  if (!identifiant) return { error: "Merci de renseigner votre identifiant." };

  const ip = await adresseIp();
  const parIp = consommer(`mdp-oublie:ip:${ip}`, MAX_PAR_IP, FENETRE_MS);
  if (!parIp.autorise) return { error: messageLimite(parIp.reessaiDansSec) };
  const parId = consommer(`mdp-oublie:id:${identifiant.toUpperCase()}`, MAX_PAR_IDENTIFIANT, FENETRE_MS);
  if (!parId.autorise) return { error: messageLimite(parId.reessaiDansSec) };

  const resultat = await demanderReinitialisation(identifiant, await origineApplication());
  // Même message dans tous les cas ; le compte sans e-mail reçoit en plus l'invitation à contacter son créateur
  return { message: MESSAGE_DEMANDE_ENVOYEE, sansEmail: resultat.statut === "sans-email" };
}
