import { describe, expect, it } from "vitest";
import { criteresValides, nettoyerCriteres, pieceCanonique, projeterResultat, rechercherClients, type ClientRecherchable } from "@/lib/recherche-clients";
import { peutConsulterDossierClient } from "@/lib/comptes";

const clients: ClientRecherchable[] = [
  { id: "c1", nom: "Naciri", prenom: "Hamid", dateNaissance: "1985-03-12", pieceType: "CIN", pieceNumero: "BE123456", commercialId: "com1", telephone1: "+212 6 00 11 22 33", email: "hamid@exemple.ma", identifiant: "CL-DEMO" },
  { id: "c2", nom: "Naciri", prenom: "Hamid", dateNaissance: "1985-03-12", pieceType: "CIN", pieceNumero: "be 123-456", commercialId: "com2", telephone1: "06 77 00 00 07", email: "h2@exemple.ma", identifiant: "CL-X" },
  { id: "c3", nom: "Zerouali", prenom: "Karim", dateNaissance: null, pieceType: "PASSEPORT", pieceNumero: "ZX9988", commercialId: "com2" },
  { id: "c4", nom: "Nacîri", prenom: "Salma", dateNaissance: "1990-01-01", pieceType: "CIN", pieceNumero: null, commercialId: null },
  { id: "c5", nom: "Naciri", prenom: "Hamid", dateNaissance: "1985-03-12", pieceType: "CIN", pieceNumero: "BE123456", commercialId: "com1", deletedAt: new Date() },
];

describe("recherche de clients inter-commerciaux : critères et correspondance", () => {
  it("nettoie les critères venus de l'URL et refuse une recherche sans critère exploitable", () => {
    expect(nettoyerCriteres({ nom: "  Naciri ", prenom: "", dateNaissance: "1985-03-12", piece: " " })).toEqual({ nom: "Naciri", dateNaissance: "1985-03-12" });
    expect(nettoyerCriteres({ dateNaissance: "12/03/1985" })).toEqual({});
    expect(criteresValides({})).toBe(false);
    // Contre l'énumération du fichier : trois lettres au moins pour un nom ou un prénom, cinq caractères pour une pièce
    expect(criteresValides({ nom: "N" })).toBe(false);
    expect(criteresValides({ nom: "Na" })).toBe(false);
    expect(criteresValides({ nom: "Nac" })).toBe(true);
    expect(criteresValides({ prenom: "Ha" })).toBe(false);
    expect(criteresValides({ prenom: "Ham" })).toBe(true);
    expect(criteresValides({ piece: "BE" })).toBe(false);
    expect(criteresValides({ piece: "BE12" })).toBe(false);
    expect(criteresValides({ piece: "BE123" })).toBe(true);
    expect(criteresValides({ dateNaissance: "1985-03-12" })).toBe(true);
    // Un critère court n'est pas non plus un filtre accessoire : « Na » + date = la date seule
    expect(rechercherClients(clients, { nom: "Na", dateNaissance: "1985-03-12" }).map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(pieceCanonique(" be 123-456 ")).toBe("BE123456");
  });

  it("trouve par nom (sans accent ni casse), prénom, date de naissance exacte ou pièce (espaces et tirets ignorés, début accepté), en excluant les comptes supprimés", () => {
    expect(rechercherClients(clients, { nom: "naciri" }).map((c) => c.id)).toEqual(["c1", "c2", "c4"]);
    expect(rechercherClients(clients, { nom: "NACÎRI", prenom: "hamid" }).map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(rechercherClients(clients, { dateNaissance: "1985-03-12" }).map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(rechercherClients(clients, { dateNaissance: "1985-03-13" })).toEqual([]);
    expect(rechercherClients(clients, { piece: "be-123456" }).map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(rechercherClients(clients, { piece: "ZX" })).toEqual([]);
    expect(rechercherClients(clients, { piece: "ZX998" }).map((c) => c.id)).toEqual(["c3"]);
    expect(rechercherClients(clients, { nom: "naciri", piece: "ZX9988" })).toEqual([]);
    expect(rechercherClients(clients, {})).toEqual([]);
  });
});

describe("recherche de clients inter-commerciaux : confidentialité de la projection", () => {
  it("pour le client d'un autre commercial, seuls nom, prénom, date de naissance, pièce et commercial sont transmis — ni téléphone, ni e-mail, ni identifiant, ni lien", () => {
    const session = { role: "COMMERCIAL", userId: "com1" };
    const autre = projeterResultat(clients[1], { consultable: peutConsulterDossierClient(session, clients[1]), commercial: "Imane Tazi" });
    expect(autre).toEqual({ detail: "limite", id: "c2", nom: "Naciri", prenom: "Hamid", dateNaissance: "1985-03-12", piece: "CIN be 123-456", commercial: "Imane Tazi" });
    expect(Object.keys(autre)).not.toContain("telephone");
    expect(Object.keys(autre)).not.toContain("email");
    expect(Object.keys(autre)).not.toContain("identifiant");
    expect(Object.keys(autre)).not.toContain("href");
    expect(JSON.stringify(autre)).not.toMatch(/06 77|exemple\.ma|CL-X/);
  });

  it("pour son propre client, la projection est complète avec le lien vers le dossier ; le Responsable Commercial consulte tout le pôle", () => {
    const mien = projeterResultat(clients[0], { consultable: peutConsulterDossierClient({ role: "COMMERCIAL", userId: "com1" }, clients[0]), commercial: "Youssef Idrissi" });
    expect(mien.detail).toBe("complet");
    if (mien.detail === "complet") {
      expect(mien.href).toBe("/dashboard/clients/c1");
      expect(mien.telephone).toBe("+212 6 00 11 22 33");
      expect(mien.email).toBe("hamid@exemple.ma");
      expect(mien.piece).toBe("CIN BE123456");
    }
    const vuParResponsable = projeterResultat(clients[1], { consultable: peutConsulterDossierClient({ role: "RESPONSABLE_COMMERCIAL", userId: "rc" }, clients[1]), commercial: "Imane Tazi" });
    expect(vuParResponsable.detail).toBe("complet");
    const passeport = projeterResultat(clients[2], { consultable: false, commercial: null });
    expect(passeport.piece).toBe("Passeport ZX9988");
    expect(passeport.commercial).toBeNull();
  });
});
