import { ajouter, debutDeJournee, finDeJournee, type Granularite } from "@/lib/plage-dates";

/*
 * Agrégation des graphiques des tableaux de bord (module pur, testé dans
 * tests/unit/graphiques.test.ts) : découpe une plage en intervalles (jour,
 * semaine ISO ou mois), y range des événements datés (nombre ou somme), et
 * produit les séries prêtes pour recharts (barres et courbe cumulée).
 */

export type Intervalle = { cle: string; libelle: string; debut: Date; fin: Date };
export type Evenement = { date: Date | number | string | null | undefined; valeur?: number };
export type Serie = { cle: string; libelle: string; valeurs: number[] };
export type LigneDonnees = { intervalle: string } & Record<string, number | string>;

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const z = (n: number) => String(n).padStart(2, "0");

function lundi(d: Date) {
  const j = debutDeJournee(d);
  j.setDate(j.getDate() - ((j.getDay() + 6) % 7));
  return j;
}
/** Numéro de semaine ISO 8601. */
export function semaineIso(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const jour = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - jour);
  const debutAnnee = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - debutAnnee.getTime()) / 86_400_000 + 1) / 7);
}

/** Intervalles couvrant la plage, contigus, bornés à la plage aux extrémités. */
export function intervalles(plage: { debut: Date; fin: Date }, granularite: Granularite): Intervalle[] {
  const liste: Intervalle[] = [];
  let curseur = granularite === "semaine" ? lundi(plage.debut) : granularite === "mois" ? new Date(plage.debut.getFullYear(), plage.debut.getMonth(), 1) : debutDeJournee(plage.debut);
  let garde = 0;
  while (curseur.getTime() <= plage.fin.getTime() && garde++ < 2000) {
    const suivant = granularite === "jour" ? ajouter(curseur, 1, "jours") : granularite === "semaine" ? ajouter(curseur, 7, "jours") : new Date(curseur.getFullYear(), curseur.getMonth() + 1, 1);
    const fin = new Date(suivant.getTime() - 1);
    liste.push({
      cle: granularite === "jour" ? `${curseur.getFullYear()}-${z(curseur.getMonth() + 1)}-${z(curseur.getDate())}` : granularite === "semaine" ? `${curseur.getFullYear()}-S${z(semaineIso(curseur))}` : `${curseur.getFullYear()}-${z(curseur.getMonth() + 1)}`,
      libelle:
        granularite === "jour"
          ? `${curseur.getDate()} ${MOIS_COURTS[curseur.getMonth()]}`
          : granularite === "semaine"
            ? `S${semaineIso(curseur)} · ${curseur.getDate()} ${MOIS_COURTS[curseur.getMonth()]}`
            : `${MOIS_COURTS[curseur.getMonth()]} ${curseur.getFullYear()}`,
      debut: new Date(Math.max(curseur.getTime(), plage.debut.getTime())),
      fin: new Date(Math.min(fin.getTime(), finDeJournee(plage.fin).getTime())),
    });
    curseur = suivant;
  }
  return liste;
}

function dateDe(e: Evenement): Date | null {
  if (e.date === null || e.date === undefined) return null;
  const d = e.date instanceof Date ? e.date : new Date(e.date);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Range les événements dans les intervalles : nombre d'événements, ou somme de leurs valeurs. */
export function agreger(liste: Intervalle[], evenements: Evenement[], mode: "nombre" | "somme" = "nombre"): number[] {
  const valeurs = liste.map(() => 0);
  for (const e of evenements) {
    const d = dateDe(e);
    if (!d) continue;
    const t = d.getTime();
    const i = liste.findIndex((it) => t >= it.debut.getTime() && t <= it.fin.getTime());
    if (i < 0) continue;
    valeurs[i] += mode === "nombre" ? 1 : Math.round((e.valeur ?? 0) * 100) / 100;
  }
  return valeurs;
}

/** Cumul progressif d'une série (courbe « depuis le début de la période »). */
export function cumul(valeurs: number[]): number[] {
  let total = 0;
  return valeurs.map((v) => (total = Math.round((total + v) * 100) / 100));
}

/** Données recharts : une ligne par intervalle, une colonne par série. */
export function lignesDonnees(liste: Intervalle[], series: Serie[]): LigneDonnees[] {
  return liste.map((it, i) => {
    const ligne: LigneDonnees = { intervalle: it.libelle };
    for (const s of series) ligne[s.cle] = s.valeurs[i] ?? 0;
    return ligne;
  });
}

export function total(valeurs: number[]) {
  return Math.round(valeurs.reduce((s, v) => s + v, 0) * 100) / 100;
}

/** Un événement est-il dans la plage ? (filtre commun aux totaux des cartes Stat) */
export function dansLaPlage(date: Evenement["date"], plage: { debut: Date; fin: Date }) {
  const d = dateDe({ date });
  return !!d && d.getTime() >= plage.debut.getTime() && d.getTime() <= plage.fin.getTime();
}
