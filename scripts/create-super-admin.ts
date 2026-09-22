/**
 * Crée un compte SUPER_ADMIN (éditeur de la plateforme, sans promoteur).
 *
 * Usage :
 *   npm run create-admin -- <identifiant> <mot-de-passe> [--nom Nom] [--prenom Prénom]
 *
 * Exemple :
 *   npm run create-admin -- ADMIN-PROD 'Un-mot-de-passe-solide-42'
 *
 * Cible la base désignée par DATABASE_URL (.env.local / .env / environnement),
 * sinon la base SQLite locale — même règle que l'application.
 */
import "../src/db/load-env";
import { eq } from "drizzle-orm";
import { db, closeDb, dialecte } from "../src/db/client";
import { users } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth";

const MOT_DE_PASSE_MIN = 10;

function usage(message?: string): never {
  if (message) console.error(`Erreur : ${message}\n`);
  console.error(
    [
      "Usage : npm run create-admin -- <identifiant> <mot-de-passe> [--nom Nom] [--prenom Prénom]",
      "",
      `  identifiant    lettres, chiffres, tirets ou points (ex. ADMIN-PROD)`,
      `  mot-de-passe   ${MOT_DE_PASSE_MIN} caractères minimum ; entourez-le de guillemets simples`,
    ].join("\n"),
  );
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const positionnels: string[] = [];
  const options: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--nom" || a === "--prenom") {
      const v = argv[i + 1];
      if (!v) usage(`valeur manquante pour ${a}`);
      options[a.slice(2)] = v;
      i++;
    } else if (a.startsWith("--")) {
      usage(`option inconnue : ${a}`);
    } else {
      positionnels.push(a);
    }
  }
  return { positionnels, options };
}

async function main() {
  const { positionnels, options } = parseArgs(process.argv.slice(2));
  const [identifiant, motDePasse] = positionnels;

  if (!identifiant || !motDePasse) usage("identifiant et mot de passe sont obligatoires.");
  if (positionnels.length > 2) usage("trop d'arguments (le mot de passe contient-il des espaces non protégés ?).");
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(identifiant)) {
    usage("identifiant invalide : 3 à 64 caractères parmi lettres, chiffres, '.', '_' et '-'.");
  }
  if (motDePasse.length < MOT_DE_PASSE_MIN) usage(`mot de passe trop court (${MOT_DE_PASSE_MIN} caractères minimum).`);

  const nom = options.nom ?? "Plateforme";
  const prenom = options.prenom ?? "Admin";

  console.log(`→ Base cible : ${dialecte === "postgres" ? "PostgreSQL (DATABASE_URL)" : "SQLite locale (data/promopro.db)"}`);

  const existant = await db.query.users.findFirst({ where: eq(users.identifiant, identifiant) });
  if (existant) {
    console.error(`Erreur : l'identifiant « ${identifiant} » existe déjà (rôle ${existant.role}). Aucun compte créé.`);
    process.exit(1);
  }

  const [created] = await db
    .insert(users)
    .values({
      promoteurId: null,
      role: "SUPER_ADMIN",
      nom,
      prenom,
      identifiant,
      passwordHash: await hashPassword(motDePasse),
      actif: true,
    })
    .returning();

  console.log(`✅ Compte SUPER_ADMIN créé : ${created.identifiant} (${created.prenom} ${created.nom}), id ${created.id}`);
  console.log("   Connectez-vous sur /login ; le mot de passe n'est pas affiché ni stocké en clair.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeDb();
  });
