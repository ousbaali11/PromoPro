# PromoPro — Plateforme de gestion promoteur

Application web pour la gestion complète d'un (ou plusieurs) promoteur(s) immobilier(s) :
projets & biens, propositions de vente, contrats, paiements, désistements, prospects,
service après-vente, recouvrement, et un espace client dédié — le tout conforme au
cahier des charges fonctionnel PromoPro.

Ce dépôt est un **point de départ réel et fonctionnel** (pas une maquette) : base de
données, authentification, et un premier flux de vente complet fonctionnent de bout en
bout. Les modules restants sont préparés (modèle de données, pages, navigation) mais
laissés en placeholders — voir **[PROMPTS.md](./PROMPTS.md)** pour la suite du
développement avec Claude Code.

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

| Rôle | Identifiant |
|---|---|
| Super Admin (plateforme) | `SUPERADMIN` (`admin1234`) |
| PDG | `PDG-DEMO` (`demo1234`) |
| Directeur Commercial | `DIRCOM-DEMO` (`demo1234`) |
| Commercial | `COM1-DEMO` / `COM2-DEMO` (`demo1234`) |
| Responsable Administratif | `RESPADM-DEMO` (`demo1234`) |
| Directeur Financier | `DIRFIN-DEMO` (`demo1234`) |
| Comptable Interne | `COMPTA-DEMO` (`demo1234`) |
| Assistant Administratif | `ASSIST-DEMO` (`demo1234`) |
| Service Après-Vente | `SAV-DEMO` (`demo1234`) |
| Recouvrement | `RECOUV-DEMO` (`demo1234`) |
| Client | `CL-DEMO` (`demo1234`) |

La liste est aussi affichée sur la page de connexion.

## Ce qui fonctionne déjà de bout en bout

- Authentification par identifiant + mot de passe (Super Admin, tous les rôles
  internes, et clients), sessions signées, routes protégées par rôle
- **Super Admin** : créer un promoteur, activer/suspendre son abonnement
  (paiement hors plateforme, par virement — pas de page de paiement en ligne)
- **Directeur Commercial** : créer un projet, saisir son tableau de biens, créer
  des recrues (Commercial / Responsable Commercial / Responsable Administratif)
- **PDG** : bloquer un bien avec un commentaire privé, recevoir les propositions,
  accepter / refuser / négocier
- **Commercial** : consulter les projets et biens, créer un client (identifiant +
  mot de passe générés), envoyer une proposition avec échéancier 40/20/20/20
  modifiable, gérer ses prospects (Contacté / Retour client)
- **Responsable Administratif** : voir les contrats générés après acceptation
  d'une proposition, les vérifier et les confirmer
- **Assistant Administratif** : vue d'ensemble des prospects par commercial,
  bouton de relance
- **Espace Client** : liste des biens possédés, échéancier de paiement avec
  barre d'avancement, statut du contrat, contact WhatsApp du commercial
- Notifications automatiques entre rôles (cloche en haut à droite du dashboard)

## Ce qui reste à construire

Le modèle de données (`src/db/schema.ts`) couvre déjà **toutes** les entités du
cahier des charges. Les pages suivantes existent comme placeholders lisant déjà
les vraies données, à compléter avec les actions manquantes :

- Paiements (validation comptable, génération de reçu PDF)
- Désistements (vérification, remboursement)
- Service après-vente (livraison, syndic, visites, photos d'avancement)
- Recouvrement (relance, ajout de paiement pour le compte du client)
- Trésorerie (Directeur Financier)
- Espace Client : upload de pièces, téléchargement PDF du contrat, demande de
  photos, prise de rendez-vous, demande de visite, ajout de paiement

**Voir [PROMPTS.md](./PROMPTS.md)** pour une séquence de prompts prêts à copier
dans Claude Code, module par module, dans l'ordre recommandé.

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
    layout/                  Sidebar, NotificationBell, TodoModule
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

## Migrer vers PostgreSQL pour la production

1. `npm install pg` puis remplacer `drizzle-orm/libsql` (et `@libsql/client`) par
   `drizzle-orm/node-postgres` dans `src/db/client.ts`
2. Adapter `src/db/schema.ts` : `sqliteTable` → `pgTable`, `integer(..., {mode:
   "timestamp"})` → `timestamp(...)`, `integer(..., {mode: "boolean"})` →
   `boolean(...)`
3. `drizzle.config.ts` : `dialect: "postgresql"` + `dbCredentials.url` pointant
   vers votre base Postgres
4. `npm run db:push`

Le reste du code (requêtes Drizzle, Server Actions) ne change pas.
#   P r o m o P r o  
 