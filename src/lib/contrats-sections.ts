/*
 * Contrat par sections — deux usages nettement séparés (module pur, testé dans
 * tests/unit/contrats-sections.test.ts) :
 *
 *  A) Un contrat précis (fiche client, onglet Contrat) : ses sections sont du
 *     TEXTE SIMPLE, déjà rempli avec les données du dossier à la création, que
 *     le Responsable Administratif modifie comme dans un traitement de texte.
 *     Aucun jeton, aucune syntaxe spéciale : ce qui est enregistré est
 *     exactement ce qui a été tapé.
 *
 *  B) Le modèle par défaut du promoteur (écran « Gérer le modèle par défaut »)
 *     : chaque section est une liste ordonnée de SEGMENTS — du texte libre et
 *     des CHAMPS dynamiques (« Nom du client », « Prix du bien »…), affichés
 *     comme des étiquettes non éditables et insérés par un bouton, jamais
 *     tapés. À la création d'un contrat, chaque champ est résolu avec les
 *     vraies données du dossier et le texte obtenu devient le contenu initial
 *     des sections de ce contrat.
 *
 * Garde-fou : un texte qui contiendrait encore un jeton « {{cle}} » (données
 * antérieures non migrées) est résolu à la génération du PDF plutôt que
 * d'écrire un jeton brut dans le document.
 */

export type Segment = { type: "texte"; valeur: string } | { type: "champ"; cle: string };
export type SectionModele = { titre: string; segments: Segment[] };
export type SectionTexte = { titre: string; contenu: string };
export type SectionContrat = SectionTexte & { id: string };

/** Valeurs de fusion d'un dossier : une entrée par champ disponible. */
export type ValeursContrat = Record<string, string>;

/** Champs dynamiques disponibles dans le modèle, avec leur libellé humain (étiquette affichée). */
export const CHAMPS: { cle: string; libelle: string }[] = [
  { cle: "promoteur", libelle: "Nom du promoteur" },
  { cle: "promoteur.contact", libelle: "Coordonnées du promoteur" },
  { cle: "client", libelle: "Nom du client" },
  { cle: "client.piece", libelle: "Pièce d'identité du client" },
  { cle: "client.naissance", libelle: "Naissance du client" },
  { cle: "client.adresse", libelle: "Adresse du client" },
  { cle: "client.telephone", libelle: "Téléphone du client" },
  { cle: "client.email", libelle: "E-mail du client" },
  { cle: "projet", libelle: "Nom du programme" },
  { cle: "projet.compte", libelle: "Compte encaissant les paiements" },
  { cle: "projet.iban", libelle: "IBAN du compte" },
  { cle: "bien", libelle: "Désignation du bien" },
  { cle: "bien.nature", libelle: "Nature du bien" },
  { cle: "bien.surface", libelle: "Surface du bien (m²)" },
  { cle: "prix", libelle: "Prix du bien" },
  { cle: "echeancier", libelle: "Échéancier de paiement" },
  { cle: "reference", libelle: "Référence du contrat" },
  { cle: "date", libelle: "Date du jour" },
];
const CLES = new Set(CHAMPS.map((c) => c.cle));
export function libelleChamp(cle: string) {
  return CHAMPS.find((c) => c.cle === cle)?.libelle ?? cle;
}
export function estChampConnu(cle: string) {
  return CLES.has(cle);
}

const t = (valeur: string): Segment => ({ type: "texte", valeur });
const c = (cle: string): Segment => ({ type: "champ", cle });

/** Jeu de sections intégré (utilisé quand le promoteur n'a pas encore enregistré de modèle). */
export const SECTIONS_PAR_DEFAUT: SectionModele[] = [
  {
    titre: "Identité des parties",
    segments: [t("Le vendeur : "), c("promoteur"), c("promoteur.contact"), t(".\nL'acquéreur : "), c("client"), t(", "), c("client.piece"), t(", né(e) le "), c("client.naissance"), t(", demeurant "), c("client.adresse"), t(", téléphone "), c("client.telephone"), t(", e-mail "), c("client.email"), t(".")],
  },
  {
    titre: "Désignation du bien",
    segments: [c("bien"), t(" ("), c("bien.nature"), t(", "), c("bien.surface"), t(" m²), dans le programme "), c("projet"), t(".")],
  },
  {
    titre: "Prix de vente",
    segments: [t("Le prix de vente est fixé à "), c("prix"), t(", payable sur le compte "), c("projet.compte"), t(" (IBAN "), c("projet.iban"), t(").")],
  },
  {
    titre: "Échéancier de paiement",
    segments: [t("L'acquéreur s'engage à régler le prix de vente selon l'échéancier suivant :\n"), c("echeancier"), t("\nToute somme perçue en trop sur une tranche est automatiquement déduite du paiement suivant.")],
  },
  {
    titre: "Conditions générales",
    segments: [
      t(
        "Le présent contrat doit être imprimé et légalisé en quatre (4) exemplaires ; trois exemplaires sont restitués " +
          "à l'acquéreur, le quatrième, signé et cacheté, est conservé par le promoteur et rendu disponible dans " +
          "l'espace client sous forme numérisée. Les références comptables des paiements validés figurent en annexe.",
      ),
    ],
  },
  {
    titre: "Clause de désistement",
    segments: [
      t(
        "En cas de désistement de l'acquéreur, celui-ci remet au vendeur un document de désistement légalisé. " +
          "Les sommes validées par le service comptable lui sont remboursées après vérification de ses papiers par le " +
          "Responsable Administratif ; si le payeur diffère de l'acquéreur, une décharge signée est exigée avant " +
          "remboursement. Le bien redevient alors disponible à la vente.",
      ),
    ],
  },
];

