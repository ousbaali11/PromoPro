import { describe, expect, it } from "vitest";
import { avecVerrou } from "@/lib/verrou";

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("verrou en mémoire par clé", () => {
  it("sérialise les sections critiques d'une même clé, dans l'ordre d'arrivée", async () => {
    const journal: string[] = [];
    await Promise.all([
      avecVerrou("k", async () => {
        journal.push("A début");
        await attendre(30);
        journal.push("A fin");
      }),
      avecVerrou("k", async () => {
        journal.push("B début");
        await attendre(5);
        journal.push("B fin");
      }),
    ]);
    expect(journal).toEqual(["A début", "A fin", "B début", "B fin"]);
  });
  it("laisse deux clés différentes s'exécuter en parallèle", async () => {
    const journal: string[] = [];
    await Promise.all([
      avecVerrou("x", async () => {
        journal.push("X début");
        await attendre(30);
        journal.push("X fin");
      }),
      avecVerrou("y", async () => {
        journal.push("Y début");
        await attendre(5);
        journal.push("Y fin");
      }),
    ]);
    expect(journal).toEqual(["X début", "Y début", "Y fin", "X fin"]);
  });
  it("libère le verrou après une exception et renvoie la valeur de la section", async () => {
    await expect(avecVerrou("z", async () => { throw new Error("boum"); })).rejects.toThrow("boum");
    expect(await avecVerrou("z", async () => 42)).toBe(42);
  });
});
