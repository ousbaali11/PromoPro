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

Le promoteur de démonstration s'appelle **Résidences Atlas** : tout ce qui est
adressé à ses clients (espace client, contrats, reçus, autorisations) porte ce
nom, jamais celui de la plateforme.

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

- Recherche globale du dashboard (Ctrl/Cmd+K ou bouton de l'en-tête) : biens,
  clients et projets du promoteur courant, résultats groupés avec lien vers la
  fiche, mêmes règles de cloisonnement que les pages ; export CSV (Excel) des
  tableaux clients, paiements, contrats, propositions, prospects et recouvrement
- Authentification par identifiant + mot de passe (Super Admin, tous les rôles
  internes, clients), sessions signées, routes protégées par rôle,
  rate-limiting sur la connexion, notifications (cloche) pour le staff **et**
  les clients
- **Super Admin** : créer un promoteur avec ses trois directions (PDG,
  Directeur Commercial, Directeur Financier), lui associer un logo optionnel
  (PNG / JPG, à la création ou depuis la liste : repris en en-tête des
  contrats, reçus, autorisations de visite et de l'espace client — sinon
  en-tête texte au nom du promoteur), activer/suspendre son abonnement
  (la suspension coupe immédiatement toutes les sessions du promoteur, staff et
  clients ; la date d'échéance de l'abonnement est affichée mais n'est pas
  bloquante : seul le statut compte)
- **Directeur Commercial** : projets (dont le délai des travaux modificatifs)
  et tableau de contenance (bouton « Dupliquer » sur une fiche bien : nouveau
  lot du même projet avec nature, prix et surface repris), plans de chaque bien (2D PDF/image, modèle 3D
  .glb/.gltf, lien de visite virtuelle), recrutement de son pôle (commercial, responsable
  commercial, responsable administratif, assistant administratif, SAV)
- **PDG** : blocage de biens avec commentaire privé ; accepter / refuser /
  négocier les propositions
- **Commercial** : clients (avec scan de pièce d'identité), propositions avec
  échéancier 40/20/20/20 modifiable (total 100 % et dates non passées
  vérifiés), saisie d'une tranche avec preuve (la première par défaut, ou
  toute tranche non soldée : versements fractionnés),
  désistement (bien remis à zéro, historique « Biens désistés »), prospects
- **Responsable Administratif** : contrat PDF généré à la confirmation, dépôt
  de la 4e copie signée, désistements (vérification, remboursement), dossiers
  livrés à transmettre au notaire, rendez-vous
- **Comptable Interne** : référencement et validation des paiements avec reçu
  PDF et mise à jour de l'échéancier (trop-perçu reporté), syndic à valider,
  biens vendus par commercial
- **Directeur Financier** : trésorerie (total du jour, à 7 jours, chèques
  encaissés / à venir, virements, échéances à venir, remboursements,
  projection à 30, 60 et 90 jours des échéances connues des ventes en cours en
  barres empilées par projet — projection théorique, retards non anticipés),
  recrutement de son pôle (comptable interne, recouvrement)
- **Service Après-Vente** : rendez-vous, demandes de visite (autorisation PDF,
  créneaux contrôlés), photos d'avancement, travaux modificatifs acquéreurs
  (chiffrage et devis, suivi des travaux), livraison (double confirmation),
  syndic
- **Recouvrement** : échéanciers de toutes les ventes avec filtres de période,
  paiement constaté pour le compte du client, rendez-vous
- **Assistant Administratif** : import Excel des prospects avec aperçu et
  répartition équilibrée entre commerciaux, suivi par commercial, relance
- **Espace Client** : par bien (cloisonné) — échéancier et avancement, ajout de
  paiement avec preuve, contrat / copie signée / plan / reçus, photos
  d'avancement (1 demande / 6 mois), plans 2D / 3D / visite virtuelle,
  demandes de modification du bien (TMA) et acceptation des devis, visite,
  livraison, syndic ; rendez-vous
  avec chaque service ; contact des services ; rappel J-7 avant échéance

## Fiche client : point d'entrée unique de gestion

La fiche d'un client (`/dashboard/clients/<id>`) regroupe, bien par bien
(sélecteur en haut si le client en a plusieurs ou s'est désisté de l'un
d'eux), quatre onglets : **Contrat**, **Échéancier & Paiements**, **Travaux
modificatifs**, **Documents**. C'est là que se font la confirmation d'un
contrat, le dépôt de la copie signée, la transmission au notaire, la
vérification et le remboursement d'un désistement, la validation comptable
d'un paiement ou d'un syndic, le chiffrage et le suivi des travaux
modificatifs. Les pages Contrats, Paiements, Désistements et SAV listent les
dossiers en attente ou récents et renvoient vers la fiche : aucune action ne
s'exerce depuis une liste.

## Contrat par sections

Sur la fiche client (onglet Contrat), le Responsable Administratif édite le
contrat d'un dossier comme un document : des sections de texte simple, déjà
remplies avec les données du dossier à la création, à modifier, réordonner,
supprimer ou compléter librement, puis « Générer le PDF » (la première
génération confirme le contrat, les suivantes archivent la version
précédente, consultable). Le modèle dont partent les nouveaux contrats se
gère sur un écran séparé (« Gérer le modèle par défaut ») : le texte se tape
librement et les champs dynamiques (nom du client, prix du bien…) s'insèrent
par un bouton sous forme d'étiquettes, jamais en syntaxe spéciale. Un
contrat, même confirmé, reste modifiable ; sa suppression est douce
(historique conservé, annulable 8 s) et un nouveau contrat peut être créé
aussitôt pour le même bien et le même client. Migration des données de la
première version : `npm run migrer:contrats-segments` (voir DEPLOY.md).

## Échéancier flexible

À la proposition, le commercial compose librement l'échéancier (ajout ou
retrait de tranches, 40/20/20/20 par défaut, total 100 % imposé). Après la
vente, il peut le modifier depuis la fiche client, uniquement sur les tranches
encore en attente : une tranche payée ou partielle n'est jamais supprimée ni
réduite sous ce qui a été payé, le total reste 100 % du prix, chaque
modification est journalisée avant → après et le client est prévenu.

## Tableau de bord : plage de dates et graphiques

Chaque rôle interne dispose en haut à droite de son tableau de bord d'un
sélecteur de plage (préréglages en un clic, plage relative, plage
personnalisée ; dernier choix mémorisé) qui alimente des totaux et deux
graphiques (barres et courbe) adaptés au rôle : ventes et chiffre
d'affaires, prospects, encaissements réels, paiements validés, contrats,
demandes SAV. L'espace client n'en a pas.

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

## Comptes : suspension, suppression douce, journal d'activité

Aucun compte n'est jamais effacé. Un utilisateur interne ou un client peut être
**suspendu** (`actif = false`) ou **supprimé** (`deleted_at` renseigné) : dans
les deux cas la connexion est refusée et la session en cours est fermée, mais
toutes ses données (ventes, paiements, propositions, notifications) restent en
place et s'affichent normalement, le nom suivi d'un badge « (suspendu) » ou
« (compte supprimé) ». Les comptes supprimés sortent des listes actives
(Clients, Équipe) et restent consultables via « Voir les comptes supprimés »,
d'où ils peuvent être **réactivés** ; juste après une suspension ou une
suppression, un toast propose « Annuler » pendant 8 secondes.

Qui peut agir suit exactement la hiérarchie de création (`ROLES_GERABLES_PAR`
dans `src/lib/comptes.ts`) : chaque directeur pour son pôle, le Super Admin pour
les trois directions (tableau « Directions des promoteurs » de `/admin`), le
commercial gérant (ou la direction commerciale) pour ses clients — la suppression
d'un client ayant une vente ou une proposition en cours est refusée, seule la
suspension reste possible.

Chaque création, modification (avec le détail « avant → après »), suppression,
suspension et restauration est tracée dans la table `journal_activite`
(`src/lib/journal.ts`), consultable sur `/dashboard/journal` (PDG, directeurs,
lecture seule) et `/admin/journal` (Super Admin, tous promoteurs), filtrable par
type d'action et par période.

## Prospects : import Excel et répartition équilibrée

L'Assistant Administratif importe un classeur `.xlsx` / `.xls` depuis
`/dashboard/prospects` (« Importer un fichier Excel »). Le fichier est lu **en
mémoire** côté serveur par SheetJS (paquet `xlsx`, installé depuis le CDN
officiel `cdn.sheetjs.com` : la version publiée sur npm n'est plus maintenue)
et n'est jamais écrit sur le disque : il ne contient que des données de travail
dont la base devient la référence, et rien ne justifie d'en conserver une copie
(données personnelles de tiers). Le corps des Server Actions est relevé à 5 Mo
dans `next.config.ts` (fichier limité à 4 Mo, 5 000 lignes).

Colonnes attendues sur la première feuille, **ordre libre, casse et accents
ignorés** : `nom`, `telephone` (obligatoires), `source` (facultative, « Non
précisée » à défaut) — alias tolérés dans `ALIAS_COLONNES` de
`src/lib/prospects.ts`. Une ligne sans téléphone, sans nom, en doublon dans le
fichier ou dont le téléphone est déjà connu chez le promoteur est **ignorée et
comptée avec son motif**, sans faire échouer l'import.

L'aperçu (aucune écriture à ce stade) affiche le nombre de prospects valides,
les lignes ignorées et la **répartition prévue** : pour chaque commercial ou
responsable commercial actif du promoteur, sa charge actuelle (prospects
« non contactés »), les nouveaux attribués et le total. L'algorithme
(`repartitionEquilibree`, fonction pure testée unitairement) donne chaque
nouveau prospect au commercial dont le total courant est le plus bas ; à
l'arrivée l'écart entre le plus chargé et le moins chargé est au plus de 1 dès
que le lot suffit à combler les écarts de départ. « Confirmer l'import »
recalcule la répartition sur les charges du moment, crée les prospects
(`NON_CONTACTE`), notifie chaque commercial concerné du nombre reçu et trace
l'import au journal d'activité (action « Import », total, détail par
commercial, lignes ignorées). Le suivi existant (Contacté / Retour client /
Relancer) est inchangé.

## Travaux modificatifs acquéreurs (TMA) et plans enrichis

Un client peut demander une modification de son bien (cloison, prise,
revêtement…) depuis la fiche du bien de son espace, avec une photo ou un
croquis facultatif. La fenêtre de dépôt court jusqu'à `projets.delai_tma_jours`
(60 par défaut, modifiable par le Directeur Commercial sur « Modifier » du
projet) après le **blocage** du bien — la date d'acceptation de la proposition —
et se ferme à la livraison ; la date limite est figée sur chaque demande.

Le Service Après-Vente (pôle déjà en charge de l'après-vente : visites, photos,
livraison) voit les demandes sur `/dashboard/sav`, les **chiffre** (montant +
devis PDF) ou les **refuse** avec un motif ; le client est notifié, voit le devis
et coche « J'accepte ce devis », ce qui passe la demande à « Devis accepté » et
notifie l'auteur du devis ; le SAV fait ensuite avancer les travaux
(« en cours », « terminés »), chaque étape notifiant le client. Statuts :
`DEMANDE → CHIFFRE → SIGNE → EN_COURS → TERMINE` (ou `REFUSE`), règles dans
`src/lib/tma.ts`, table `demandes_tma`, tout est tracé au journal d'activité.

**Limitation à connaître** : l'acceptation du devis est une case cochée et
horodatée (`signature_client_at`), pas une signature électronique au sens
juridique (aucun certificat ni archivage probant). Pour une valeur légale, il
faudra brancher un prestataire de signature qualifiée.

Le fichier `tests/fixtures/cube.glb` (cube texturé, 2 Ko) est généré par
`node scripts/generer-cube-glb.mjs` ; il sert au test de rendu 3D.

Les plans d'un bien sont désormais trois champs : `plan_url` (plan 2D, image ou
PDF, inchangé), `plan_3d_url` (modèle `.glb` / `.gltf`, jusqu'à 50 Mo, affiché
par le composant web `<model-viewer>` de Google chargé depuis son CDN, sans
dépendance npm) et `visite_virtuelle_url` (lien `https://` externe, affiché
dans une iframe isolée avec lien d'ouverture). La fiche bien, côté staff comme
côté client, n'affiche que les onglets renseignés (`PlansBien`).

## Dépôts de fichiers : règles côté serveur

`POST /api/upload` n'accepte qu'un compte connecté **et actif**, contrôle
l'extension et la taille **par type** (10 Mo ; 50 Mo et `.glb` / `.gltf` pour
`plans-3d`), vérifie la signature du contenu (un HTML nommé `.png` est
refusé), réserve certains types au staff (un client ne dépose que preuves de
paiement, pièce du porteur et croquis TMA) et limite chaque compte à 30
dépôts par 10 minutes. Les fichiers sont servis par `GET /api/files/...`
après contrôle de rattachement, avec `X-Content-Type-Options: nosniff`.
Détail, tableau des types et limites de débit : SECURITY.md.

## Fichiers uploadés en production

Les fichiers (pièces d'identité, preuves de paiement, PDF générés, photos)
sont écrits sur disque via `src/lib/storage.ts`, dans `storage/uploads/` par
défaut. En production, ce dossier doit être un **disque persistant** : montez
un volume et définissez `UPLOAD_DIR=/chemin/du/volume` (les chemins stockés en
base ne changent pas). Au démarrage, le serveur vérifie que ce dossier est
inscriptible et l'écrit dans les logs (`[stockage] …`) ; l'image Docker
attribue le volume à l'utilisateur `node` avant de lancer le serveur (un
volume Railway est monté en root : voir DEPLOY.md, « Piège : permissions »). Sur une plateforme sans disque persistant (serverless),
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
  (`src/db/guard.ts`), fenêtre et transitions des travaux modificatifs
  (`src/lib/tma.ts`), analyse des lignes et répartition équilibrée des
  prospects (`src/lib/prospects.ts`), limites de débit
  (`src/lib/rate-limit.ts`), filtrage des données personnelles avant envoi à
  Sentry (`src/lib/sentry-filtre.ts`), état de santé (`src/lib/health.ts`),
  règles de stockage — extensions et tailles par
  type, signature du contenu, chemins publics et traversée de répertoire
  (`src/lib/storage.ts`).
- **Bout en bout** (`tests/e2e/`) : `test:e2e:setup` recrée `data/test.db`
  (schéma + seed de démo) avec `DATABASE_URL` forcé à vide, puis Playwright
  démarre lui-même `next dev` sur le port 3100 en mode SQLite forcé
  (`SQLITE_PATH=data/test.db`) et joue, spec par spec : connexion de chaque
  rôle et refus d'un mauvais mot de passe ; contrôle d'accès (PDG hors
  Équipe, Commercial hors `/admin`, client hors `/dashboard`) ; recrutement
  par pôle (statuts proposés, rôle forcé refusé) ; workflow de vente (projet
  → blocage PDG → proposition → acceptation → « Vendu » → notification) ;
  paiements (saisie commerciale → validation comptable → reçu → contrat
  régénéré → espace client) ; désistements (bien remis à zéro, vérification,
  remboursement) ; espace client (rendez-vous, visite et créneaux, paiement
  avec trop-perçu, photos d'avancement) ; prospects (`prospects.spec.ts` :
  classeurs générés à la volée, lignes ignorées avec motif, aperçu puis import
  de 10 prospects avec écart final ≤ 1 vérifié dans l'aperçu et sur la page,
  notification et tableau du commercial, journal) ; isolation
  multi-promoteur (`isolation.spec.ts` : un second promoteur est créé de
  toutes pièces, puis le staff du promoteur de démo tente d'atteindre ses
  biens, clients, fichiers, journal et demandes par URL directe, arguments
  de Server Action substitués et route de restauration — tableau appelant ×
  cible × réponse dans SECURITY.md ; session suspendue refusée par les
  routes API ; règles de dépôt de fichiers et limite de débit) ; rendu 3D
  (`plans3d.spec.ts` : dépôt du cube `tests/fixtures/cube.glb`, onglet
  « Modèle 3D », modèle effectivement chargé par `<model-viewer>` — a besoin
  du réseau pour le CDN Google) ; serveur de production (`production.spec.ts` :
  `next start` sur le build, les points de test d'erreur Sentry `/api/test-erreur`
  et `/dev/test-erreur` répondent 404, témoin 500 / 200 en développement — le
  build doit précéder la suite) ; travaux modificatifs
  (`modificatifs.spec.ts` : demande client → devis SAV → acceptation → travaux,
  notifications à chaque étape, date limite suivant le délai du projet) ;
  SAV (livraison, notaire, syndic) ;
  recouvrement (filtres, paiement pour le compte du client, trésorerie) ;
  accessibilité (`accessibilite.spec.ts`) : analyse axe-core WCAG A/AA de
  chaque famille de composant au repos et en état ouvert (login, admin,
  tableau de bord, biens grille/liste, modale, menu déroulant, contrôle
  segmenté, espace client) — les violations *critical* / *serious* font
  échouer le test, *minor* / *moderate* sont seulement journalisées
  (`tests/e2e/a11y.ts`) — plus piège et retour de focus des modales,
  navigation clavier des menus et segments, `aria-sort` des tableaux,
  région `aria-live` des toasts, étiquettes flottantes associées, actions
  révélées au focus, et respect de `prefers-reduced-motion` (contexte
  Playwright émulé) ;
  audit mobile (`mobile.spec.ts`) : chaque page — connexion, tableaux de
  bord des onze rôles internes, administration, projets (grille et liste),
  fiche bien, fiche client et ses quatre onglets, éditeurs de contrat et de
  modèle, propositions, équipe, prospects (assistant et commercial), SAV,
  recouvrement, finance, journal, espace client — visitée à 320, 375 et
  768 px avec interaction réelle (tiroir de navigation, menus déroulants,
  modale, panneaux du sélecteur de plage et de l'import, formulaires remplis
  et soumis à 375 px avec message d'erreur affiché, liste dynamique de
  tranches et éditeur de contrat par sections) ; à chaque étape : aucun
  débordement horizontal (`scrollWidth` ≤ largeur de la fenêtre) et boutons,
  champs et panneaux entièrement dans la fenêtre. Le spec crée son propre jeu
  de données à 375 px (deux biens, un client, deux propositions acceptées)
  pour parcourir les chemins de succès réels — paiement, import de prospects
  confirmé, syndic, encaissement, demande de modification, devis, rendez-vous,
  livraison, visite, photos —, l'accueil de l'espace client à plusieurs biens,
  la recherche globale, les modales Bloquer / Supprimer et Négocier, et les
  éditeurs à 320 px ; il nettoie par désistement traité jusqu'au remboursement.
  Les contrastes de la palette se vérifient à part, sans navigateur :
  `npm run check:contrast` lit les tokens de `src/app/globals.css` et
  calcule le ratio WCAG de chaque paire d'usage (texte 4,5:1, graphique
  3:1) ; il échoue si une paire passe sous son seuil (joué aussi en CI).
  Les specs partagent la base recréée au début du run et tournent en série
  dans l'ordre alphabétique des fichiers : chacune n'agit que sur « ses »
  tranches ou biens pour rester indépendante des autres.
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

