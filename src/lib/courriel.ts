import { Resend } from "resend";

/*
 * Envoi d'e-mails (Resend). La clé d'API vient uniquement de la variable
 * d'environnement RESEND_API_KEY (voir .env.example, DEPLOY.md) ; l'expéditeur
 * de RESEND_FROM (défaut : l'adresse de test de Resend, qui ne délivre qu'au
 * propriétaire du compte Resend).
 *
 * Sans clé (développement, tests), ou pendant la suite e2e (E2E_TESTS=1), rien
 * ne part : le message est gardé en mémoire et consultable sur
 * /api/dev/courriels (route absente en production). En production sans clé,
 * l'envoi échoue avec un motif explicite dans les journaux — jamais en
 * silence, jamais en faisant croire qu'un message est parti.
 */

export type Courriel = { a: string; sujet: string; texte: string; html?: string };
export type ResultatEnvoi = { ok: true; id: string | null; capture: boolean } | { ok: false; motif: string };

const EXPEDITEUR_PAR_DEFAUT = "PromoPro <onboarding@resend.dev>";
const MAX_CAPTURES = 50;

type Capture = Courriel & { date: string };
const g = globalThis as unknown as { __promoproCourriels?: Capture[] };
const captures: Capture[] = g.__promoproCourriels ?? [];
if (process.env.NODE_ENV !== "production") g.__promoproCourriels = captures;

function modeCapture() {
  return process.env.E2E_TESTS === "1" || !process.env.RESEND_API_KEY;
}

export async function envoyerCourriel(courriel: Courriel): Promise<ResultatEnvoi> {
  if (modeCapture()) {
    if (process.env.NODE_ENV === "production" && process.env.E2E_TESTS !== "1") {
      console.error("[courriel] RESEND_API_KEY absente : e-mail non envoyé à", courriel.a, "—", courriel.sujet);
      return { ok: false, motif: "RESEND_API_KEY absente" };
    }
    captures.unshift({ ...courriel, date: new Date().toISOString() });
    if (captures.length > MAX_CAPTURES) captures.length = MAX_CAPTURES;
    console.log(`[courriel] (capturé, non envoyé) à ${courriel.a} — ${courriel.sujet}`);
    return { ok: true, id: null, capture: true };
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || EXPEDITEUR_PAR_DEFAUT,
      to: courriel.a,
      subject: courriel.sujet,
      text: courriel.texte,
      html: courriel.html,
    });
    if (error) {
      console.error("[courriel] envoi refusé par Resend :", error.message);
      return { ok: false, motif: error.message };
    }
    return { ok: true, id: data?.id ?? null, capture: false };
  } catch (e) {
    console.error("[courriel] envoi impossible :", e);
    return { ok: false, motif: e instanceof Error ? e.message : "erreur inconnue" };
  }
}

/** Messages capturés (hors production), le plus récent en premier. */
export function courrielsCaptures(): readonly Capture[] {
  return captures;
}

/** Pour les tests. */
export function viderCourrielsCaptures() {
  captures.length = 0;
}
