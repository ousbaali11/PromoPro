import { describe, expect, it } from "vitest";
import {
  peutConsulterDossierClient,
  ROLES_GERABLES_PAR,
  aUneVenteEnCours,
  etatCompte,
  peutGererClient,
  peutGererCompteInterne,
  peutModifierClient,
} from "@/lib/comptes";
import { ROLES_RECRUTABLES_PAR } from "@/lib/roles";
import { decrireChangements } from "@/lib/journal";
import { debutPeriodeJournal, actionJournalValide } from "@/lib/journal-filtres";

describe("Gestion des comptes : qui peut suspendre / supprimer qui", () => {
  it("reprend exactement la hiérarchie de création pour les directeurs", () => {
    expect(ROLES_GERABLES_PAR.DIRECTEUR_COMMERCIAL).toEqual(ROLES_RECRUTABLES_PAR.DIRECTEUR_COMMERCIAL);
    expect(ROLES_GERABLES_PAR.DIRECTEUR_FINANCIER).toEqual(ROLES_RECRUTABLES_PAR.DIRECTEUR_FINANCIER);
  });

  it("le Super Admin gère les trois directions, et rien d'autre", () => {
    expect(ROLES_GERABLES_PAR.SUPER_ADMIN).toEqual(["PDG", "DIRECTEUR_COMMERCIAL", "DIRECTEUR_FINANCIER"]);
    expect(peutGererCompteInterne("SUPER_ADMIN", "PDG")).toBe(true);
    expect(peutGererCompteInterne("SUPER_ADMIN", "COMMERCIAL")).toBe(false);
  });

  it("un directeur gère son pôle, pas l'autre ; le PDG et un commercial ne gèrent aucun compte interne", () => {
    expect(peutGererCompteInterne("DIRECTEUR_COMMERCIAL", "SERVICE_APRES_VENTE")).toBe(true);
    expect(peutGererCompteInterne("DIRECTEUR_COMMERCIAL", "COMPTABLE_INTERNE")).toBe(false);
    expect(peutGererCompteInterne("DIRECTEUR_FINANCIER", "RECOUVREMENT")).toBe(true);
    expect(peutGererCompteInterne("DIRECTEUR_FINANCIER", "COMMERCIAL")).toBe(false);
    expect(peutGererCompteInterne("PDG", "COMMERCIAL")).toBe(false);
    expect(peutGererCompteInterne("COMMERCIAL", "COMMERCIAL")).toBe(false);
  });

  it("un commercial ne gère que ses propres clients ; la direction commerciale, tous", () => {
    const moi = { role: "COMMERCIAL", userId: "u1" };
    expect(peutGererClient(moi, { commercialId: "u1" })).toBe(true);
    expect(peutGererClient(moi, { commercialId: "u2" })).toBe(false);
    expect(peutGererClient({ role: "DIRECTEUR_COMMERCIAL", userId: "d" }, { commercialId: "u2" })).toBe(true);
    expect(peutGererClient({ role: "RESPONSABLE_COMMERCIAL", userId: "r" }, { commercialId: null })).toBe(true);
    expect(peutGererClient({ role: "COMPTABLE_INTERNE", userId: "c" }, { commercialId: "c" })).toBe(false);
  });

  it("la modification d'un client est ouverte au commercial gérant et à tout le pôle commercial", () => {
    expect(peutModifierClient({ role: "ASSISTANT_ADMINISTRATIF", userId: "a" }, { commercialId: "u1" })).toBe(true);
    expect(peutModifierClient({ role: "COMMERCIAL", userId: "u2" }, { commercialId: "u1" })).toBe(false);
    expect(peutModifierClient({ role: "RECOUVREMENT", userId: "r" }, { commercialId: "u1" })).toBe(false);
  });
});

