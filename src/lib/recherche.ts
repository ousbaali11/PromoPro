/*
 * Recherche globale du dashboard (Ctrl/Cmd+K) : biens, clients et projets du
 * promoteur courant, par nom / désignation, résultats groupés par type avec
 * lien vers la fiche. Logique pure ici (normalisation, filtrage, limite) ;
 * le cloisonnement multi-promoteur et par rôle est appliqué par la route
 * GET /api/recherche avant d'appeler ces fonctions.
 */

export type TypeResultat = "bien" | "client" | "projet";

export type ResultatRecherche = {
  type: TypeResultat;
  id: string;
  titre: string;
  sousTitre?: string;
  href: string;
};

export type GroupeRecherche = { type: TypeResultat; libelle: string; resultats: ResultatRecherche[] };

/** Ordre et libellés des groupes affichés. */
export const GROUPES: { type: TypeResultat; libelle: string }[] = [
  { type: "bien", libelle: "Biens" },
  { type: "client", libelle: "Clients" },
  { type: "projet", libelle: "Projets" },
];

export const LONGUEUR_MIN = 2;
export const MAX_PAR_GROUPE = 8;

/** Minuscules, sans accent, espaces réduits : « Résidence  Al-Manar » → « residence al-manar ». */
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Tous les mots de la requête apparaissent dans le texte (ordre libre, accents et casse ignorés). */
export function correspond(texte: string, requete: string): boolean {
  const t = normaliser(texte);
  const mots = normaliser(requete).split(" ").filter(Boolean);
  return mots.length > 0 && mots.every((m) => t.includes(m));
}

/** Requête exploitable ? (au moins LONGUEUR_MIN caractères utiles) */
export function requeteValide(requete: string): boolean {
  return normaliser(requete).length >= LONGUEUR_MIN;
}

/**
 * Filtre chaque source selon la requête, trie (correspondance en début de
 * titre d'abord, puis alphabétique) et limite chaque groupe. Les groupes
 * vides sont omis.
 */
export function rechercher(sources: Record<TypeResultat, ResultatRecherche[]>, requete: string, maxParGroupe = MAX_PAR_GROUPE): GroupeRecherche[] {
  if (!requeteValide(requete)) return [];
  const q = normaliser(requete);
  return GROUPES.map(({ type, libelle }) => {
    const resultats = (sources[type] ?? [])
      .filter((r) => correspond(`${r.titre} ${r.sousTitre ?? ""}`, requete))
      .sort((a, b) => {
        const pa = normaliser(a.titre).startsWith(q) ? 0 : 1;
        const pb = normaliser(b.titre).startsWith(q) ? 0 : 1;
        return pa - pb || a.titre.localeCompare(b.titre, "fr", { numeric: true, sensitivity: "base" });
      })
      .slice(0, maxParGroupe);
    return { type, libelle, resultats };
  }).filter((g) => g.resultats.length > 0);
}
