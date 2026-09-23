import { ACTIONS_JOURNAL, type ActionJournal } from "./journal";

/** Périodes de consultation du journal (passé), distinctes de celles du recouvrement (échéances à venir). */
export const PERIODES_JOURNAL = [
  { value: "", label: "Tout" },
  { value: "jour", label: "Aujourd'hui" },
  { value: "7j", label: "7 derniers jours" },
  { value: "30j", label: "30 derniers jours" },
] as const;

export function debutPeriodeJournal(periode: string | undefined, now = new Date()): Date | null {
  const d = new Date(now);
  switch (periode) {
    case "jour":
      d.setHours(0, 0, 0, 0);
      return d;
    case "7j":
      d.setDate(d.getDate() - 7);
      return d;
    case "30j":
      d.setDate(d.getDate() - 30);
      return d;
    default:
      return null;
  }
}

export function actionJournalValide(a: string | undefined): ActionJournal | null {
  return (ACTIONS_JOURNAL as readonly string[]).includes(a ?? "") ? (a as ActionJournal) : null;
}