const JETON = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Un texte contient-il encore un jeton « {{cle}} » (données antérieures non migrées) ? */
export function contientJetons(texte: string) {
  return /\{\{\s*[a-zA-Z0-9_.]+\s*\}\}/.test(texte);
}

/** Garde-fou de génération : remplace les jetons connus par leur valeur (« — » si vide) ; un jeton inconnu reste tel quel. */
export function rendreTexte(contenu: string, valeurs: ValeursContrat): string {
  return contenu.replace(JETON, (tout, cle: string) => (cle in valeurs ? valeurs[cle] || "—" : tout));
}

/** Texte d'une section de modèle avec les données d'un dossier : chaque champ devient sa valeur (« — » si vide ou inconnue). */
export function texteDepuisSegments(segments: Segment[], valeurs: ValeursContrat): string {
  return segments.map((s) => (s.type === "texte" ? s.valeur : valeurs[s.cle] || "—")).join("");
}

/** Résout un modèle entier en sections de texte simple (contenu initial d'un nouveau contrat). */
export function resoudreModele(sections: SectionModele[], valeurs: ValeursContrat): SectionTexte[] {
  return sections.map((s) => ({ titre: s.titre, contenu: texteDepuisSegments(s.segments, valeurs) }));
}

/**
 * Convertit un texte hérité « … {{cle}} … » en segments : les jetons connus
 * deviennent des champs, tout le reste (y compris un jeton inconnu) du texte.
 */
export function segmentsDepuisTexte(texte: string): Segment[] {
  const segments: Segment[] = [];
  let dernier = 0;
  for (const m of texte.matchAll(JETON)) {
    const debut = m.index ?? 0;
    if (!estChampConnu(m[1])) continue;
    if (debut > dernier) segments.push(t(texte.slice(dernier, debut)));
    segments.push(c(m[1]));
    dernier = debut + m[0].length;
  }
  if (dernier < texte.length) segments.push(t(texte.slice(dernier)));
  return normaliserSegments(segments);
}

/** Fusionne les textes contigus, retire les textes vides ; les champs inconnus sont retirés. */
export function normaliserSegments(segments: Segment[]): Segment[] {
  const resultat: Segment[] = [];
  for (const s of segments) {
    if (s.type === "champ") {
      if (estChampConnu(s.cle)) resultat.push({ type: "champ", cle: s.cle });
      continue;
    }
    if (!s.valeur) continue;
    const precedent = resultat[resultat.length - 1];
    if (precedent && precedent.type === "texte") precedent.valeur += s.valeur;
    else resultat.push({ type: "texte", valeur: s.valeur });
  }
  return resultat;
}

/** Représentation lisible d'un segment (journal) : texte tel quel, champ entre chevrons. */
export function decrireSegments(segments: Segment[]) {
  return segments.map((s) => (s.type === "texte" ? s.valeur : `«${libelleChamp(s.cle)}»`)).join("");
}

/** Lecture tolérante d'un modèle stocké : nouveau format (segments) ou format hérité (contenu avec jetons). */
export function lireModeleStocke(brut: string): SectionModele[] | null {
  let liste: unknown;
  try {
    liste = JSON.parse(brut);
  } catch {
    return null;
  }
  if (!Array.isArray(liste) || liste.length === 0) return null;
  const sections: SectionModele[] = [];
  for (const s of liste as Record<string, unknown>[]) {
    if (!s || typeof s !== "object" || typeof s.titre !== "string") return null;
    if (Array.isArray(s.segments)) {
      sections.push({ titre: s.titre, segments: normaliserSegments(s.segments.filter(estSegment)) });
    } else if (typeof s.contenu === "string") {
      sections.push({ titre: s.titre, segments: segmentsDepuisTexte(s.contenu) });
    } else return null;
  }
  return sections;
}
function estSegment(v: unknown): v is Segment {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (o.type === "texte" && typeof o.valeur === "string") || (o.type === "champ" && typeof o.cle === "string");
}
/** Un modèle stocké est-il encore au format hérité (contenu avec jetons) ? */
export function modeleAuFormatHerite(brut: string): boolean {
  try {
    const liste = JSON.parse(brut) as unknown;
    return Array.isArray(liste) && liste.some((s) => s && typeof s === "object" && !Array.isArray((s as Record<string, unknown>).segments) && typeof (s as Record<string, unknown>).contenu === "string");
  } catch {
    return false;
  }
}

