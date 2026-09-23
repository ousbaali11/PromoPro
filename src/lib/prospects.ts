/*
 * Prospects (cahier des charges 10.1) — import d'un fichier et répartition
 * équilibrée entre commerciaux. Tout ici est pur (aucun accès base) pour être
 * testé unitairement ; la lecture du fichier Excel et les écritures sont dans
 * src/lib/prospects-import.ts et les actions de la page.
 */

/** Une ligne de prospect prête à être importée. */
export type LigneProspect = { nom: string; telephone: string; source: string };

export type LigneIgnoree = { ligne: number; motif: string };

/** En-tête normalisé : minuscules, sans accent, sans espace ni ponctuation. */
export function normaliserEntete(entete: string): string {
  return entete
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Alias acceptés pour chaque colonne attendue (après normalisation). */
export const ALIAS_COLONNES: Record<keyof LigneProspect, readonly string[]> = {
  nom: ["nom", "name", "nomcomplet", "nomprenom", "prenomnom", "prospect", "client", "contact", "fullname"],
  telephone: ["telephone", "tel", "phone", "gsm", "mobile", "portable", "numero", "numerodetelephone", "telephonenumber", "num"],
  source: ["source", "origine", "canal", "provenance", "plateforme", "site"],
};

/**
 * Trouve, dans les en-têtes du fichier, la colonne réelle de chaque champ
 * (ordre libre, casse et accents ignorés). `null` si absente.
 */
export function detecterColonnes(entetes: string[]): Record<keyof LigneProspect, string | null> {
  const normalisees = entetes.map((e) => [normaliserEntete(e), e] as const);
  const trouver = (champ: keyof LigneProspect) => {
    for (const alias of ALIAS_COLONNES[champ]) {
      const hit = normalisees.find(([n]) => n === alias);
      if (hit) return hit[1];
    }
    return null;
  };
  return { nom: trouver("nom"), telephone: trouver("telephone"), source: trouver("source") };
}

/** Chiffres seulement, pour comparer deux numéros écrits différemment. */
export function telephoneCanonique(telephone: string): string {
  return telephone.replace(/\D/g, "");
}

function texte(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

export const MAX_LIGNES_IMPORT = 5000;

/**
 * Transforme les lignes brutes du fichier (une entrée par ligne, clés = en-têtes)
 * en prospects valides + lignes ignorées avec motif. Les colonnes `nom` et
 * `telephone` sont obligatoires ; `source` est facultative (« Non précisée »).
 * Une ligne sans téléphone, sans nom, en doublon dans le fichier ou déjà
 * connue en base est ignorée sans faire échouer l'import.
 */
export function analyserLignes(
  lignes: Record<string, unknown>[],
  options: { telephonesExistants?: Set<string>; premiereLigne?: number } = {},
): { valides: LigneProspect[]; ignorees: LigneIgnoree[]; colonnes: Record<keyof LigneProspect, string | null> } {
  const premiereLigne = options.premiereLigne ?? 2; // ligne 1 = en-têtes
  const entetes = Array.from(new Set(lignes.flatMap((l) => Object.keys(l))));
  const colonnes = detecterColonnes(entetes);
  const valides: LigneProspect[] = [];
  const ignorees: LigneIgnoree[] = [];
  if (!colonnes.nom || !colonnes.telephone) return { valides, ignorees, colonnes };

  const vus = new Map<string, number>(); // téléphone canonique → numéro de ligne
  lignes.forEach((l, i) => {
    const ligne = premiereLigne + i;
    const nom = texte(l[colonnes.nom!]);
    const telephone = texte(l[colonnes.telephone!]);
    const source = colonnes.source ? texte(l[colonnes.source]) : "";
    if (!nom && !telephone && !source) return; // ligne entièrement vide : ni comptée ni importée
    if (!telephone) return void ignorees.push({ ligne, motif: "téléphone vide" });
    const canon = telephoneCanonique(telephone);
    if (canon.length < 6) return void ignorees.push({ ligne, motif: `téléphone invalide (« ${telephone} »)` });
    if (!nom) return void ignorees.push({ ligne, motif: "nom vide" });
    const deja = vus.get(canon);
    if (deja !== undefined) return void ignorees.push({ ligne, motif: `doublon du téléphone de la ligne ${deja}` });
    if (options.telephonesExistants?.has(canon)) return void ignorees.push({ ligne, motif: "téléphone déjà présent dans les prospects" });
    vus.set(canon, ligne);
    valides.push({ nom, telephone, source: source || "Non précisée" });
  });
  return { valides, ignorees, colonnes };
}

export type ChargeCommercial = { id: string; charge: number };

export type RepartitionCommercial<T> = {
  id: string;
  chargeInitiale: number;
  attribues: T[];
  /** chargeInitiale + attribués */
  total: number;
};

/**
 * Répartition équilibrée : chaque nouveau prospect va au commercial dont le
 * total courant (charge existante + déjà attribués dans ce lot) est le plus
 * bas ; à égalité, le premier de la liste (ordre stable). À l'arrivée, l'écart
 * entre le plus chargé et le moins chargé est au plus de 1 dès que le lot est
 * assez grand pour combler les écarts initiaux, et jamais supérieur à l'écart
 * de départ sinon.
 */
export function repartitionEquilibree<T>(
  commerciaux: ChargeCommercial[],
  nouveaux: T[],
): { parCommercial: RepartitionCommercial<T>[]; ecart: number } {
  if (commerciaux.length === 0) {
    if (nouveaux.length > 0) throw new Error("Aucun commercial disponible pour la répartition.");
    return { parCommercial: [], ecart: 0 };
  }
  const parCommercial: RepartitionCommercial<T>[] = commerciaux.map((c) => ({
    id: c.id,
    chargeInitiale: Math.max(0, c.charge),
    attribues: [],
    total: Math.max(0, c.charge),
  }));
  for (const element of nouveaux) {
    let cible = parCommercial[0];
    for (const c of parCommercial) if (c.total < cible.total) cible = c;
    cible.attribues.push(element);
    cible.total += 1;
  }
  return { parCommercial, ecart: ecartCharge(parCommercial) };
}

/** Écart entre le commercial le plus chargé et le moins chargé. */
export function ecartCharge(parCommercial: { total: number }[]): number {
  if (parCommercial.length === 0) return 0;
  const totaux = parCommercial.map((c) => c.total);
  return Math.max(...totaux) - Math.min(...totaux);
}
