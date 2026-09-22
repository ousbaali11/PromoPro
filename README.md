# PromoPro — Plateforme de gestion promoteur

Application web pour la gestion complète d'un (ou plusieurs) promoteur(s) immobilier(s) :
projets & biens, propositions de vente, contrats, paiements, désistements, prospects,
service après-vente, recouvrement, et un espace client dédié — le tout conforme au
cahier des charges fonctionnel PromoPro.

L'application couvre l'ensemble des profils et des flux du cahier des charges
(`PromoPro_Cahier_des_charges.pdf`). Les 12 phases de la feuille de route
(`PROMPTS.md`) sont implémentées et vérifiées ; les conventions de code sont
dans **[ARCHITECTURE.md](./ARCHITECTURE.md)** et la checklist de sécurité dans
**[SECURITY.md](./SECURITY.md)**.

## Stack technique

- **Next.js 16** (App Router, Server Actions, Turbopack) + **TypeScript**
- **Tailwind CSS v4** pour le design (tokens dans `src/app/globals.css`)
- **Drizzle ORM** + **SQLite** via **`@libsql/client`** pour la base de données locale
- **jose** (JWT) + **bcryptjs** pour l'authentification par cookie de session
  (compatible avec le runtime Node et Edge, utilisé aussi bien dans les Server
  Actions que dans `src/proxy.ts`, le middleware de protection des routes)

> **Pourquoi SQLite plutôt que Postgres ?** Pour que le projet tourne immédiatement
> après `git clone`, sans service externe à configurer. Le schéma Drizzle
> (`src/db/schema.ts`) est volontairement simple à migrer vers Postgres pour la
> production : voir la dernière section de ce fichier.

> **Pourquoi `@libsql/client` plutôt que `better-sqlite3` ?** `better-sqlite3`
> n'est pas construit sur N-API : il a besoin d'un binaire précompilé différent
> pour chaque version majeure de Node, et sur une version de Node très récente
> (ou un environnement Windows sans Python/Visual Studio Build Tools), l'install
> peut échouer et tenter une compilation locale (`node-gyp`) qui échoue à son
> tour. `@libsql/client` utilise des binaires N-API (compatibles avec toutes les
> versions récentes de Node, sur Windows/macOS/Linux) et ne nécessite jamais de
> compilation. C'est un remplacement direct, le reste du code ne change pas.

> **Pourquoi Drizzle plutôt que Prisma ?** Choix pragmatique fait pendant le
> développement initial : le CLI Prisma télécharge ses moteurs binaires depuis
> `binaries.prisma.sh`, injoignable dans l'environnement où ce projet a été amorcé.
> Si vous préférez Prisma pour la suite du projet (Claude Code s'en sort très
> bien avec les deux), rien n'empêche de migrer.

## Démarrage rapide

```
npm install
npm run db:push
npm run db:seed
npm run dev
```

Sous **PowerShell** (Windows), lancez ces quatre commandes une par une (appuyez
sur Entrée après chacune) plutôt que de les enchaîner avec `&&`, qui n'est pas
supporté par PowerShell 5 (celui ouvert par défaut depuis l'explorateur de
fichiers). Sous un terminal bash/zsh (macOS, Linux, ou PowerShell 7+ / `pwsh`),
vous pouvez les enchaîner avec `&&` si vous préférez.

- `npm install` — installe les dépendances
- `npm run db:push` — crée `data/promopro.db` à partir du schéma
- `npm run db:seed` — peuple un promoteur de démo avec un compte par rôle
- `npm run dev` — démarre le serveur de développement sur http://localhost:3000

Copiez `.env.example` vers `.env.local` si vous voulez définir votre propre
`JWT_SECRET` (une valeur de repli est fournie pour le développement).

### En cas de souci à l'installation

- **`npm install` échoue en essayant de compiler un module natif** (mention de
  `node-gyp`, `python`, `Visual Studio`) : vérifiez que vous êtes bien sur la
  version du projet qui utilise `@libsql/client` (`package.json` ne doit
  contenir ni `better-sqlite3` ni `@prisma/client`). Si le problème vient d'un
  autre paquet, relancez avec `npm install --legacy-peer-deps`.
- **`'next' n'est pas reconnu...`** : `npm install` n'est pas allé au bout (regardez
  l'erreur juste au-dessus dans le terminal) — corrigez cette erreur puis
  relancez `npm install` avant `npm run dev`.

### Comptes de démonstration (mot de passe entre parenthèses)

