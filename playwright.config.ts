import { defineConfig } from "@playwright/test";

/**
 * Tests de bout en bout : `npm run test:e2e` (lance d'abord test:e2e:setup).
 * Le serveur de dev est démarré par Playwright sur le port 3100 en mode
 * SQLite forcé (DATABASE_URL vide, SQLITE_PATH=data/test.db) : aucune
 * connexion à une base distante n'est possible, quel que soit .env.local.
 */
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
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
      JWT_SECRET: "secret-de-test-e2e-promopro-0123456789",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
