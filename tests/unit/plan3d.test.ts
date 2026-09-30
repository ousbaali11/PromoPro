import { describe, expect, it } from "vitest";
import { chiffrementDisponible, chiffrer, dechiffrer, masquerCle } from "@/lib/plan3d/chiffrement";
import { lireReponseDemarrageMeltflex, lireReponseStatutMeltflex } from "@/lib/plan3d/meltflex";
import { lireReponseDemarrageNeural4d, lireReponseStatutNeural4d } from "@/lib/plan3d/neural4d";
import { ErreurFournisseur, estFournisseur, FOURNISSEURS, libelleFournisseur } from "@/lib/plan3d/provider";
import { fournisseurPlan3d } from "@/lib/plan3d/registre";
import { FENETRE_GENERATION_MS, generationAutorisee } from "@/lib/plan3d/generation";

const env = { SECRETS_ENCRYPTION_KEY: "secret-de-test-0123456789" };

describe("chiffrement des clés d'API", () => {
  it("chiffre et déchiffre, sans jamais stocker la clé en clair, avec un aléa différent à chaque fois", () => {
    const cle = "mf_sk_abcdef0123456789";
    const a = chiffrer(cle, env);
    const b = chiffrer(cle, env);
    expect(a).not.toContain(cle);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(dechiffrer(a, env)).toBe(cle);
    expect(dechiffrer(b, env)).toBe(cle);
  });

  it("refuse une clé de chiffrement absente ou trop courte, un secret altéré ou un autre secret", () => {
    expect(chiffrementDisponible({})).toBe(false);
    expect(chiffrementDisponible({ SECRETS_ENCRYPTION_KEY: "court" })).toBe(false);
    expect(chiffrementDisponible(env)).toBe(true);
    expect(() => chiffrer("x", {})).toThrow(/SECRETS_ENCRYPTION_KEY/);
    const stocke = chiffrer("mf_sk_secret", env);
    const [v, iv, tag, chiffre] = stocke.split(":");
    const altere = [v, iv, tag, chiffre.slice(0, -2) + (chiffre.endsWith("A") ? "BB" : "AA")].join(":");
    expect(() => dechiffrer(altere, env)).toThrow();
    expect(() => dechiffrer(stocke, { SECRETS_ENCRYPTION_KEY: "un-autre-secret-0123456789" })).toThrow();
    expect(() => dechiffrer("n-importe-quoi", env)).toThrow(/format/);
  });

  it("masque la clé comme un numéro de carte : seuls les quatre derniers caractères restent", () => {
    expect(masquerCle("mf_sk_abcdef0123456789")).toBe("••••••••••••6789");
    expect(masquerCle("abcd")).toBe("••••abcd");
    expect(masquerCle("mf_sk_abcdef0123456789")).not.toContain("mf_sk");
  });
});

