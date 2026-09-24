/*
 * Plage de dates partagée par les tableaux de bord internes (module pur,
 * utilisable côté serveur et navigateur ; testé dans tests/unit/plage-dates.test.ts).
 *
 * Une plage est décrite par un code court, porté par l'URL (`?plage=`) et
 * mémorisé par utilisateur dans localStorage :
 *  - préréglage : "aujourdhui", "semaine", "7j", "30j", "mois", "annee", "semaine-derniere" ;
 *  - relatif : "rel:-3:mois" (les 3 derniers mois), "rel:+2:semaines" (les 2 prochaines semaines) ;
 *  - personnalisé : "perso:<début ISO>_<fin ISO>".
 * Le serveur résout le code en [début ; fin] au moment de la requête, le
 * navigateur affiche le libellé correspondant.
 */

export type Plage = { code: string; libelle: string; debut: Date; fin: Date };
export type Unite = "jours" | "semaines" | "mois" | "annees";
export type Granularite = "jour" | "semaine" | "mois";

export const PLAGE_PAR_DEFAUT = "30j";
export const UNITES: { valeur: Unite; singulier: string; pluriel: string; feminin: boolean }[] = [
  { valeur: "jours", singulier: "jour", pluriel: "jours", feminin: false },
  { valeur: "semaines", singulier: "semaine", pluriel: "semaines", feminin: true },
  { valeur: "mois", singulier: "mois", pluriel: "mois", feminin: false },
  { valeur: "annees", singulier: "année", pluriel: "années", feminin: true },
];

