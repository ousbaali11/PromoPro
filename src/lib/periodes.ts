/**
 * Périodes de filtrage du Recouvrement (section 13.2). Toutes les bornes sont
 * calculées en heure locale du serveur, début de journée inclus / fin de
 * journée incluse.
 */

export const PERIODES = [
  { value: "aujourdhui", label: "Aujourd'hui" },
  { value: "demain", label: "Demain" },
  { value: "semaine", label: "Cette semaine" },
  { value: "semaine-prochaine", label: "Semaine prochaine" },
  { value: "mois", label: "Ce mois" },
  { value: "mois-prochain", label: "Mois prochain" },
  { value: "perso", label: "Période personnalisée" },
] as const;
export type Periode = (typeof PERIODES)[number]["value"];

function debutJour(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function finJour(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function plusJours(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** Lundi de la semaine contenant d. */
function lundi(d: Date) {
  const x = debutJour(d);
  const jour = (x.getDay() + 6) % 7; // lundi = 0
  return plusJours(x, -jour);
}

export function bornesPeriode(
  periode: string | undefined,
  du?: string,
  au?: string,
  now = new Date(),
): { debut: Date; fin: Date; label: string } | null {
  switch (periode) {
    case "aujourdhui":
      return { debut: debutJour(now), fin: finJour(now), label: "Aujourd'hui" };
    case "demain": {
      const d = plusJours(now, 1);
      return { debut: debutJour(d), fin: finJour(d), label: "Demain" };
    }
    case "semaine": {
      const l = lundi(now);
      return { debut: l, fin: finJour(plusJours(l, 6)), label: "Cette semaine" };
    }
    case "semaine-prochaine": {
      const l = plusJours(lundi(now), 7);
      return { debut: l, fin: finJour(plusJours(l, 6)), label: "Semaine prochaine" };
    }
    case "mois": {
      const debut = new Date(now.getFullYear(), now.getMonth(), 1);
      const fin = finJour(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { debut, fin, label: "Ce mois" };
    }
    case "mois-prochain": {
      const debut = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const fin = finJour(new Date(now.getFullYear(), now.getMonth() + 2, 0));
      return { debut, fin, label: "Mois prochain" };
    }
    case "perso": {
      const d = du ? new Date(du) : null;
      const a = au ? new Date(au) : null;
      if (!d || Number.isNaN(d.getTime()) || !a || Number.isNaN(a.getTime())) return null;
      return { debut: debutJour(d), fin: finJour(a), label: `Du ${du} au ${au}` };
    }
    default:
      return null;
  }
}
