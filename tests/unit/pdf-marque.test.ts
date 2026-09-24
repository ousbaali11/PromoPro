import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { genererContratPdf } from "@/lib/pdf/contrat";
import { genererRecuPdf } from "@/lib/pdf/recu";
import { genererAutorisationVisitePdf } from "@/lib/pdf/autorisation-visite";
import { saveUpload } from "@/lib/storage";
import type { biens, clients, echeances, paiements, projets, promoteurs, visites } from "@/db/schema";
import { metadonneesDuPdf, nombreImagesDuPdf, texteDuPdf } from "../pdf-texte";

/*
 * Chaque document généré porte le nom du promoteur (en-tête, pied de page,
 * champ « Promoteur », métadonnées) et jamais celui de la plateforme. Objets
 * de test minimaux, sans base de données ; le logo passe par un UPLOAD_DIR
 * temporaire.
 */
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const maintenant = new Date("2026-09-24T10:00:00Z");

const promoteur = {
  id: "promo-atlas",
  nom: "Résidences Atlas",
  contactEmail: "contact@residences-atlas.ma",
  contactTelephone: "+212 5 22 00 00 00",
  logoUrl: null,
  statut: "ACTIF",
  abonnementFormule: "Annuel",
  abonnementDebut: maintenant,
  abonnementFin: maintenant,
  createdAt: maintenant,
} satisfies typeof promoteurs.$inferSelect;

const projet = { id: "projet-1", promoteurId: promoteur.id, nom: "Les Jardins d'Anfa", nomCompte: "SCI Atlas", iban: "MA64 0115 1900 0001 2050 0053 4921" } as unknown as typeof projets.$inferSelect;
const bien = { id: "bien-a01-0000", projetId: projet.id, designation: "Appartement A01", nature: "Appartement", prix: 850000, surface: 92, statut: "VENDU", clientId: "client-1", commercialId: "com-1" } as unknown as typeof biens.$inferSelect;
const client = { id: "client-1", promoteurId: promoteur.id, nom: "Naciri", prenom: "Hamid", pieceType: "CIN", pieceNumero: "AB123456", telephone1: "06 12 34 56 78", email: "hamid@exemple.ma", adresse: "12 rue des Orangers, Casablanca", dateNaissance: null, lieuNaissance: null, telephone2: null } as unknown as typeof clients.$inferSelect;
const echeancier = [
  { id: "e1", propositionId: "p1", numero: 1, pourcentage: 40, montant: 340000, montantPaye: 340000, statut: "PAYEE", dateEcheance: maintenant },
  { id: "e2", propositionId: "p1", numero: 2, pourcentage: 20, montant: 170000, montantPaye: 0, statut: "EN_ATTENTE", dateEcheance: maintenant },
] as unknown as (typeof echeances.$inferSelect)[];
const paiement = { id: "paie-0001", bienId: bien.id, clientId: client.id, echeanceId: "e1", montant: 340000, montantExact: 340000, devise: "MAD", natureOperation: "virement local", banque: "BMCE", dateOperation: maintenant, dateReception: maintenant, porteur: "Hamid Naciri", reference: "VIR-001", statut: "VALIDE", createdAt: maintenant } as unknown as typeof paiements.$inferSelect;
const visite = { id: "visite-01", bienId: bien.id, clientId: client.id, statut: "PLANIFIEE", dateVisite: maintenant, decidedAt: maintenant, createdAt: maintenant } as unknown as typeof visites.$inferSelect;

async function lesTroisDocuments(p: typeof promoteurs.$inferSelect) {
  return {
    contrat: await genererContratPdf(bien, client, echeancier, { projet, promoteur: p, paiements: [paiement], reference: "REF00001" }),
    recu: await genererRecuPdf(paiement, bien, client, { projet, promoteur: p, echeance: echeancier[0], validePar: "Leila Comptable" }),
    autorisation: await genererAutorisationVisitePdf(visite, bien, client, { projet, promoteur: p, savNom: "Rachid SAV" }),
  };
}

describe("PDF : le nom du promoteur, jamais celui de la plateforme", () => {
  it("contrat, reçu et autorisation de visite : nom du promoteur en en-tête, pied de page et métadonnées ; aucun « PromoPro »", async () => {
    const docs = await lesTroisDocuments(promoteur);
    for (const [nom, bytes] of Object.entries(docs)) {
      const texte = await texteDuPdf(bytes);
      expect(texte, nom).toContain("Résidences Atlas");
      expect(texte, nom).toContain("contact@residences-atlas.ma");
      expect(texte, nom).toMatch(/Résidences Atlas · document généré automatiquement/);
      expect(texte, nom).not.toMatch(/PromoPro/i);
      expect(Buffer.from(bytes).toString("latin1"), nom).not.toMatch(/PromoPro/i); // ni dans les métadonnées ni ailleurs
      const meta = await metadonneesDuPdf(bytes);
      expect(meta.auteur, nom).toBe("Résidences Atlas");
      expect(meta.createur, nom).toBe("Résidences Atlas");
      expect(nombreImagesDuPdf(bytes), nom).toBe(0);
    }
    expect(await texteDuPdf(docs.contrat)).toContain("Le vendeur : Résidences Atlas"); // section « Identité des parties » fusionnée
  });

  it("un promoteur nommé « PromoPro » ne prouve rien : le nom vient bien de l'objet promoteur", async () => {
    const autre = { ...promoteur, nom: "Immobilière du Sud", contactEmail: null, contactTelephone: null };
    const texte = await texteDuPdf(await genererRecuPdf(paiement, bien, client, { projet, promoteur: autre }));
    expect(texte).toContain("Immobilière du Sud");
    expect(texte).not.toContain("Résidences Atlas");
    expect(texte).not.toContain("residences-atlas");
  });

  describe("logo du promoteur", () => {
    let tmp = "";
    beforeAll(async () => {
      tmp = await fs.mkdtemp(path.join(os.tmpdir(), "promopro-logo-"));
      process.env.UPLOAD_DIR = tmp;
    });
    afterAll(async () => {
      delete process.env.UPLOAD_DIR;
      await fs.rm(tmp, { recursive: true, force: true });
    });

    it("logo déposé : embarqué en en-tête de chaque document, le nom reste présent", async () => {
      const logoUrl = await saveUpload("logos", "logo.png", PNG_1x1);
      const docs = await lesTroisDocuments({ ...promoteur, logoUrl });
      for (const [nom, bytes] of Object.entries(docs)) {
        expect(nombreImagesDuPdf(bytes), nom).toBeGreaterThanOrEqual(1);
        expect(await texteDuPdf(bytes), nom).toContain("Résidences Atlas");
      }
    });

    it("logo illisible (fichier tronqué) ou absent du disque : document généré sans image, sans erreur", async () => {
      const tronque = await saveUpload("logos", "casse.png", Buffer.concat([PNG_1x1.subarray(0, 12), Buffer.alloc(4)]));
      const avecTronque = await genererRecuPdf(paiement, bien, client, { projet, promoteur: { ...promoteur, logoUrl: tronque } });
      expect(nombreImagesDuPdf(avecTronque)).toBe(0);
      expect(await texteDuPdf(avecTronque)).toContain("Résidences Atlas");
      const disparu = await genererRecuPdf(paiement, bien, client, { projet, promoteur: { ...promoteur, logoUrl: "/api/files/logos/0f1e2d3c-4b5a-4697-8877-66554433aabb.png" } });
      expect(nombreImagesDuPdf(disparu)).toBe(0);
    });
  });
});
