/**
 * Créneaux de visite (section 11.7) : du lundi au vendredi 8h00–12h00 et
 * 14h00–18h00, le samedi 8h00–12h00. Validé côté serveur, l'UI ne fait que
 * proposer des horaires.
 */

export const HEURES_SEMAINE = [
  ["08:00", "12:00"],
  ["14:00", "18:00"],
] as const;
export const HEURES_SAMEDI = [["08:00", "12:00"]] as const;

function minutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Vrai si la date/heure locale tombe dans un créneau autorisé. */
export function estCreneauValide(date: Date) {
  const jour = date.getDay(); // 0 = dimanche
  if (jour === 0) return false;
  const plages = jour === 6 ? HEURES_SAMEDI : HEURES_SEMAINE;
  const t = date.getHours() * 60 + date.getMinutes();
  // Une visite dure 30 min : le début doit laisser la fin dans la plage.
  return plages.some(([debut, fin]) => t >= minutes(debut) && t + 30 <= minutes(fin));
}

/** Liste des heures de début proposables (pas de 30 min) pour un jour donné. */
export function heuresProposables(jour: number): string[] {
  if (jour === 0) return [];
  const plages = jour === 6 ? HEURES_SAMEDI : HEURES_SEMAINE;
  const out: string[] = [];
  for (const [debut, fin] of plages) {
    for (let t = minutes(debut); t + 30 <= minutes(fin); t += 30) {
      out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
    }
  }
  return out;
}

export const CRENEAUX_LIBELLE = "Lundi–vendredi 8h–12h et 14h–18h, samedi 8h–12h";

export const SERVICES = [
  { value: "COMMERCIAL", label: "Service commercial", description: "Votre commercial" },
  { value: "SAV", label: "Service après-vente", description: "Livraison, visites, photos, syndic" },
  { value: "ADMINISTRATIF", label: "Service administratif", description: "Responsable Administratif : contrats, désistements" },
  { value: "RECOUVREMENT", label: "Service recouvrement", description: "Suivi de vos échéances" },
] as const;
export type Service = (typeof SERVICES)[number]["value"];

export const SERVICE_LABEL: Record<string, string> = Object.fromEntries(SERVICES.map((s) => [s.value, s.label]));

/** Rôle(s) interne(s) correspondant à un service. */
export const SERVICE_ROLES: Record<Service, string[]> = {
  COMMERCIAL: ["COMMERCIAL", "RESPONSABLE_COMMERCIAL"],
  SAV: ["SERVICE_APRES_VENTE"],
  ADMINISTRATIF: ["RESPONSABLE_ADMINISTRATIF"],
  RECOUVREMENT: ["RECOUVREMENT"],
};
