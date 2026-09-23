/**
 * Point d'entrée unique du schéma Drizzle.
 *
 * Le dialecte est choisi au démarrage d'après `DATABASE_URL` :
 * - défini et commençant par "postgres" → tables `pgTable` de schema.pg.ts,
 * - sinon → tables `sqliteTable` de schema.sqlite.ts (base locale data/promopro.db).
 *
 * Pourquoi deux fichiers de schéma ? Drizzle n'a pas de définition de table
 * indépendante du dialecte : `sqliteTable` et `pgTable` produisent des objets
 * différents (types de colonnes, mapping des valeurs — timestamps stockés en
 * entiers côté SQLite, en `timestamptz` côté Postgres). schema.pg.ts est donc
 * un miroir généré de schema.sqlite.ts (`npm run db:pg-schema`), jamais édité
 * à la main. Les types TypeScript des lignes (`$inferSelect`) sont identiques
 * dans les deux cas, ce qui permet au reste du code d'ignorer le dialecte.
 *
 * Le `cast` ci-dessous fige le typage sur la version SQLite ; à l'exécution,
 * les objets réellement exportés sont ceux du dialecte actif et le client
 * (client.ts) est construit avec le même dialecte.
 */
import * as sqlite from "./schema.sqlite";
import * as pg from "./schema.pg";

export const DATABASE_URL = process.env.DATABASE_URL?.trim() || null;
export const usePostgres = !!DATABASE_URL && /^postgres(ql)?:\/\//i.test(DATABASE_URL);

const s = (usePostgres ? pg : sqlite) as unknown as typeof sqlite;

export const promoteurs = s.promoteurs;
export const users = s.users;
export const projets = s.projets;
export const biens = s.biens;
export const epingles = s.epingles;
export const clients = s.clients;
export const propositions = s.propositions;
export const echeances = s.echeances;
export const contrats = s.contrats;
export const paiements = s.paiements;
export const desistements = s.desistements;
export const prospects = s.prospects;
export const rendezvous = s.rendezvous;
export const visites = s.visites;
export const demandesPhotos = s.demandesPhotos;
export const photosAvancement = s.photosAvancement;
export const syndics = s.syndics;
export const notifications = s.notifications;
export const journalActivite = s.journalActivite;
export const demandesTma = s.demandesTma;

export const ROLES = sqlite.ROLES;
export type Role = sqlite.Role;
