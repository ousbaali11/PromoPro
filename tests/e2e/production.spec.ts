import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";

/*
 * Les points de test d'erreur (route GET /api/test-erreur, page et Server
 * Action /dev/test-erreur) n'existent qu'en développement. Ce test démarre le
 * VRAI serveur de production (`next start` sur le build de `npm run build`,
 * NODE_ENV=production, base SQLite jetable) et vérifie qu'ils répondent 404 —
 * pas « inoffensifs », inexistants. Témoin : sur le serveur de dev de la suite,
 * la route déclenche bien son erreur (500) et la page s'affiche (200).
 *
 * Prérequis : `npm run build` avant `npm run test:e2e` (la CI le fait ;
 * le build de production est isolé du serveur de dev, qui écrit dans .next/dev).
 */
const PORT = 3102;
const PROD = `http://localhost:${PORT}`;

let serveur: ChildProcess | undefined;

function arreter() {
  if (!serveur?.pid) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /PID ${serveur.pid} /T /F`, { stdio: "ignore" });
    } catch {
      /* déjà arrêté */
    }
  } else {
    serveur.kill("SIGTERM");
  }
  serveur = undefined;
}

test.afterAll(arreter);

test("en production (next start), /api/test-erreur et /dev/test-erreur répondent 404 ; témoin 500 / 200 sur le serveur de dev", async ({ request }) => {
  test.setTimeout(120_000);
  expect(existsSync(".next/BUILD_ID"), "Aucun build de production : lancez `npm run build` avant `npm run test:e2e`.").toBe(true);

  const nextBin = require.resolve("next/dist/bin/next"); // specs transpilées en CommonJS par Playwright
  serveur = spawn(process.execPath, [nextBin, "start", "--port", String(PORT)], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: "", // jamais une base distante
      SQLITE_PATH: "data/test.db",
      JWT_SECRET: "secret-de-test-e2e-promopro-0123456789",
      NEXT_TELEMETRY_DISABLED: "1",
      SENTRY_DSN: "",
    },
    stdio: "pipe",
  });
  let journal = "";
  serveur.stdout?.on("data", (d) => (journal += d));
  serveur.stderr?.on("data", (d) => (journal += d));

  // Attente du serveur de production (sonde de santé)
  await expect
    .poll(
      async () => {
        try {
          return (await request.get(`${PROD}/api/health`, { timeout: 5_000 })).status();
        } catch {
          return 0;
        }
      },
      { timeout: 60_000, message: `next start n'a pas démarré :\n${journal.slice(-800)}` },
    )
    .toBe(200);

  // Production : les deux points de test n'existent pas
  const route = await request.get(`${PROD}/api/test-erreur`);
  expect(route.status()).toBe(404);
  expect(await route.text()).toBe("");
  expect((await request.get(`${PROD}/dev/test-erreur`)).status()).toBe(404);
  // et le reste de l'application répond normalement
  expect((await request.get(`${PROD}/login`)).status()).toBe(200);

  // Témoin sur le serveur de dev de la suite : la route déclenche son erreur, la page s'affiche
  expect((await request.get("/api/test-erreur")).status()).toBe(500);
  expect((await request.get("/dev/test-erreur")).status()).toBe(200);

  arreter();
});