| Rôle | Identifiant | Compte créé par |
|---|---|---|
| Super Admin (plateforme) | `SUPERADMIN` (`admin1234`) | `npm run create-admin` (ou seed) |
| PDG | `PDG-DEMO` (`demo1234`) | Super Admin, avec le promoteur |
| Directeur Commercial | `DIRCOM-DEMO` (`demo1234`) | Super Admin, avec le promoteur |
| Directeur Financier | `DIRFIN-DEMO` (`demo1234`) | Super Admin, avec le promoteur |
| Commercial | `COM1-DEMO` / `COM2-DEMO` (`demo1234`) | Directeur Commercial |
| Responsable Commercial | — | Directeur Commercial |
| Responsable Administratif | `RESPADM-DEMO` (`demo1234`) | Directeur Commercial |
| Assistant Administratif | `ASSIST-DEMO` (`demo1234`) | Directeur Commercial |
| Service Après-Vente | `SAV-DEMO` (`demo1234`) | Directeur Commercial |
| Comptable Interne | `COMPTA-DEMO` (`demo1234`) | Directeur Financier |
| Recouvrement | `RECOUV-DEMO` (`demo1234`) | Directeur Financier |
| Client | `CL-DEMO` (`demo1234`) | Commercial (fiche client) |

La liste est aussi affichée sur la page de connexion.

Pour créer un Super Admin avec vos propres identifiants (sans passer par le
seed, par exemple sur une base de production vierge) :

```bash
npm run create-admin -- <identifiant> '<mot-de-passe>'
```

(`scripts/create-super-admin.ts` : options `--nom` / `--prenom`, mot de passe
de 10 caractères minimum, refuse un identifiant déjà utilisé ; cible la base
désignée par `DATABASE_URL`, sinon la base SQLite locale.)

## Fonctionnalités par profil

- Authentification par identifiant + mot de passe (Super Admin, tous les rôles
  internes, clients), sessions signées, routes protégées par rôle,
  rate-limiting sur la connexion, notifications (cloche) pour le staff **et**
  les clients
- **Super Admin** : créer un promoteur avec ses trois directions (PDG,
  Directeur Commercial, Directeur Financier), activer/suspendre son abonnement
- **Directeur Commercial** : projets et tableau de contenance, plan de chaque
  bien (PDF/image), recrutement de son pôle (commercial, responsable
  commercial, responsable administratif, assistant administratif, SAV)
- **PDG** : blocage de biens avec commentaire privé ; accepter / refuser /
  négocier les propositions
