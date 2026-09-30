import type { Tone } from "@/components/ui/Primitives";

/** Libellés et tonalités du statut d'abonnement d'un promoteur (liste et fiche). */
export const LABELS_STATUT_PROMOTEUR: Record<string, string> = { EN_ATTENTE: "En attente", ACTIF: "Actif", SUSPENDU: "Suspendu" };
export const TONES_STATUT_PROMOTEUR: Record<string, Tone> = { EN_ATTENTE: "warning", ACTIF: "success", SUSPENDU: "danger" };
