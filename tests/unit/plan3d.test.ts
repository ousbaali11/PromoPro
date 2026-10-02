import { describe, expect, it } from "vitest";
import { chiffrementDisponible, chiffrer, dechiffrer, masquerCle } from "@/lib/plan3d/chiffrement";
import { lireReponseGemini, modeleGemini, modeleSuggere, PROMPT_GEMINI } from "@/lib/plan3d/gemini";
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

describe("adaptateur Gemini (réponses documentées)", () => {
  const enveloppe = (texte: string) => ({ candidates: [{ content: { parts: [{ text: texte }] } }] });

  it("200 avec le JSON attendu → pièces nommées, portes orientées, dimensions plausibles", () => {
    const lecture = lireReponseGemini(
      200,
      enveloppe(
        JSON.stringify({
          pieces: [
            { nom: "Salon", x: 0.1, y: 0.1, largeur: 0.4, hauteur: 0.3 },
            { nom: "", x: 0.5, y: 0.1, largeur: 0.4, hauteur: 0.3 },
            { nom: "Hors image", x: 0.9, y: 0.9, largeur: 0.5, hauteur: 0.5 },
            { nom: "Sans dimension", x: 0.1, y: 0.5 },
          ],
          portes: [{ x: 0.5, y: 0.25, mur: "vertical", relie: ["Salon", "Pièce 2"] }, { x: 0.3, y: 0.4, mur: "autre" }, { x: 2, y: 0 }],
          dimensions_m: { largeur: 16.4, hauteur: 12.4 },
          remarques: "ok",
        }),
      ),
    );
    expect(lecture.pieces.map((p) => p.nom)).toEqual(["Salon", "Pièce 2"]);
    expect(lecture.portes).toEqual([
      { x: 0.5, y: 0.25, mur: "vertical" },
      { x: 0.3, y: 0.4, mur: "horizontal" },
    ]);
    expect(lecture.dimensionsM).toEqual({ largeur: 16.4, hauteur: 12.4 });
    expect(lecture.remarques).toBe("ok");
  });

  it("dimensions absurdes ignorées, JSON entouré de markdown accepté, aucune pièce → liste vide (l'adaptateur signale alors l'échec)", () => {
    const lecture = lireReponseGemini(200, enveloppe("```json\n" + JSON.stringify({ pieces: [], portes: [], dimensions_m: { largeur: 500, hauteur: 1 } }) + "\n```"));
    expect(lecture.pieces).toEqual([]);
    expect(lecture.dimensionsM).toBeUndefined();
  });

  it("400 « API key not valid » et 403 → clé refusée ; 429 → trop de demandes ; 503 → message lisible ; réponse vide ou non JSON → erreur", () => {
    expect(() => lireReponseGemini(400, { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } })).toThrow(/clé d'API/);
    expect(() => lireReponseGemini(403, { error: { message: "PERMISSION_DENIED" } })).toThrow(/clé d'API/);
    try {
      lireReponseGemini(400, { error: { message: "API key not valid" } });
    } catch (e) {
      expect(e).toBeInstanceOf(ErreurFournisseur);
      expect((e as ErreurFournisseur).statutHttp).toBe(401);
    }
    expect(() => lireReponseGemini(429, { error: { message: "quota" } })).toThrow(/trop de demandes/i);
    expect(() => lireReponseGemini(503, { error: { message: "The model is overloaded." } })).toThrow(/overloaded/);
    expect(() => lireReponseGemini(200, {})).toThrow(/sans contenu/);
    expect(() => lireReponseGemini(200, enveloppe("pas du json"))).toThrow(/JSON/);
    expect(() => lireReponseGemini(200, { promptFeedback: { blockReason: "SAFETY" } })).toThrow(/refusé/);
  });

  it("un message de retrait de modèle nomme le remplaçant à rejouer", () => {
    expect(modeleSuggere("This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features.")).toBe("gemini-3.8-flash");
    expect(modeleSuggere("API key not valid")).toBeNull();
    expect(modeleSuggere(undefined)).toBeNull();
  });

  it("le prompt demande du JSON strict en coordonnées relatives ; le modèle est surchargeable par GEMINI_MODEL", () => {
    expect(PROMPT_GEMINI).toMatch(/UNIQUEMENT un objet JSON/);
    expect(PROMPT_GEMINI).toMatch(/entre 0 et 1/);
    const avant = process.env.GEMINI_MODEL;
    process.env.GEMINI_MODEL = "gemini-test";
    expect(modeleGemini()).toBe("gemini-test");
    if (avant === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = avant;
    expect(modeleGemini()).not.toBe("gemini-test");
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