/** Lecture du formulaire du modèle : listes parallèles `titre[]` et `segments[]` (JSON) dans l'ordre affiché. */
export function lireModeleFormulaire(titres: string[], segmentsJson: string[]): { sections: SectionModele[] } | { error: string } {
  if (titres.length !== segmentsJson.length) return { error: "Formulaire de modèle incohérent." };
  if (titres.length === 0) return { error: "Un modèle doit contenir au moins une section." };
  const sections: SectionModele[] = [];
  for (const [i, titre] of titres.entries()) {
    const nom = titre.trim();
    if (!nom) return { error: `La section ${i + 1} n'a pas de titre.` };
    if (nom.length > 120) return { error: `Le titre de la section ${i + 1} ne peut pas dépasser 120 caractères.` };
    let brut: unknown;
    try {
      brut = JSON.parse(segmentsJson[i] || "[]");
    } catch {
      return { error: `Le contenu de la section « ${nom} » est illisible.` };
    }
    if (!Array.isArray(brut) || !brut.every(estSegment)) return { error: `Le contenu de la section « ${nom} » est illisible.` };
    const segments = normaliserSegments(brut.map((s) => (s.type === "texte" ? { type: "texte", valeur: s.valeur.replace(/\r\n/g, "\n") } : s)));
    const longueur = segments.reduce((n, s) => n + (s.type === "texte" ? s.valeur.length : 0), 0);
    if (longueur > 20_000) return { error: `Le texte de la section « ${nom} » ne peut pas dépasser 20 000 caractères.` };
    sections.push({ titre: nom, segments });
  }
  return { sections };
}

/** Lecture du formulaire d'un contrat précis : listes parallèles `sectionId[]`, `titre[]`, `contenu[]` (texte simple). */
export function lireSectionsFormulaire(
  ids: string[],
  titres: string[],
  contenus: string[],
): { sections: (SectionTexte & { id: string | null })[] } | { error: string } {
  if (ids.length !== titres.length || ids.length !== contenus.length) return { error: "Formulaire de sections incohérent." };
  const sections = ids.map((id, i) => ({ id: id.trim() || null, titre: titres[i].trim(), contenu: contenus[i].replace(/\r\n/g, "\n").trim() }));
  if (sections.length === 0) return { error: "Un contrat doit contenir au moins une section." };
  for (const [i, s] of sections.entries()) {
    if (!s.titre) return { error: `La section ${i + 1} n'a pas de titre.` };
    if (s.titre.length > 120) return { error: `Le titre de la section ${i + 1} ne peut pas dépasser 120 caractères.` };
    if (s.contenu.length > 20_000) return { error: `Le texte de la section « ${s.titre} » ne peut pas dépasser 20 000 caractères.` };
  }
  return { sections };
}

/** Décrit ce qui a changé entre deux jeux de sections (journal) : ajouts, suppressions, modifications, ordre. Null si rien. */
export function decrireChangementsSections(avant: SectionContrat[], apres: (SectionTexte & { id: string | null })[]): string | null {
  const parts: string[] = [];
  const avantById = new Map(avant.map((s) => [s.id, s]));
  const conserves = apres.filter((s): s is SectionTexte & { id: string } => !!s.id && avantById.has(s.id));
  for (const s of apres) if (!s.id || !avantById.has(s.id)) parts.push(`section « ${s.titre} » ajoutée`);
  for (const s of avant) if (!conserves.some((c) => c.id === s.id)) parts.push(`section « ${s.titre} » supprimée`);
  for (const s of conserves) {
    const a = avantById.get(s.id)!;
    const quoi = [a.titre !== s.titre ? `titre « ${a.titre} » → « ${s.titre} »` : null, a.contenu !== s.contenu ? "texte" : null].filter(Boolean);
    if (quoi.length) parts.push(`section « ${s.titre} » modifiée (${quoi.join(", ")})`);
  }
  const ordreAvant = avant.filter((s) => conserves.some((c) => c.id === s.id)).map((s) => s.id).join("|");
  const ordreApres = conserves.map((s) => s.id).join("|");
  if (ordreAvant !== ordreApres) parts.push("ordre des sections modifié");
  return parts.length ? parts.join(" · ") : null;
}

export type VersionPdf = { url: string; dateGeneration: string };

/** Historique des PDF générés (colonne JSON `contrats.historique_pdf`), le plus récent en premier. */
export function lireHistoriquePdf(brut: string | null | undefined): VersionPdf[] {
  if (!brut) return [];
  try {
    const liste = JSON.parse(brut) as unknown;
    if (!Array.isArray(liste)) return [];
    return liste.filter((v): v is VersionPdf => !!v && typeof v === "object" && typeof (v as VersionPdf).url === "string" && typeof (v as VersionPdf).dateGeneration === "string");
  } catch {
    return [];
  }
}

/** Archive l'ancien PDF en tête de l'historique (jamais supprimé : trace de ce qui a pu être signé). */
export function archiverPdf(historique: VersionPdf[], ancienneUrl: string | null | undefined, dateGeneration: Date | null | undefined): VersionPdf[] {
  if (!ancienneUrl) return historique;
  return [{ url: ancienneUrl, dateGeneration: (dateGeneration ?? new Date()).toISOString() }, ...historique.filter((v) => v.url !== ancienneUrl)];
}
