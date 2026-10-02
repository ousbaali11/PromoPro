import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { fournisseursPlan3dConfig } from "@/db/schema";
import { enregistrerActivite } from "@/lib/journal";
import type { SessionPayload } from "@/lib/auth";
import { chiffrementDisponible, chiffrer, dechiffrer, masquerCle } from "./chiffrement";
import { empreinteModele, modeleDisponible } from "./inference";
import { descriptionFournisseur, FOURNISSEURS, libelleFournisseur, type Fournisseur } from "./provider";

/*
 * Configuration des fournisseurs (Super Admin, /admin/plan3d) : clé d'API
 * chiffrée au repos pour les services externes, un seul fournisseur actif
 * pour les générations réelles sur les biens. Un fournisseur sans clé
 * (modèle interne) est « configuré » quand son modèle est installé ; un
 * fournisseur non activable ne peut être choisi que dans le bac à sable.
 * Toute modification est journalisée (action sensible).
 */

export type ConfigAffichee = {
  fournisseur: Fournisseur;
  libelle: string;
  site: string;
  necessiteCle: boolean;
  activable: boolean;
  etat?: string;
  description?: string;
  /** Clé masquée, ou état du modèle interne ; null si rien n'est configuré. */
  cleMasquee: string | null;
  /** Utilisable dans le bac à sable (clé déchiffrable, ou modèle installé). */
  configure: boolean;
  actif: boolean;
  modifieAt: Date | null;
  /** Fournisseur dont la clé est réutilisée (aucune clé propre à saisir). */
  cleDe?: Fournisseur;
};

export async function configurationsAffichees(): Promise<ConfigAffichee[]> {
  const lignes = await db.query.fournisseursPlan3dConfig.findMany();
  const modeles = await Promise.all(FOURNISSEURS.map((f) => (f.modeleInterne ? modeleDisponible(f.modeleInterne) : Promise.resolve(false))));
  // Empreinte du fichier réellement chargé : permet de vérifier que deux variantes n'utilisent pas le même modèle
  const empreintes = await Promise.all(FOURNISSEURS.map((f, i) => (f.modeleInterne && modeles[i] ? empreinteModele(f.modeleInterne) : Promise.resolve(null))));
  const cleLisible = (code: string) => {
    const ligne = lignes.find((l) => l.fournisseur === code);
    if (!ligne || !chiffrementDisponible()) return false;
    try {
      dechiffrer(ligne.cleApiChiffree);
      return true;
    } catch {
      return false;
    }
  };
  return FOURNISSEURS.map((f, i) => {
    const ligne = lignes.find((l) => l.fournisseur === f.code);
    let cleMasquee: string | null = null;
    let configure = false;
    if (f.cleDe) {
      configure = cleLisible(f.cleDe);
      cleMasquee = configure ? `Clé de ${libelleFournisseur(f.cleDe)} (partagée)` : `Aucune : saisissez la clé sur la carte ${libelleFournisseur(f.cleDe)}`;
    } else if (!f.necessiteCle) {
      configure = modeles[i];
      cleMasquee = modeles[i] ? `Modèle installé sur le serveur · empreinte ${empreintes[i] ?? "inconnue"}` : "Modèle non installé (voir DEPLOY.md)";
    } else if (ligne && chiffrementDisponible()) {
      try {
        cleMasquee = masquerCle(dechiffrer(ligne.cleApiChiffree));
        configure = true;
      } catch {
        cleMasquee = "clé illisible (SECRETS_ENCRYPTION_KEY a changé ?)";
      }
    } else if (ligne) {
      cleMasquee = "clé enregistrée, chiffrement indisponible";
    }
    return {
      fournisseur: f.code,
      libelle: f.libelle,
      site: f.site,
      necessiteCle: f.necessiteCle,
      activable: f.activable,
      etat: f.etat,
      description: f.description,
      cleMasquee,
      configure,
      actif: !!ligne?.actif && f.activable,
      modifieAt: ligne?.modifieAt ?? null,
      cleDe: f.cleDe,
    };
  });
}

