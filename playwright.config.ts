import { defineConfig } from "@playwright/test";

/**
 * Tests de bout en bout : `npm run test:e2e` (lance d'abord test:e2e:setup).
 * Le serveur de dev est démarré par Playwright sur le port 3100 en mode
 * SQLite forcé (DATABASE_URL vide, SQLITE_PATH=data/test.db) : aucune
 * connexion à une base distante n'est possible, quel que soit .env.local.
 */
const PORT = 3100;

// Suffixe unique du run, hérité par les workers : un worker redémarré (après un dépassement global)
// recharge les specs, dont les constantes de module ; ce suffixe reste identique et les données créées
// par les tests précédents restent retrouvables.
process.env.E2E_SUFFIXE ??= Date.now().toString(36).toUpperCase().slice(-4);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    // Un clic ou une navigation qui n'aboutit pas en une minute échoue proprement (le test continue de tomber,
    // mais sans dépassement global : le worker et l'état du spec survivent, le nettoyage reste possible)
    actionTimeout: 60_000,
    navigationTimeout: 60_000,
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      DATABASE_URL: "",
      ALLOW_REMOTE_DB_IN_DEV: "",
      SQLITE_PATH: "data/test.db",
      // Retire le badge de l'overlay de développement Next.js (voir next.config.ts)
      E2E_TESTS: "1",
      JWT_SECRET: "secret-de-test-e2e-promopro-0123456789",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
