/*
 * Trésorerie prévisionnelle (Directeur Financier) : projection à 30 / 60 / 90
 * jours des échéances de paiement déjà connues (non soldées, datées) des
 * ventes en cours, empilées par projet. Projection THÉORIQUE : chaque
 * échéance est comptée à sa date prévue, comme si tout était payé à temps ;
 * les retards réels ne sont pas anticipés. Fonctions pures, testées.
 */

export type EcheanceProjetable = {
  id: string;
  montant: number;
  montantPaye: number;
  statut: string;
  dateEcheance: Date | number | string;
  /** Clé et libellé du segment empilé (le projet du bien). */
  segmentCle: string;
  segmentLibelle: string;
};

export type SegmentProjection = { cle: string; libelle: string; montant: number };

export type FenetreProjection = {
  /** « 0–30 j », « 31–60 j », « 61–90 j » */
  libelle: string;
  debut: Date;
  fin: Date;
  total: number;
  segments: SegmentProjection[];
  nombre: number;
};

export type Projection = {
  fenetres: FenetreProjection[];
  total: number;
  /** Échéances déjà dépassées et non soldées (hors projection, signalées à part). */
  enRetard: { nombre: number; montant: number };
  /** Échéances non soldées au-delà de 90 jours (hors projection). */
  auDela: { nombre: number; montant: number };
  segments: { cle: string; libelle: string; montant: number }[];
};

export const FENETRES_JOURS = [30, 60, 90] as const;

/** Décalage en jours calendaires (et non en millisecondes : un changement d'heure ne doit pas décaler une fenêtre). */
function plusJours(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function debutDeJournee(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function finDeJournee(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Reste à percevoir sur une échéance (jamais négatif). */
export function restantDu(e: { montant: number; montantPaye: number; statut: string }): number {
  if (e.statut === "PAYEE") return 0;
  return Math.max(0, Math.round(e.montant - e.montantPaye));
}

/**
 * Répartit les échéances non soldées : en retard (date < aujourd'hui), dans
 * l'une des trois fenêtres de 30 jours (aujourd'hui inclus dans la première),
 * ou au-delà de 90 jours. Les segments de chaque fenêtre sont triés par
 * montant décroissant ; la liste globale des segments sert de légende.
 */
export function projeterEcheances(echeances: EcheanceProjetable[], now = new Date()): Projection {
  const aujourdhui = debutDeJournee(now);
  const fenetres: FenetreProjection[] = FENETRES_JOURS.map((jours, i) => {
    const debutJour = i === 0 ? 0 : FENETRES_JOURS[i - 1] + 1;
    return {
      libelle: `${debutJour}–${jours} j`,
      debut: plusJours(aujourdhui, debutJour),
      fin: finDeJournee(plusJours(aujourdhui, jours)),
      total: 0,
      segments: [],
      nombre: 0,
    };
  });
  const enRetard = { nombre: 0, montant: 0 };
  const auDela = { nombre: 0, montant: 0 };
  const parSegment = new Map<string, SegmentProjection>();

  for (const e of echeances) {
    const restant = restantDu(e);
    if (restant <= 0) continue;
    const date = new Date(e.dateEcheance);
    if (Number.isNaN(date.getTime())) continue;
    if (date.getTime() < aujourdhui.getTime()) {
      enRetard.nombre++;
      enRetard.montant += restant;
      continue;
    }
    const fenetre = fenetres.find((f) => date.getTime() <= f.fin.getTime());
    if (!fenetre) {
      auDela.nombre++;
      auDela.montant += restant;
      continue;
    }
    fenetre.total += restant;
    fenetre.nombre++;
    const seg = fenetre.segments.find((s) => s.cle === e.segmentCle);
    if (seg) seg.montant += restant;
    else fenetre.segments.push({ cle: e.segmentCle, libelle: e.segmentLibelle, montant: restant });
    const global = parSegment.get(e.segmentCle) ?? { cle: e.segmentCle, libelle: e.segmentLibelle, montant: 0 };
    global.montant += restant;
    parSegment.set(e.segmentCle, global);
  }
  for (const f of fenetres) f.segments.sort((a, b) => b.montant - a.montant || a.libelle.localeCompare(b.libelle, "fr"));
  const segments = [...parSegment.values()].sort((a, b) => b.montant - a.montant || a.libelle.localeCompare(b.libelle, "fr"));
  return { fenetres, total: fenetres.reduce((s, f) => s + f.total, 0), enRetard, auDela, segments };
}
