import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { analyserDatabaseUrl, bandeauBase, cheminSqlite, verifierGardeFouDev } from "@/db/guard";

const RAILWAY = "postgresql://postgres:secret@thomas.proxy.rlwy.net:49817/railway";
const INTERNE = "postgresql://postgres:secret@postgres.railway.internal:5432/railway";
const LOCAL = "postgresql://postgres:postgres@localhost:5432/promopro";
const LOCAL_IP = "postgres://u:p@127.0.0.1:5432/x";
const FICHIER = "file:./data/promopro.db";

describe("analyserDatabaseUrl", () => {
  it("détecte une base Postgres distante (Railway public et interne)", () => {
    expect(analyserDatabaseUrl(RAILWAY)).toEqual({ dialecte: "postgres", hote: "thomas.proxy.rlwy.net", distante: true });
    expect(analyserDatabaseUrl(INTERNE).distante).toBe(true);
  });
  it("considère localhost et 127.0.0.1 comme locaux", () => {
    expect(analyserDatabaseUrl(LOCAL)).toEqual({ dialecte: "postgres", hote: "localhost", distante: false });
    expect(analyserDatabaseUrl(LOCAL_IP).distante).toBe(false);
  });
  it("retombe en SQLite pour un chemin file:, une valeur vide ou absente", () => {
    expect(analyserDatabaseUrl(FICHIER)).toEqual({ dialecte: "sqlite", hote: null, distante: false });
    expect(analyserDatabaseUrl("")).toEqual({ dialecte: "sqlite", hote: null, distante: false });
    expect(analyserDatabaseUrl(undefined).dialecte).toBe("sqlite");
    expect(analyserDatabaseUrl("   ").dialecte).toBe("sqlite");
  });
});

describe("bandeauBase", () => {
  it("est vert en SQLite et rouge avec l'hôte en Postgres", () => {
    expect(bandeauBase(analyserDatabaseUrl(FICHIER))).toContain("🟢 Base locale : SQLite");
    const rouge = bandeauBase(analyserDatabaseUrl(RAILWAY));
    expect(rouge).toContain("🔴 ATTENTION");
    expect(rouge).toContain("thomas.proxy.rlwy.net");
    expect(rouge).toContain("=".repeat(78));
  });
});

describe("verifierGardeFouDev", () => {
  const env = { ...process.env };
  beforeEach(() => {
    delete process.env.ALLOW_REMOTE_DB_IN_DEV;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("refuse `npm run dev` sur une base distante", () => {
    process.env.npm_lifecycle_event = "dev";
    expect(() => verifierGardeFouDev(analyserDatabaseUrl(RAILWAY))).toThrow(/DÉMARRAGE REFUSÉ/);
  });
  it("laisse passer avec ALLOW_REMOTE_DB_IN_DEV=1", () => {
    process.env.npm_lifecycle_event = "dev";
    process.env.ALLOW_REMOTE_DB_IN_DEV = "1";
    expect(() => verifierGardeFouDev(analyserDatabaseUrl(RAILWAY))).not.toThrow();
  });
  it("ne bloque ni les scripts ponctuels ni les bases locales", () => {
    process.env.npm_lifecycle_event = "db:push";
    expect(() => verifierGardeFouDev(analyserDatabaseUrl(RAILWAY))).not.toThrow();
    process.env.npm_lifecycle_event = "dev";
    expect(() => verifierGardeFouDev(analyserDatabaseUrl(LOCAL))).not.toThrow();
    expect(() => verifierGardeFouDev(analyserDatabaseUrl(FICHIER))).not.toThrow();
  });
});

describe("cheminSqlite", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  it("vaut data/promopro.db par défaut et respecte SQLITE_PATH", () => {
    delete process.env.SQLITE_PATH;
    expect(cheminSqlite("/racine")).toBe(path.join("/racine", "data/promopro.db"));
    process.env.SQLITE_PATH = "data/test.db";
    expect(cheminSqlite("/racine")).toBe(path.join("/racine", "data/test.db"));
    process.env.SQLITE_PATH = path.resolve("/tmp/x.db");
    expect(cheminSqlite("/racine")).toBe(path.resolve("/tmp/x.db"));
  });
});