- **Commercial** : clients (avec scan de pièce d'identité), propositions avec
  échéancier 40/20/20/20 modifiable, saisie de la 1re tranche avec preuve,
  désistement (bien remis à zéro, historique « Biens désistés »), prospects
- **Responsable Administratif** : contrat PDF généré à la confirmation, dépôt
  de la 4e copie signée, désistements (vérification, remboursement), dossiers
  livrés à transmettre au notaire, rendez-vous
- **Comptable Interne** : référencement et validation des paiements avec reçu
  PDF et mise à jour de l'échéancier (trop-perçu reporté), syndic à valider,
  biens vendus par commercial
- **Directeur Financier** : trésorerie (total du jour, à 7 jours, chèques
  encaissés / à venir, virements, échéances à venir, remboursements),
  recrutement de son pôle (comptable interne, recouvrement)
- **Service Après-Vente** : rendez-vous, demandes de visite (autorisation PDF,
  créneaux contrôlés), photos d'avancement, livraison (double confirmation),
  syndic
- **Recouvrement** : échéanciers de toutes les ventes avec filtres de période,
  paiement constaté pour le compte du client, rendez-vous
- **Assistant Administratif** : prospects par commercial, relance
- **Espace Client** : par bien (cloisonné) — échéancier et avancement, ajout de
  paiement avec preuve, contrat / copie signée / plan / reçus, photos
  d'avancement (1 demande / 6 mois), visite, livraison, syndic ; rendez-vous
  avec chaque service ; contact des services ; rappel J-7 avant échéance

## Structure du projet

```
src/
  db/
    schema.ts        toutes les tables (Drizzle)
    client.ts          connexion SQLite
    seed.ts               jeu de données de démonstration
  lib/
    auth.ts               hash de mot de passe, signature/vérification JWT
    session.ts          helpers de session (requireStaffSession, requireRole...)
    roles.ts                libellés de rôles + navigation par rôle
    notifications.ts   création de notifications
    utils.ts                  formatage (argent, dates), échéancier par défaut
  components/
    ui/                        primitives (Button, Card, Input, Badge...)
    layout/                  DashboardShell (sidebar responsive), NotificationBell
    paiements/               PaiementForm (partagé commercial / client / recouvrement)
  lib/pdf/                   contrat, reçu, autorisation de visite (pdf-lib)
  lib/                       storage, file-access, paiements, rendezvous, creneaux,
                             periodes, tresorerie, livraison, rate-limit
  app/
    login/                   connexion (comptes internes + clients)
    admin/                   Super Admin (promoteurs, abonnements)
    dashboard/             tous les rôles internes du promoteur
      projets/, biens/, propositions/, clients/, equipe/, contrats/,
      paiements/, desistements/, prospects/, sav/, recouvrement/, finance/
    client/                    espace client (portail séparé)
  proxy.ts                    protection des routes par rôle (Next.js 16)
```

Chaque module suit le même schéma : `page.tsx` (Server Component, lecture des
données), `actions.ts` (`"use server"`, écriture + vérification de rôle via
`requireRole`), et de petits composants client (`"use client"`) pour
l'interactivité (boutons, formulaires avec `useActionState`).

## Tâches planifiées (rappel J-7 avant échéance)

La route `GET /api/cron/rappels-echeance` notifie chaque client une semaine
avant une échéance non soldée (date, montant, tranche, pourcentage). Elle doit
être appelée **une fois par jour** et exige l'en-tête
`Authorization: Bearer $CRON_SECRET` (variable d'environnement, obligatoire en
production). Elle est idempotente : une échéance n'est jamais rappelée deux fois.

- **Vercel** : ajouter à `vercel.json`
  `{"crons":[{"path":"/api/cron/rappels-echeance","schedule":"0 8 * * *"}]}`
  et définir `CRON_SECRET` dans les variables du projet (Vercel envoie
  automatiquement `Authorization: Bearer $CRON_SECRET`).
- **Serveur classique (cron / systemd timer)** :
  `0 8 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://votre-domaine/api/cron/rappels-echeance`
- **En local** : `curl http://localhost:3000/api/cron/rappels-echeance`
  (sans `CRON_SECRET` défini, la route est ouverte hors production).

## Mise à jour du schéma en développement

`npm run db:push` applique les changements de `src/db/schema.ts` à la base
SQLite locale. Attention : sur une base existante, drizzle-kit peut recréer une
table et perdre son contenu. En développement, relancez simplement
`npm run db:seed` après un `db:push` pour retrouver le jeu de démonstration.

## Fichiers uploadés en production

Les fichiers (pièces d'identité, preuves de paiement, PDF générés, photos)
sont écrits sur disque via `src/lib/storage.ts`, dans `storage/uploads/` par
défaut. En production, ce dossier doit être un **disque persistant** : montez
un volume et définissez `UPLOAD_DIR=/chemin/du/volume` (les chemins stockés en
base ne changent pas). Sur une plateforme sans disque persistant (serverless),
remplacez `saveUpload` / `readUpload` dans `storage.ts` par un stockage objet
S3-compatible (S3, R2, MinIO) : c'est le seul endroit du code qui touche au
système de fichiers, les chemins publics `/api/files/...` et le contrôle
d'accès restent identiques.

## PostgreSQL en production (bascule par variable d'environnement)

Le driver est choisi au démarrage par `src/db/client.ts` :

- `DATABASE_URL` défini et commençant par `postgres://` (ou `postgresql://`)
  → PostgreSQL (`pg` + `drizzle-orm/node-postgres`, schéma `src/db/schema.pg.ts`) ;
- sinon → SQLite locale (`data/promopro.db`), comportement inchangé.

`npm run db:push` et `npm run db:seed` suivent la même règle (ils lisent
`.env.local` puis `.env`) : ils ciblent toujours la base que l'application
utilise. Pour un déploiement complet sur Railway (Docker, volume, variables),
voir **[DEPLOY.md](./DEPLOY.md)**.

`schema.pg.ts` est un miroir colonne par colonne de `schema.sqlite.ts`,
régénéré par `npm run db:pg-schema` après toute modification du schéma (ne
jamais l'éditer à la main). Le reste du code (requêtes Drizzle, Server
Actions, PDF, stockage) ignore le dialecte.

Pour tester localement contre une base Postgres distante : mettez son URL
publique dans `.env.local` (`DATABASE_URL=...`), puis `npm run db:push`,
`npm run db:seed`, `npm run dev`. Retirez la variable pour revenir en SQLite.

## Tests automatisés

Deux niveaux, aucun ne touche jamais `data/promopro.db` ni une base distante :

```bash
npm run test        # unitaires (Vitest) : fonctions pures, sans base de données
npm run test:e2e    # bout en bout (Playwright) : serveur de dev sur data/test.db, jetable
```

- **Unitaires** (`tests/unit/`) : échéancier par défaut et formatage
  (`src/lib/utils.ts`), hachage / identifiants / mots de passe temporaires
  (`src/lib/auth.ts`), hiérarchie de recrutement et navigation
  (`src/lib/roles.ts`), détection base locale / distante et garde-fou dev
  (`src/db/guard.ts`).
- **Bout en bout** (`tests/e2e/`) : `test:e2e:setup` recrée `data/test.db`
  (schéma + seed de démo) avec `DATABASE_URL` forcé à vide, puis Playwright
  démarre lui-même `next dev` sur le port 3100 en mode SQLite forcé
  (`SQLITE_PATH=data/test.db`) et joue : connexion de chaque rôle et refus
  d'un mauvais mot de passe, contrôle d'accès (PDG hors Équipe, Commercial
  hors `/admin`, client hors `/dashboard`), recrutement par pôle (statuts
  proposés, rôle forcé refusé), workflow de vente complet (projet → blocage
  PDG → proposition → acceptation → « Vendu » → notification du commercial).
- Première installation : `npx playwright install chromium` (le navigateur
  n'est pas dans `node_modules`). Arrêtez votre `npm run dev` avant
  `test:e2e` : Next.js n'accepte qu'un serveur de dev par dossier.
- `.github/workflows/test.yml` rejoue lint, build, `test` et `test:e2e` à
  chaque push sur `main` (voir DEPLOY.md).

## Travailler avec la base de production

Règle : **`.env.local` ne doit jamais contenir `DATABASE_URL` de façon
permanente.** Le projet choisit sa base d'après cette seule variable ; tant
qu'elle est présente, *toute* commande lancée depuis le dossier (`dev`,
`db:push`, `db:seed`, `create-admin`…) écrit dans la base de production.

Trois garde-fous sont en place (`src/db/guard.ts`) :

- **Bandeau à chaque connexion**, avant toute autre sortie : vert
  « 🟢 Base locale : SQLite » ou rouge « 🔴 ATTENTION — Base distante :
  PostgreSQL (Railway/production) » avec l'hôte ciblé.
- **`npm run dev` refuse de démarrer** si `DATABASE_URL` pointe vers un hôte
  distant (autre que `localhost` / `127.0.0.1`), avec un message expliquant
  quoi faire. `ALLOW_REMOTE_DB_IN_DEV=1` force le démarrage — à réserver aux
  cas où l'on veut sciemment piloter la production depuis le navigateur.
- Les **scripts ponctuels** (`db:push`, `db:seed`, `create-admin`) ne sont
  pas bloqués : ils affichent le bandeau rouge et s'exécutent, puisque la
  base a été demandée explicitement.

Pattern recommandé pour une commande ponctuelle contre Postgres — la variable
ne vaut que pour cette commande et n'est jamais persistée :

```powershell
# PowerShell (Windows)
$env:DATABASE_URL="postgresql://postgres:...@xxxx.proxy.rlwy.net:PORT/railway"; npm run db:push
$env:DATABASE_URL="postgresql://..."; npm run create-admin -- ADMIN-PROD 'mot-de-passe'
Remove-Item Env:DATABASE_URL     # facultatif : retire la variable de la session PowerShell
```

```bash
# bash / zsh
DATABASE_URL="postgresql://..." npm run db:push
```

Attention : sous PowerShell, `$env:DATABASE_URL=...` reste défini pour toute
la fenêtre de terminal jusqu'à `Remove-Item Env:DATABASE_URL` ou sa fermeture ;
un `npm run dev` lancé ensuite dans la même fenêtre sera donc bloqué par le
garde-fou — c'est voulu.

## Déploiement

Le projet se construit en image Docker (`Dockerfile`, build Next.js
`standalone`) avec une sonde de vie `GET /api/health`. Le pas-à-pas Railway
(repo GitHub, variables, volume persistant, initialisation de la base) est
dans **[DEPLOY.md](./DEPLOY.md)**.

## Sécurité

Voir [SECURITY.md](./SECURITY.md) : secrets obligatoires en production
(`JWT_SECRET`, `CRON_SECRET`), rate-limiting du login, contrôle d'accès par
rôle et par promoteur sur chaque action, fichiers servis uniquement aux ayants
droit.
#   P r o m o P r o  
 