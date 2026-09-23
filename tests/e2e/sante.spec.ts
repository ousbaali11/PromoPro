import { expect, test } from "@playwright/test";

/*
 * GET /api/health sur le serveur de test (SQLite jetable) : base accessible →
 * 200 avec l'état complet. Le cas « base injoignable » (503) est couvert par
 * tests/unit/health.test.ts avec une sonde simulée : aucune base réelle n'est
 * coupée ni touchée ici.
 */
test("/api/health : base accessible → 200, ok, database « ok », horodatage récent, sans session ni cache", async ({ page }) => {
  await page.context().clearCookies();
  const avant = Date.now();
  const reponse = await page.request.get("/api/health");
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()["cache-control"]).toBe("no-store");
  const corps = await reponse.json();
  expect(corps.ok).toBe(true);
  expect(corps.database).toBe("ok");
  const t = Date.parse(corps.timestamp);
  expect(t).toBeGreaterThanOrEqual(avant - 1000);
  expect(t).toBeLessThanOrEqual(Date.now() + 1000);
  expect(corps.dureeMs).toBeLessThan(2500);
});