describe("adaptateur MeltFlex (réponses documentées)", () => {
  it("démarrage : 200 avec modelUrl → prêt ; 202 avec taskId → en cours", () => {
    expect(lireReponseDemarrageMeltflex(200, { success: true, modelUrl: "https://x/m.glb" })).toEqual({ etat: "pret", modelUrl: "https://x/m.glb" });
    expect(lireReponseDemarrageMeltflex(202, { status: "IN_PROGRESS", taskId: "t1" })).toEqual({ etat: "en_cours", reference: "t1" });
  });
  it("démarrage : 401, 402, 429, 502 → erreurs lisibles", () => {
    expect(() => lireReponseDemarrageMeltflex(401, {})).toThrow(/clé d'API/);
    expect(() => lireReponseDemarrageMeltflex(402, {})).toThrow(/crédits/);
    expect(() => lireReponseDemarrageMeltflex(429, {})).toThrow(/trop de demandes/i);
    expect(() => lireReponseDemarrageMeltflex(502, { error: "Conversion Failed" })).toThrow(/Conversion Failed/);
    try {
      lireReponseDemarrageMeltflex(402, {});
    } catch (e) {
      expect(e).toBeInstanceOf(ErreurFournisseur);
      expect((e as ErreurFournisseur).statutHttp).toBe(402);
    }
  });
  it("suivi : PENDING / IN_PROGRESS → en cours avec progression, SUCCEEDED → prêt, FAILED → échec", () => {
    expect(lireReponseStatutMeltflex(200, { status: "IN_PROGRESS", progress: 64 })).toEqual({ etat: "en_cours", progression: 64 });
    expect(lireReponseStatutMeltflex(200, { status: "PENDING" })).toEqual({ etat: "en_cours", progression: undefined });
    expect(lireReponseStatutMeltflex(200, { status: "SUCCEEDED", modelUrl: "https://x/m.glb" })).toEqual({ etat: "pret", modelUrl: "https://x/m.glb" });
    expect(lireReponseStatutMeltflex(200, { status: "FAILED", error: "no walls" })).toEqual({ etat: "echec", message: "MeltFlex : no walls" });
    expect(lireReponseStatutMeltflex(200, { status: "SUCCEEDED" }).etat).toBe("echec");
  });
});

describe("adaptateur Neural4D (réponses documentées)", () => {
  it("démarrage : uuids → en cours ; image modérée → erreur ; 401 / 402 / 429 → erreurs lisibles", () => {
    expect(lireReponseDemarrageNeural4d(200, { uuids: ["u1"], message: "Generating" })).toEqual({ etat: "en_cours", reference: "u1" });
    expect(() => lireReponseDemarrageNeural4d(200, { limitType: 3, message: "Please check the image." })).toThrow(/refusé l'image/);
    expect(() => lireReponseDemarrageNeural4d(401, {})).toThrow(/clé d'API/);
    expect(() => lireReponseDemarrageNeural4d(402, { message: "Insufficient points" })).toThrow(/Insufficient points/);
    expect(() => lireReponseDemarrageNeural4d(429, {})).toThrow(/trop de demandes/i);
    expect(() => lireReponseDemarrageNeural4d(400, { errors: [{ msg: "modelCount must be an integer" }] })).toThrow(/modelCount/);
  });
  it("suivi : codeStatus 1 → en cours, 0 → prêt, -3 → échec, -2 → échec, -1 → clé invalide", () => {
    expect(lireReponseStatutNeural4d(200, { codeStatus: 1 })).toEqual({ etat: "en_cours" });
    expect(lireReponseStatutNeural4d(200, { codeStatus: 0, modelUrl: "https://x/m.glb" })).toEqual({ etat: "pret", modelUrl: "https://x/m.glb" });
    expect(lireReponseStatutNeural4d(200, { codeStatus: -3 }).etat).toBe("echec");
    expect(lireReponseStatutNeural4d(200, { codeStatus: -2 }).etat).toBe("echec");
    expect(() => lireReponseStatutNeural4d(200, { codeStatus: -1 })).toThrow(/clé d'API/);
  });
});

describe("registre et règles de génération", () => {
  it("chaque fournisseur déclaré a un adaptateur du même code et un libellé", () => {
    for (const f of FOURNISSEURS) {
      expect(fournisseurPlan3d(f.code).code).toBe(f.code);
      expect(libelleFournisseur(f.code)).toBe(f.libelle);
      expect(estFournisseur(f.code)).toBe(true);
    }
    expect(estFournisseur("AUTRE")).toBe(false);
  });
  it("au plus une génération automatique par bien et par 24 h", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    expect(generationAutorisee(null, now)).toBe(true);
    expect(generationAutorisee(new Date(now.getTime() - FENETRE_GENERATION_MS + 1), now)).toBe(false);
    expect(generationAutorisee(new Date(now.getTime() - FENETRE_GENERATION_MS), now)).toBe(true);
    expect(generationAutorisee(now.getTime() - 60_000, now)).toBe(false);
  });
});
