import { gemini } from "./gemini";
import { neural4d } from "./neural4d";
import { promopro } from "./promopro";
import type { Fournisseur, FournisseurPlan3d } from "./provider";

/** Registre des adaptateurs : un nouveau fournisseur s'ajoute ici et dans FOURNISSEURS (provider.ts). */
const REGISTRE: Record<Fournisseur, FournisseurPlan3d> = {
  GEMINI: gemini,
  NEURAL4D: neural4d,
  PROMOPRO: promopro,
};

export function fournisseurPlan3d(code: Fournisseur): FournisseurPlan3d {
  return REGISTRE[code];
}
