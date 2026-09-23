import { describe, expect, it } from "vitest";
import { consommer, estBloque, enregistrerEchec, reinitialiser, LIMITES, messageLimite } from "@/lib/rate-limit";

describe("limites de débit", () => {
  const fenetre = 10 * 60 * 1000;

  it("consommer : autorise jusqu'à max événements dans la fenêtre, puis bloque avec un délai", () => {
    const cle = "test:consommer:" + Math.random();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(consommer(cle, 3, fenetre, t0 + i * 1000)).toEqual({ autorise: true, reessaiDansSec: 0 });
    const bloque = consommer(cle, 3, fenetre, t0 + 5000);
    expect(bloque.autorise).toBe(false);
    expect(bloque.reessaiDansSec).toBe(Math.ceil((fenetre - 5000) / 1000));
    // le refus n'est pas compté : l'appel suivant après expiration du plus ancien passe
    expect(consommer(cle, 3, fenetre, t0 + fenetre + 1).autorise).toBe(true);
    reinitialiser(cle);
    expect(estBloque(cle, 3, fenetre).bloque).toBe(false);
  });

  it("fenêtre glissante : les événements sortis de la fenêtre ne comptent plus", () => {
    const cle = "test:fenetre:" + Math.random();
    enregistrerEchec(cle, fenetre, 0);
    enregistrerEchec(cle, fenetre, 1000);
    expect(estBloque(cle, 2, fenetre, 2000).bloque).toBe(true);
    expect(estBloque(cle, 2, fenetre, fenetre + 500).bloque).toBe(false); // le premier est sorti
    reinitialiser(cle);
  });

  it("chaque clé est indépendante (un utilisateur ne bloque pas les autres)", () => {
    const a = "test:a:" + Math.random();
    const b = "test:b:" + Math.random();
    for (let i = 0; i < 2; i++) consommer(a, 2, fenetre, 10);
    expect(consommer(a, 2, fenetre, 20).autorise).toBe(false);
    expect(consommer(b, 2, fenetre, 20).autorise).toBe(true);
    reinitialiser(a);
    reinitialiser(b);
  });

  it("limites documentées et message avec délai en minutes", () => {
    expect(LIMITES.upload).toEqual({ max: 30, fenetreMs: 10 * 60 * 1000 });
    expect(LIMITES.importProspects).toEqual({ max: 10, fenetreMs: 10 * 60 * 1000 });
    expect(LIMITES.demandeTma).toEqual({ max: 10, fenetreMs: 60 * 60 * 1000 });
    expect(messageLimite(30)).toContain("1 minute.");
    expect(messageLimite(500)).toContain("9 minutes");
  });
});