describe("État d'un compte et vente en cours", () => {
  it("supprimé prime sur suspendu", () => {
    expect(etatCompte({ actif: true, deletedAt: null })).toBe("actif");
    expect(etatCompte({ actif: false, deletedAt: null })).toBe("suspendu");
    expect(etatCompte({ actif: false, deletedAt: new Date() })).toBe("supprime");
    expect(etatCompte({ actif: true, deletedAt: 1_700_000_000_000 })).toBe("supprime");
  });

  it("une vente en cours = bien vendu ou en proposition, ou proposition ouverte", () => {
    expect(aUneVenteEnCours([{ statut: "VENDU" }], [])).toBe(true);
    expect(aUneVenteEnCours([{ statut: "PROPOSITION_EN_COURS" }], [])).toBe(true);
    expect(aUneVenteEnCours([], [{ statut: "ENVOYEE" }])).toBe(true);
    expect(aUneVenteEnCours([], [{ statut: "NEGOCIEE" }])).toBe(true);
    expect(aUneVenteEnCours([{ statut: "LIVRE" }], [{ statut: "ACCEPTEE" }, { statut: "REFUSEE" }, { statut: "DESISTEE" }])).toBe(false);
    expect(aUneVenteEnCours([], [])).toBe(false);
  });
});

describe("Journal d'activité", () => {
  it("décrit les champs modifiés, ignore les champs identiques et non libellés", () => {
    const avant: Record<string, unknown> = { nom: "Naciri", prenom: "Hamid", telephone2: null, passwordHash: "x", prix: 850000 };
    const apres: Record<string, unknown> = { nom: "Naciri", prenom: "Hamid", telephone2: "+212 6 00 00 00 00", passwordHash: "y", prix: 870000 };
    // Les nombres sont formatés en français (espace fine insécable) : on normalise les espaces pour comparer
    const texte = decrireChangements(avant, apres, { nom: "Nom", prenom: "Prénom", telephone2: "Téléphone 2", prix: "Prix" });
    expect(texte?.replace(/\s/g, " ")).toBe("Téléphone 2 : — → +212 6 00 00 00 00 · Prix : 850 000 → 870 000");
  });

  it("retourne null quand rien ne change", () => {
    expect(decrireChangements({ nom: "A" }, { nom: "A" }, { nom: "Nom" })).toBeNull();
    expect(decrireChangements({ nom: "A" }, {}, { nom: "Nom" })).toBeNull();
  });

  it("filtres : période passée et type d'action validé", () => {
    const now = new Date(2026, 8, 23, 15, 30);
    expect(debutPeriodeJournal("jour", now)).toEqual(new Date(2026, 8, 23, 0, 0, 0, 0));
    expect(debutPeriodeJournal("7j", now)).toEqual(new Date(2026, 8, 16, 15, 30));
    expect(debutPeriodeJournal("30j", now)).toEqual(new Date(2026, 7, 24, 15, 30));
    expect(debutPeriodeJournal("", now)).toBeNull();
    expect(actionJournalValide("SUPPRESSION")).toBe("SUPPRESSION");
    expect(actionJournalValide("n-importe-quoi")).toBeNull();
    expect(actionJournalValide(undefined)).toBeNull();
  });
});

describe("consultation du dossier d'un client par le pôle commercial", () => {
  const client = { commercialId: "com1" };
  it("un Commercial voit ses clients suivis, ou ceux à qui il a vendu un bien", () => {
    expect(peutConsulterDossierClient({ role: "COMMERCIAL", userId: "com1" }, client)).toBe(true);
    expect(peutConsulterDossierClient({ role: "COMMERCIAL", userId: "com2" }, client)).toBe(false);
    expect(peutConsulterDossierClient({ role: "COMMERCIAL", userId: "com2" }, client, ["com2", null])).toBe(true);
  });
  it("le Responsable Commercial voit tout le pôle, les autres rôles ne sont pas restreints ici", () => {
    expect(peutConsulterDossierClient({ role: "RESPONSABLE_COMMERCIAL", userId: "rc" }, client)).toBe(true);
    expect(peutConsulterDossierClient({ role: "RESPONSABLE_ADMINISTRATIF", userId: "ra" }, client)).toBe(true);
    expect(peutConsulterDossierClient({ role: "COMPTABLE_INTERNE", userId: "ci" }, { commercialId: null })).toBe(true);
  });
});
