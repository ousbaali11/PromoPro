import { describe, expect, it } from "vitest";
import { numeroRecuFraisDossier } from "@/lib/pdf/recu-frais-dossier";
import { FRAIS_DOSSIER_STATUT, STATUTS_FRAIS_DOSSIER } from "@/lib/frais-dossier-regles";
import { CIBLE_LABELS } from "@/lib/journal";

describe("frais de dossier : règles pures", () => {
  it("le numéro de reçu est lisible, distinct des reçus de tranche, et daté de la validation", () => {
    const numero = numeroRecuFraisDossier({ id: "a1b2c3d4-0000-0000-0000-000000000000", validatedAt: new Date("2026-10-03T10:00:00Z"), createdAt: new Date("2025-01-01") });
    expect(numero).toBe("FRAIS-2026-A1B2C3D4");
    expect(numeroRecuFraisDossier({ id: "ffffffff-1", createdAt: new Date("2025-06-01") })).toBe("FRAIS-2025-FFFFFFFF");
    expect(numero).not.toMatch(/^RECU-/);
  });

  it("les statuts suivent le modèle du syndic (à payer → en attente de validation → payé), chacun avec un libellé et un ton", () => {
    expect(STATUTS_FRAIS_DOSSIER).toEqual(["A_PAYER", "EN_ATTENTE_VALIDATION", "PAYE"]);
    for (const s of STATUTS_FRAIS_DOSSIER) {
      expect(FRAIS_DOSSIER_STATUT[s].label.length).toBeGreaterThan(0);
      expect(["warning", "info", "success"]).toContain(FRAIS_DOSSIER_STATUT[s].tone);
    }
    expect(FRAIS_DOSSIER_STATUT.PAYE.label).toBe("Payé");
  });

  it("le journal d'activité connaît la cible « frais-dossier »", () => {
    expect(CIBLE_LABELS["frais-dossier"]).toBe("Frais de dossier");
  });
});
