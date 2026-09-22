/**
 * Garde-fous autour du choix de base de données (voir README, « Travailler
 * avec la base de production »). Module sans dépendance : utilisé par
 * next.config.ts (au démarrage de `next dev`) et par src/db/client.ts (à la
 * connexion, pour l'application comme pour les scripts).
 */
import path from "node:path";

export type InfoBase = {
  dialecte: "sqlite" | "postgres";
  /** Hôte Postgres, ou null en SQLite */
  hote: string | null;
  /** Vrai si la base n'est ni un fichier local ni localhost */
  distante: boolean;
};

const HOTES_LOCAUX = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Chemin absolu de la base SQLite : `SQLITE_PATH` (ex. data/test.db pour les tests) ou data/promopro.db. */
export function cheminSqlite(cwd = process.cwd()) {
  const brut = process.env.SQLITE_PATH?.trim() || "data/promopro.db";
  return path.isAbsolute(brut) ? brut : path.join(cwd, brut);
}

/** Chemin relatif lisible pour le bandeau. */
function libelleSqlite() {
  const abs = cheminSqlite();
  const rel = path.relative(process.cwd(), abs).replace(/\\/g, "/");
  return rel && !rel.startsWith("..") ? rel : abs;
}

export function analyserDatabaseUrl(url = process.env.DATABASE_URL): InfoBase {
  const v = url?.trim() ?? "";
  if (!/^postgres(ql)?:\/\//i.test(v)) return { dialecte: "sqlite", hote: null, distante: false };
  let hote: string | null = null;
  try {
    hote = new URL(v).hostname.toLowerCase();
  } catch {
    hote = null;
  }
  return { dialecte: "postgres", hote, distante: !hote || !HOTES_LOCAUX.has(hote) };
}

function couleursSupportees() {
  if (process.env.NO_COLOR || process.env.TERM === "dumb") return false;
  return !!process.stdout.isTTY || !!process.env.FORCE_COLOR;
}

/** Texte du bandeau, coloré (ANSI) si le terminal le permet, toujours encadré de lignes ===. */
export function bandeauBase(info: InfoBase = analyserDatabaseUrl()) {
  const c = couleursSupportees();
  const vert = (s: string) => (c ? `\x1b[1;32m${s}\x1b[0m` : s);
  const rouge = (s: string) => (c ? `\x1b[1;97;41m${s}\x1b[0m` : s);
  const ligne = "=".repeat(78);
  if (info.dialecte === "sqlite") {
    return [ligne, vert(`🟢 Base locale : SQLite (${libelleSqlite()})`), ligne].join("\n");
  }
  return [
    ligne,
    rouge("🔴 ATTENTION — Base distante : PostgreSQL (Railway/production)."),
    rouge("   Toute écriture affecte les données réelles."),
    `   Hôte : ${info.hote ?? "inconnu"}`,
    ligne,
  ].join("\n");
}

/** Affiche le bandeau une seule fois par processus (rechargements à chaud compris). */
export function afficherBandeau(info: InfoBase = analyserDatabaseUrl()) {
  const g = globalThis as unknown as { __promoproBandeauAffiche?: boolean };
  if (g.__promoproBandeauAffiche) return;
  g.__promoproBandeauAffiche = true;
  const sortie = info.dialecte === "postgres" ? console.error : console.log;
  sortie(bandeauBase(info));
}

/**
 * Serveur de dev (`npm run dev`) + base Postgres distante = refus, sauf
 * ALLOW_REMOTE_DB_IN_DEV=1. Les scripts ponctuels (db:push, db:seed,
 * create-admin) ne sont pas concernés : ils ciblent explicitement la base
 * demandée et affichent le bandeau rouge.
 */
export function verifierGardeFouDev(info: InfoBase = analyserDatabaseUrl()) {
  if (process.env.npm_lifecycle_event !== "dev") return;
  if (info.dialecte !== "postgres" || !info.distante) return;
  if (process.env.ALLOW_REMOTE_DB_IN_DEV === "1") {
    afficherBandeau(info);
    console.error("   ALLOW_REMOTE_DB_IN_DEV=1 : démarrage du serveur de dev sur la base distante AUTORISÉ.\n");
    return;
  }
  const ligne = "=".repeat(78);
  throw new Error(
    [
      "",
      ligne,
      "🔴 DÉMARRAGE REFUSÉ — `npm run dev` avec une base PostgreSQL distante.",
      `   DATABASE_URL pointe vers ${info.hote ?? "un hôte distant"} (Railway/production).`,
      "   Développer contre la production ferait écrire chaque test dans les données réelles.",
      "",
      "   Pour développer : retirez DATABASE_URL de .env.local (mode SQLite local).",
      "   Pour une commande ponctuelle contre Postgres (PowerShell) :",
      '     $env:DATABASE_URL="postgresql://..."; npm run db:push',
      "   Pour forcer malgré tout le serveur de dev sur la base distante :",
      "     ALLOW_REMOTE_DB_IN_DEV=1 (variable d'environnement, jamais dans .env.local).",
      ligne,
      "",
    ].join("\n"),
  );
}
