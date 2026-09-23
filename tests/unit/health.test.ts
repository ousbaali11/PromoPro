import { describe, expect, it, vi } from "vitest";
import { verifierSante, statutHttp, DELAI_BASE_MS } from "@/lib/health";

/*
 * /api/health : la base est simulée par une sonde (promesse) — jamais une vraie
 * base, ni SQLite ni PostgreSQL.
 */
describe("état de santé", () => {
  it("base accessible : ok, database « ok », horodatage ISO et durée → 200", async () => {
    const horloge = [1_000_000, 1_000_120]; // début, fin
    const etat = await verifierSante(async () => [{ "?column?": 1 }], { now: () => horloge.shift()! });
    expect(etat).toEqual({ ok: true, database: "ok", timestamp: new Date(1_000_120).toISOString(), dureeMs: 120 });
    expect(statutHttp(etat)).toBe(200);
  });

  it("base en erreur (connexion refusée) : unreachable, détail journalisé côté serveur seulement → 503", async () => {
    const journal: string[] = [];
    const etat = await verifierSante(
      async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
      },
      { journaliser: (m) => journal.push(m) },
    );
    expect(etat.ok).toBe(false);
    expect(etat.database).toBe("unreachable");
    expect(etat.ok === false && etat.raison).toBe("erreur");
    expect(statutHttp(etat)).toBe(503);
    expect(JSON.stringify(etat)).not.toContain("ECONNREFUSED"); // rien du détail dans la réponse
    expect(journal[0]).toContain("ECONNREFUSED");
  });

  it("base qui ne répond pas dans le délai : unreachable (timeout) → 503, sans attendre la sonde", async () => {
    vi.useFakeTimers();
    try {
      const journal: string[] = [];
      const jamais = new Promise<never>(() => {});
      const promesse = verifierSante(() => jamais, { delaiMs: 2500, journaliser: (m) => journal.push(m) });
      await vi.advanceTimersByTimeAsync(2499);
      let resolue = false;
      void promesse.then(() => (resolue = true));
      await Promise.resolve();
      expect(resolue).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const etat = await promesse;
      expect(etat.ok).toBe(false);
      expect(etat.ok === false && etat.raison).toBe("timeout");
      expect(statutHttp(etat)).toBe(503);
      expect(journal[0]).toContain("timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("le délai par défaut est court (2 à 3 secondes)", () => {
    expect(DELAI_BASE_MS).toBeGreaterThanOrEqual(2000);
    expect(DELAI_BASE_MS).toBeLessThanOrEqual(3000);
  });
});
