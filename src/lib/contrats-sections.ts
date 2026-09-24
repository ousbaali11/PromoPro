/*
 * Contrat par sections (phase 2 de la restructuration). Un contrat est une
 * liste ordonnée de sections (titre + texte) stockées en base et librement
 * modifiables par le Responsable Administratif ; le PDF est généré à partir
 * des sections courantes. Les textes peuvent contenir des jetons de fusion
 * « {{client}} », « {{prix}} », « {{echeancier}} »… remplacés à la
 * génération par les données réelles du dossier : un jeu de sections reste
 * ainsi réutilisable comme modèle par défaut du promoteur. Module pur, sans
 * base de données (testé dans tests/unit/contrats-sections.test.ts).
 */

export type SectionTexte = { titre: string; contenu: string };
export type SectionContrat = SectionTexte & { id: string };

/** Valeurs de fusion d'un contrat : une entrée par jeton disponible. */
export type ValeursContrat = Record<string, string>;

export const JETONS: { cle: string; libelle: string }[] = [
  { cle: "promoteur", libelle: "Nom du promoteur (vendeur)" },
  { cle: "promoteur.contact", libelle: "Coordonnées du promoteur" },
  { cle: "client", libelle: "Nom et prénom de l'acquéreur" },
  { cle: "client.piece", libelle: "Pièce d'identité de l'acquéreur" },
  { cle: "client.naissance", libelle: "Date et lieu de naissance" },
  { cle: "client.adresse", libelle: "Adresse de l'acquéreur" },
  { cle: "client.telephone", libelle: "Téléphone de l'acquéreur" },
  { cle: "client.email", libelle: "E-mail de l'acquéreur" },
  { cle: "projet", libelle: "Nom du programme" },
  { cle: "projet.compte", libelle: "Compte / société encaissant les paiements" },
  { cle: "projet.iban", libelle: "IBAN du compte" },
  { cle: "bien", libelle: "Désignation du bien" },
  { cle: "bien.nature", libelle: "Nature du bien" },
  { cle: "bien.surface", libelle: "Surface (m²)" },
  { cle: "prix", libelle: "Prix de vente" },
  { cle: "echeancier", libelle: "Échéancier de paiement (une ligne par tranche)" },
  { cle: "reference", libelle: "Référence du contrat" },
  { cle: "date", libelle: "Date du jour" },
];

/** Jeu de sections par défaut d'un nouveau contrat (utilisé quand le promoteur n'a pas encore de modèle). */
export const SECTIONS_PAR_DEFAUT: SectionTexte[] = [
  {
    titre: "Identité des parties",
    contenu:
      "Le vendeur : {{promoteur}}{{promoteur.contact}}.\n" +
      "L'acquéreur : {{client}}, {{client.piece}}, né(e) le {{client.naissance}}, demeurant {{client.adresse}}, " +
      "téléphone {{client.telephone}}, e-mail {{client.email}}.",
  },
  {
    titre: "Désignation du bien",
    contenu: "{{bien}} ({{bien.nature}}, {{bien.surface}} m²), dans le programme {{projet}}.",
  },
  {
    titre: "Prix de vente",
    contenu: "Le prix de vente est fixé à {{prix}}, payable sur le compte {{projet.compte}} (IBAN {{projet.iban}}).",
  },
  {
    titre: "Échéancier de paiement",
    contenu:
      "L'acquéreur s'engage à régler le prix de vente selon l'échéancier suivant :\n{{echeancier}}\n" +
      "Toute somme perçue en trop sur une tranche est automatiquement déduite du paiement suivant.",
  },
  {
    titre: "Conditions générales",
    contenu:
      "Le présent contrat doit être imprimé et légalisé en quatre (4) exemplaires ; trois exemplaires sont restitués " +
      "à l'acquéreur, le quatrième, signé et cacheté, est conservé par le promoteur et rendu disponible dans " +
      "l'espace client sous forme numérisée. Les références comptables des paiements validés figurent en annexe.",
  },
  {
    titre: "Clause de désistement",
    contenu:
      "En cas de désistement de l'acquéreur, celui-ci remet au vendeur un document de désistement légalisé. " +
      "Les sommes validées par le service comptable lui sont remboursées après vérification de ses papiers par le " +
      "Responsable Administratif ; si le payeur diffère de l'acquéreur, une décharge signée est exigée avant " +
      "remboursement. Le bien redevient alors disponible à la vente.",
  },
];

const JETON = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Remplace chaque jeton connu par sa valeur (« — » si vide) ; un jeton inconnu est laissé tel quel, visible dans l'aperçu. */
export function rendreTexte(contenu: string, valeurs: ValeursContrat): string {
  return contenu.replace(JETON, (tout, cle: string) => (cle in valeurs ? valeurs[cle] || "—" : tout));
}

export function rendreSections(sections: SectionTexte[], valeurs: ValeursContrat): SectionTexte[] {
  return sections.map((s) => ({ titre: rendreTexte(s.titre, valeurs), contenu: rendreTexte(s.contenu, valeurs) }));
}

/** Jetons présents dans un texte mais absents des valeurs : signalés au Responsable Administratif avant génération. */
export function jetonsInconnus(sections: SectionTexte[], valeurs: ValeursContrat): string[] {
  const inconnus = new Set<string>();
  for (const s of sections) {
    for (const m of `${s.titre}\n${s.contenu}`.matchAll(JETON)) if (!(m[1] in valeurs)) inconnus.add(m[1]);
  }
  return [...inconnus];
}

/** Lecture d'un formulaire d'éditeur : listes parallèles `sectionId[]`, `titre[]`, `contenu[]` dans l'ordre affiché. */
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

/**
 * Décrit ce qui a changé entre deux jeux de sections (journal d'activité) :
 * ajouts, suppressions, modifications de titre ou de texte, changement d'ordre.
 * Retourne null si rien n'a changé.
 */
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