## Test de charge

`npm run charge` (autocannon, `scripts/charge.ts`) : une vingtaine de
connexions simultanées en lecture seule sur `/dashboard/projets`,
`/dashboard/propositions` et `/client` contre un serveur de production **local**
(`next start`, base SQLite jetable, jamais Railway). Méthode, commandes exactes
et mesure de référence dans PERFORMANCE.md.

## Pages légales (structure provisoire)

`/mentions-legales` et `/politique-confidentialite`, publiques, liées en pied
de page de `/login` : structure standard (éditeur à compléter, hébergement,
données réellement collectées par l'application, finalités, conservation,
droits, sécurité, cookies) avec un bandeau « CONTENU À FAIRE VALIDER PAR UN
JURISTE AVANT PUBLICATION — texte provisoire » et des passages « [À compléter] ».
Ce n'est pas un contenu juridique définitif. Gabarit :
`src/components/legal/PageLegale.tsx` ; test : `legal.spec.ts` (accès sans
session, bandeau, sections, liens, axe).

## Déploiement

Suivi des erreurs : Sentry (`@sentry/nextjs`), activé par la seule variable
`SENTRY_DSN`, environnement tagué, données personnelles filtrées avant envoi
(SECURITY.md « Suivi des erreurs ») ; route de test `/api/test-erreur` et page
`/dev/test-erreur` en développement uniquement (404 en production, vérifié par
`production.spec.ts`). Mise en place : DEPLOY.md « 11 ».


Sauvegardes quotidiennes de la base de production et vérification hebdomadaire
de restauration : workflows GitHub Actions `backup-db.yml` et
`backup-restore-check.yml`, procédure de restauration d'urgence dans DEPLOY.md
(section « Sauvegardes »).


Le projet se construit en image Docker (`Dockerfile`, build Next.js
`standalone`) avec une sonde de vie `GET /api/health` (200 si la base répond
à `SELECT 1` en 2,5 s, 503 sinon ; à brancher sur une surveillance externe,
voir DEPLOY.md « Surveillance »). Le pas-à-pas Railway
(repo GitHub, variables, volume persistant, initialisation de la base) est
dans **[DEPLOY.md](./DEPLOY.md)**.

## Sécurité

Voir [SECURITY.md](./SECURITY.md) : secrets obligatoires en production
(`JWT_SECRET`, `CRON_SECRET`), rate-limiting du login, contrôle d'accès par
rôle et par promoteur sur chaque action, fichiers servis uniquement aux ayants
droit.
#   P r o m o P r o  
 