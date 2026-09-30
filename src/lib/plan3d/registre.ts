import { meltflex } from "./meltflex";
import { neural4d } from "./neural4d";
import type { Fournisseur, FournisseurPlan3d } from "./provider";

/** Registre des adaptateurs : un nouveau fournisseur s'ajoute ici et dans FOURNISSEURS (provider.ts). */
const REGISTRE: Record<Fournisseur, FournisseurPlan3d> = {
  MELTFLEX: meltflex,
  NEURAL4D: neural4d,
};

export function fournisseurPlan3d(code: Fournisseur): FournisseurPlan3d {
  return REGISTRE[code];
}