/** Clé d'API en clair d'un fournisseur (serveur uniquement, au moment de l'appel) ; chaîne vide pour un fournisseur sans clé ; null si inutilisable. */
export async function cleApiPour(fournisseur: Fournisseur): Promise<string | null> {
  const description = descriptionFournisseur(fournisseur);
  if (!description) return null;
  if (!description.necessiteCle) return description.modeleInterne && (await modeleDisponible(description.modeleInterne)) ? "" : null;
  if (!chiffrementDisponible()) return null;
  // Clé partagée : celle du fournisseur désigné par cleDe
  const ligne = await db.query.fournisseursPlan3dConfig.findFirst({ where: eq(fournisseursPlan3dConfig.fournisseur, description.cleDe ?? fournisseur) });
  if (!ligne) return null;
  try {
    return dechiffrer(ligne.cleApiChiffree);
  } catch {
    return null;
  }
}

/** Fournisseur actif utilisable (activable, clé ou modèle disponible), ou null : la génération automatique est alors désactivée. */
export async function fournisseurActif(): Promise<{ fournisseur: Fournisseur; cleApi: string } | null> {
  const ligne = await db.query.fournisseursPlan3dConfig.findFirst({ where: eq(fournisseursPlan3dConfig.actif, true) });
  if (!ligne) return null;
  const description = descriptionFournisseur(ligne.fournisseur);
  if (!description?.activable) return null;
  const cleApi = await cleApiPour(description.code);
  return cleApi !== null ? { fournisseur: description.code, cleApi } : null;
}

export async function enregistrerCleApi(session: SessionPayload, fournisseur: Fournisseur, cleApi: string) {
  const description = descriptionFournisseur(fournisseur);
  if (!description?.necessiteCle) return { error: "Ce fournisseur ne demande aucune clé d'API." };
  if (description.cleDe) return { error: `Ce fournisseur utilise la clé de ${libelleFournisseur(description.cleDe)} : saisissez-la sur sa carte.` };
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
  return { ok: true as const };
}

/** Rend `fournisseur` actif (les autres deviennent inactifs), ou désactive tout si null. Un fournisseur non activable est refusé. */
export async function definirFournisseurActif(session: SessionPayload, fournisseur: Fournisseur | null) {
  if (fournisseur) {
    const description = descriptionFournisseur(fournisseur);
    if (!description?.activable) return { error: `${libelleFournisseur(fournisseur)} n'est pas encore activable pour les biens : ${description?.etat ?? "en développement"}.` };
    // Un fournisseur à clé partagée a sa propre ligne (créée ici au besoin) pour porter le drapeau actif ; la clé reste sur le fournisseur source
    if (description.cleDe) {
      const source = await db.query.fournisseursPlan3dConfig.findFirst({ where: eq(fournisseursPlan3dConfig.fournisseur, description.cleDe) });
      if (!source) return { error: `Enregistrez d'abord la clé d'API de ${libelleFournisseur(description.cleDe)}.` };
    }
    // Un fournisseur interne (sans clé) a lui aussi sa ligne, créée ici, à condition que son modèle soit installé
    if (!description.necessiteCle && !(description.modeleInterne && (await modeleDisponible(description.modeleInterne)))) {
      return { error: `Installez d'abord le modèle de ${libelleFournisseur(fournisseur)} (DEPLOY.md, section 12).` };
    }
    let ligne = await db.query.fournisseursPlan3dConfig.findFirst({ where: eq(fournisseursPlan3dConfig.fournisseur, fournisseur) });
    if (!ligne && (description.cleDe || !description.necessiteCle)) {
      [ligne] = await db.insert(fournisseursPlan3dConfig).values({ fournisseur, cleApiChiffree: "", actif: false, modifieParId: session.userId, modifieAt: new Date() }).returning();
    }
    if (!ligne) return { error: "Enregistrez d'abord la clé d'API de ce fournisseur." };
    await db.update(fournisseursPlan3dConfig).set({ actif: false });
    await db.update(fournisseursPlan3dConfig).set({ actif: true, modifieParId: session.userId, modifieAt: new Date() }).where(eq(fournisseursPlan3dConfig.id, ligne.id));
  } else {
    await db.update(fournisseursPlan3dConfig).set({ actif: false });
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
