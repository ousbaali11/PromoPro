import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { fournisseursPlan3dConfig } from "@/db/schema";
import { enregistrerActivite } from "@/lib/journal";
import type { SessionPayload } from "@/lib/auth";
import { chiffrementDisponible, chiffrer, dechiffrer, masquerCle } from "./chiffrement";
import { FOURNISSEURS, libelleFournisseur, type Fournisseur } from "./provider";

/*
 * Configuration des fournisseurs (Super Admin, /admin/plan3d) : clé d'API
 * chiffrée au repos, un seul fournisseur actif pour les générations réelles
 * sur les biens. Toute modification est journalisée (action sensible).
 */

export type ConfigAffichee = { fournisseur: Fournisseur; libelle: string; site: string; cleMasquee: string | null; actif: boolean; modifieAt: Date | null };

export async function configurationsAffichees(): Promise<ConfigAffichee[]> {
  const lignes = await db.query.fournisseursPlan3dConfig.findMany();
  return FOURNISSEURS.map((f) => {
    const ligne = lignes.find((l) => l.fournisseur === f.code);
    let cleMasquee: string | null = null;
    if (ligne && chiffrementDisponible()) {
      try {
        cleMasquee = masquerCle(dechiffrer(ligne.cleApiChiffree));
      } catch {
        cleMasquee = "clé illisible (SECRETS_ENCRYPTION_KEY a changé ?)";
      }
    } else if (ligne) {
      cleMasquee = "clé enregistrée, chiffrement indisponible";
    }
    return { fournisseur: f.code, libelle: f.libelle, site: f.site, cleMasquee, actif: !!ligne?.actif, modifieAt: ligne?.modifieAt ?? null };
  });
}

/** Clé d'API en clair d'un fournisseur (serveur uniquement, au moment de l'appel), ou null. */
export async function cleApiPour(fournisseur: Fournisseur): Promise<string | null> {
  if (!chiffrementDisponible()) return null;
  const ligne = await db.query.fournisseursPlan3dConfig.findFirst({ where: eq(fournisseursPlan3dConfig.fournisseur, fournisseur) });
  if (!ligne) return null;
  try {
    return dechiffrer(ligne.cleApiChiffree);
  } catch {
    return null;
  }
}

/** Fournisseur actif utilisable (clé déchiffrable), ou null : la génération automatique est alors désactivée. */
export async function fournisseurActif(): Promise<{ fournisseur: Fournisseur; cleApi: string } | null> {
  if (!chiffrementDisponible()) return null;
  const ligne = await db.query.fournisseursPlan3dConfig.findFirst({ where: eq(fournisseursPlan3dConfig.actif, true) });
  if (!ligne) return null;
  const cleApi = await cleApiPour(ligne.fournisseur as Fournisseur);
  return cleApi ? { fournisseur: ligne.fournisseur as Fournisseur, cleApi } : null;
}

export async function enregistrerCleApi(session: SessionPayload, fournisseur: Fournisseur, cleApi: string) {
  const chiffree = chiffrer(cleApi);
  const existante = await db.query.fournisseursPlan3dConfig.findFirst({ where: eq(fournisseursPlan3dConfig.fournisseur, fournisseur) });
  if (existante) {
    await db.update(fournisseursPlan3dConfig).set({ cleApiChiffree: chiffree, modifieParId: session.userId, modifieAt: new Date() }).where(eq(fournisseursPlan3dConfig.id, existante.id));
  } else {
    await db.insert(fournisseursPlan3dConfig).values({ fournisseur, cleApiChiffree: chiffree, actif: false, modifieParId: session.userId, modifieAt: new Date() });
  }
  await enregistrerActivite({
    acteur: session,
    action: "MODIFICATION",
    cibleType: "plan3d",
    cibleId: fournisseur,
    cibleNom: libelleFournisseur(fournisseur),
    details: `Clé d'API ${existante ? "remplacée" : "enregistrée"} (${masquerCle(cleApi)})`,
    promoteurId: null,
  });
}

/** Rend `fournisseur` actif (les autres deviennent inactifs), ou désactive tout si null. */
export async function definirFournisseurActif(session: SessionPayload, fournisseur: Fournisseur | null) {
  await db.update(fournisseursPlan3dConfig).set({ actif: false });
  if (fournisseur) {
    const ligne = await db.query.fournisseursPlan3dConfig.findFirst({ where: eq(fournisseursPlan3dConfig.fournisseur, fournisseur) });
    if (!ligne) return { error: "Enregistrez d'abord la clé d'API de ce fournisseur." };
    await db.update(fournisseursPlan3dConfig).set({ actif: true, modifieParId: session.userId, modifieAt: new Date() }).where(eq(fournisseursPlan3dConfig.id, ligne.id));
  }
  await enregistrerActivite({
    acteur: session,
    action: "MODIFICATION",
    cibleType: "plan3d",
    cibleId: fournisseur,
    cibleNom: fournisseur ? libelleFournisseur(fournisseur) : "Génération 3D",
    details: fournisseur ? `Fournisseur actif pour les générations sur les biens : ${libelleFournisseur(fournisseur)}` : "Génération automatique désactivée (aucun fournisseur actif)",
    promoteurId: null,
  });
  return { ok: true as const };
}
