import { describe, expect, it } from "vitest";
import { generateIdentifiant, generateTempPassword, hashPassword, verifyPassword } from "@/lib/auth";

describe("hashPassword / verifyPassword", () => {
  it("accepte le bon mot de passe et refuse un mauvais", async () => {
    const hash = await hashPassword("MotDePasse-Test-2026");
    expect(hash).not.toContain("MotDePasse-Test-2026");
    expect(hash.startsWith("$2")).toBe(true); // bcrypt
    expect(await verifyPassword("MotDePasse-Test-2026", hash)).toBe(true);
    expect(await verifyPassword("motdepasse-test-2026", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("produit un hash différent à chaque appel (sel aléatoire)", async () => {
    const a = await hashPassword("abc");
    const b = await hashPassword("abc");
    expect(a).not.toBe(b);
  });
});

describe("generateIdentifiant", () => {
  it("respecte le format PREFIXE-XXXXXX sans caractères ambigus", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateIdentifiant("CL")).toMatch(/^CL-[A-HJ-NP-Z2-9]{6}$/);
    }
    expect(generateIdentifiant()).toMatch(/^PP-[A-HJ-NP-Z2-9]{6}$/);
  });

  it("ne produit pas de doublon sur 100 générations", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateIdentifiant("PDG")));
    expect(ids.size).toBe(100);
  });
});

describe("generateTempPassword", () => {
  it("a une longueur minimale de 6 caractères (mot + 2 chiffres)", () => {
    for (let i = 0; i < 50; i++) {
      const p = generateTempPassword();
      expect(p.length).toBeGreaterThanOrEqual(6);
      expect(p).toMatch(/^[a-z]+\d{2}$/);
    }
  });
});