export function debutDeJournee(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
export function finDeJournee(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function lundiDeLaSemaine(d: Date) {
  const j = debutDeJournee(d);
  const decalage = (j.getDay() + 6) % 7; // lundi = 0
  j.setDate(j.getDate() - decalage);
  return j;
}
export function ajouter(d: Date, n: number, unite: Unite) {
  const r = new Date(d);
  if (unite === "jours") r.setDate(r.getDate() + n);
  if (unite === "semaines") r.setDate(r.getDate() + 7 * n);
  if (unite === "mois") r.setMonth(r.getMonth() + n);
  if (unite === "annees") r.setFullYear(r.getFullYear() + n);
  return r;
}

/** Préréglages de l'onglet « Rapide », dans l'ordre d'affichage. */
export const PREREGLAGES: { code: string; libelle: string; resoudre: (now: Date) => [Date, Date] }[] = [
  { code: "aujourdhui", libelle: "Aujourd'hui", resoudre: (now) => [debutDeJournee(now), finDeJournee(now)] },
  { code: "semaine", libelle: "Cette semaine", resoudre: (now) => [lundiDeLaSemaine(now), finDeJournee(ajouter(lundiDeLaSemaine(now), 6, "jours"))] },
  { code: "7j", libelle: "7 derniers jours", resoudre: (now) => [debutDeJournee(ajouter(now, -6, "jours")), finDeJournee(now)] },
  { code: "30j", libelle: "30 derniers jours", resoudre: (now) => [debutDeJournee(ajouter(now, -29, "jours")), finDeJournee(now)] },
  { code: "mois", libelle: "Ce mois-ci", resoudre: (now) => [new Date(now.getFullYear(), now.getMonth(), 1), finDeJournee(new Date(now.getFullYear(), now.getMonth() + 1, 0))] },
  { code: "annee", libelle: "Cette année", resoudre: (now) => [new Date(now.getFullYear(), 0, 1), finDeJournee(new Date(now.getFullYear(), 11, 31))] },
  {
    code: "semaine-derniere",
    libelle: "La semaine dernière",
    resoudre: (now) => {
      const lundi = ajouter(lundiDeLaSemaine(now), -7, "jours");
      return [lundi, finDeJournee(ajouter(lundi, 6, "jours"))];
    },
  },
];

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
function jourMois(d: Date) {
  return `${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`;
}
function heure(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function estJourneeEntiere(debut: Date, fin: Date) {
  return debut.getHours() === 0 && debut.getMinutes() === 0 && fin.getHours() === 23 && fin.getMinutes() === 59;
}

/** Libellé d'une plage personnalisée : « 12 sept. – 24 sept. 2026 », « 24 sept. 2026, 09:00 – 18:00 », « 12 déc. 2025 – 24 sept. 2026 ». */
export function libellePersonnalise(debut: Date, fin: Date) {
  const memeJour = debutDeJournee(debut).getTime() === debutDeJournee(fin).getTime();
  if (memeJour) return estJourneeEntiere(debut, fin) ? `${jourMois(debut)} ${debut.getFullYear()}` : `${jourMois(debut)} ${debut.getFullYear()}, ${heure(debut)} – ${heure(fin)}`;
  const avecHeures = !estJourneeEntiere(debut, fin);
  const h = (d: Date) => (avecHeures ? ` ${heure(d)}` : "");
  if (debut.getFullYear() === fin.getFullYear()) return `${jourMois(debut)}${h(debut)} – ${jourMois(fin)} ${fin.getFullYear()}${h(fin)}`;
  return `${jourMois(debut)} ${debut.getFullYear()}${h(debut)} – ${jourMois(fin)} ${fin.getFullYear()}${h(fin)}`;
}

/** Libellé d'une plage relative : « 3 derniers mois », « 2 prochaines semaines », « 1 dernier jour ». */
export function libelleRelatif(n: number, unite: Unite, sens: "derniers" | "prochains") {
  const u = UNITES.find((x) => x.valeur === unite)!;
  const nom = n > 1 ? u.pluriel : u.singulier;
  const adj = sens === "derniers" ? (u.feminin ? (n > 1 ? "dernières" : "dernière") : n > 1 ? "derniers" : "dernier") : u.feminin ? (n > 1 ? "prochaines" : "prochaine") : n > 1 ? "prochains" : "prochain";
  return `${n} ${adj} ${nom}`;
}

export function codeRelatif(n: number, unite: Unite, sens: "derniers" | "prochains") {
  return `rel:${sens === "derniers" ? "-" : "+"}${n}:${unite}`;
}
export function codePersonnalise(debut: Date, fin: Date) {
  return `perso:${debut.toISOString()}_${fin.toISOString()}`;
}

/** La fin doit être postérieure au début ; message d'erreur sinon (null si valide). */
export function verifierPersonnalisee(debut: Date | null, fin: Date | null): string | null {
  if (!debut || Number.isNaN(debut.getTime())) return "Indiquez une date de début.";
  if (!fin || Number.isNaN(fin.getTime())) return "Indiquez une date de fin.";
  if (fin.getTime() <= debut.getTime()) return "La fin doit être postérieure au début.";
  return null;
}

/** Résout un code de plage à l'instant `now` ; code absent ou invalide → plage par défaut (30 derniers jours). */
export function decoderPlage(code: string | null | undefined, now = new Date()): Plage {
  const brut = (code ?? "").trim();
  const preregle = PREREGLAGES.find((p) => p.code === brut);
  if (preregle) {
    const [debut, fin] = preregle.resoudre(now);
    return { code: preregle.code, libelle: preregle.libelle, debut, fin };
  }
  const rel = brut.match(/^rel:([+-])(\d{1,3}):(jours|semaines|mois|annees)$/);
  if (rel) {
    const n = Number(rel[2]);
    const unite = rel[3] as Unite;
    if (n >= 1) {
      const sens = rel[1] === "-" ? "derniers" : "prochains";
      const debut = sens === "derniers" ? debutDeJournee(ajouter(now, -n, unite)) : debutDeJournee(now);
      const fin = sens === "derniers" ? finDeJournee(now) : finDeJournee(ajouter(now, n, unite));
      return { code: brut, libelle: libelleRelatif(n, unite, sens), debut, fin };
    }
  }
  const perso = brut.match(/^perso:(.+)_(.+)$/);
  if (perso) {
    const debut = new Date(perso[1]);
    const fin = new Date(perso[2]);
    if (!verifierPersonnalisee(debut, fin)) return { code: brut, libelle: libellePersonnalise(debut, fin), debut, fin };
  }
  return decoderPlage(PLAGE_PAR_DEFAUT, now);
}

/** Granularité des graphiques selon la longueur de la plage : jour (≤ 31 j), semaine (≤ 190 j), mois au-delà. */
export function granularite(plage: { debut: Date; fin: Date }): Granularite {
  const jours = (plage.fin.getTime() - plage.debut.getTime()) / 86_400_000;
  if (jours <= 31) return "jour";
  if (jours <= 190) return "semaine";
  return "mois";
}

/** Clé localStorage du dernier choix d'un utilisateur. */
export function clePlage(userId: string) {
  return `promopro:plage:${userId}`;
}
