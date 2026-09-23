# Déployer PromoPro sur Railway

Ce guide suppose un projet Railway **existant** contenant déjà un service
**Postgres**, et le code poussé sur un dépôt **GitHub**. L'application est
construite avec le `Dockerfile` du dépôt (Next.js 16 en mode `standalone`)
et exposée sur le port `3000`.

État de validation (22/09/2026) : la bascule PostgreSQL a été exécutée et
vérifiée en local contre le service Postgres Railway de ce projet
(PostgreSQL 18, URL publique `*.proxy.rlwy.net`) : `npm run db:push`,
`npm run db:seed`, `npm run build`, `npm run dev`, connexion PDG et client,
navigation et mutations (acceptation d'une proposition, confirmation d'un
contrat avec génération de PDF). Le `docker build` n'a pas pu être testé
(Docker absent de la machine de développement) : le premier déploiement
Railway en tient lieu — surveillez les logs de build.

Résumé du résultat attendu : un service « web » relié au dépôt GitHub, un
volume monté sur `/app/storage`, trois variables (`DATABASE_URL` injectée,
`JWT_SECRET`, `UPLOAD_DIR`), la base initialisée une seule fois, et
`https://<votre-domaine>/api/health` qui répond `{"ok":true}`.

---

## 0. Prérequis

- Le dépôt GitHub contient bien `Dockerfile`, `.dockerignore`, `next.config.ts`
  avec `output: "standalone"` et `src/app/api/health/route.ts` (Phase 13).
- Le service Postgres existe dans le projet Railway (onglet **Variables** du
  service Postgres : vous y voyez `DATABASE_URL`, `DATABASE_PUBLIC_URL`,
  `PGHOST`, `PGPASSWORD`…).
- Optionnel mais pratique : la CLI Railway (`npm i -g @railway/cli`, puis
  `railway login`) pour ouvrir un shell dans le conteneur (`railway ssh`).

## 1. Créer le service web depuis GitHub

1. Ouvrez le projet Railway → bouton **+ New** (ou **Create**) → **GitHub Repo**.
2. Autorisez Railway à accéder au dépôt si ce n'est pas déjà fait, puis
   sélectionnez le dépôt PromoPro et la branche à déployer (`main`).
3. Railway détecte le `Dockerfile` à la racine et l'utilise pour construire
   l'image (vérifiez dans **Settings → Build** que le *Builder* est bien
   **Dockerfile**, pas Nixpacks/Railpack).
4. Dans **Settings → Networking**, cliquez **Generate Domain** pour obtenir une
   URL publique `https://<service>.up.railway.app` (port cible : `3000`).
5. Dans **Settings → Deploy**, renseignez le *Healthcheck Path* : `/api/health`
   (Railway attend un 200 avant de basculer le trafic sur un nouveau déploiement).

Le premier build démarre automatiquement ; il échouera au démarrage tant que
`JWT_SECRET` n'est pas défini (erreur explicite « JWT_SECRET manquant » dans
les logs) — c'est attendu, passez à l'étape 2.

## 2. Variables d'environnement

Onglet **Variables** du service web :

| Variable | Valeur | Remarque |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Référence de variable Railway : injectée automatiquement si vous cliquez **Add Variable Reference** et choisissez `DATABASE_URL` du service Postgres. Hôte `postgres.railway.internal`, réseau privé, sans TLS. |
| `JWT_SECRET` | sortie de `openssl rand -base64 48` | **Obligatoire** : sans lui l'application refuse toute session en production. |
| `UPLOAD_DIR` | `/app/storage` | Dossier des fichiers uploadés = point de montage du volume (étape 3). Déjà la valeur par défaut de l'image, mais explicite = plus sûr. |
| `CRON_SECRET` | sortie de `openssl rand -base64 32` | Requis par `/api/cron/rappels-echeance` (rappel J-7) ; voir étape 6. |
| `RAILWAY_RUN_UID` | `0` | **Seulement si** les logs montrent `EACCES` sur `/app/storage` : l'image tourne sous l'utilisateur `node`, et un volume fraîchement créé peut appartenir à `root`. Cette variable fait tourner le conteneur en root (voir la doc Railway « Volumes »). |

`PORT` est fourni par Railway (l'image écoute sur `PORT`, 3000 par défaut).
Ne définissez **pas** `PGSSLMODE` avec l'hôte interne (pas de TLS sur le
réseau privé Railway).

Après avoir ajouté les variables, Railway redéploie automatiquement.

## 3. Volume persistant pour les fichiers

Les pièces d'identité, preuves de paiement, PDF générés et photos sont écrits
sur disque : sans volume, ils disparaissent à chaque déploiement.

1. Sur le canevas du projet : **+ New** → **Volume** (ou clic droit sur le
   canevas → **Volume**).
2. Attachez le volume au service **web** (sélection du service dans la
   fenêtre de création, ou glisser-déposer le volume sur le service).
3. **Mount path** : `/app/storage` — exactement la valeur de `UPLOAD_DIR`.
4. Redéployez si Railway ne l'a pas fait tout seul. Dans les logs de
   déploiement, aucune erreur `ENOENT` / `EACCES` ne doit apparaître ; en cas
   d'`EACCES`, ajoutez `RAILWAY_RUN_UID=0` (voir tableau ci-dessus).

Vérification : après un upload (ex. création d'un client avec pièce
d'identité), `railway ssh` puis `ls /app/storage/pieces-identite` montre le
fichier ; il survit à un redéploiement.

## 4. Initialiser la base (une seule fois)

À faire après le **premier déploiement réussi** (service « Active »). L'image
contient les sources, `drizzle-kit` et `tsx` : les commandes s'exécutent dans
le conteneur, avec `DATABASE_URL` déjà injecté.

```bash
railway link            # choisir le projet, l'environnement, puis le service web
railway ssh             # ouvre un shell dans le conteneur du service web
npm run db:push         # crée les tables PostgreSQL (schema.pg.ts) — répondre « yes » si demandé
npm run db:seed         # jeu de démonstration : un compte par rôle, un projet, une vente
exit
```

`npm run db:seed` **vide toutes les tables** avant d'insérer la démo : ne le
lancez qu'à l'initialisation, jamais sur une base en exploitation.

Pour une base **vierge, sans données de démo** (recommandé en production) :
faites seulement `npm run db:push`, puis créez le premier compte Super Admin
avec vos propres identifiants (aucune valeur par défaut) :

```bash
npm run create-admin -- ADMIN-PROD 'un-mot-de-passe-solide'   # --nom / --prenom facultatifs
```

Le mot de passe (10 caractères minimum) est haché avec bcrypt et n'est jamais
affiché. Connectez-vous ensuite sur `/login` avec cet identifiant pour créer
le premier promoteur et son PDG depuis `/admin`.

Alternative sans `railway ssh` (validée en développement) : depuis votre
machine, mettez l'URL **publique** de la base dans `.env.local`
(`DATABASE_URL=<valeur de DATABASE_PUBLIC_URL du service Postgres>`), puis
`npm run db:push` et `npm run db:seed` en local ; retirez ensuite la variable
pour revenir en SQLite.

## 5. Vérifier

- `https://<votre-domaine>/api/health` → `{"ok":true}`.
- `https://<votre-domaine>/login` → connexion avec `PDG-DEMO` / `demo1234`,
  puis `CL-DEMO` / `demo1234` pour l'espace client.
- Logs du service : aucune ligne `JWT_SECRET`, `ECONNREFUSED` ou `EACCES`.
- **Changez les mots de passe de démonstration** (ou supprimez ces comptes)
  avant d'ouvrir l'accès aux utilisateurs réels (voir `SECURITY.md`).

## 6. Rappel J-7 (tâche planifiée)

La route `GET /api/cron/rappels-echeance` doit être appelée une fois par jour
avec `Authorization: Bearer $CRON_SECRET`. Sur Railway, créez un second
service **Cron** (bouton **+ New** → **Empty Service**, puis **Settings →
Cron Schedule** : `0 8 * * *`) dont la commande de démarrage est :

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<votre-domaine>/api/cron/rappels-echeance
```

(image de base avec `curl`, par exemple `curlimages/curl`, et la variable
`CRON_SECRET` référencée depuis le service web : `${{web.CRON_SECRET}}`). Tout
autre planificateur externe (GitHub Actions `schedule`, cron d'un serveur)
convient aussi.

## 7. Intégration continue (signal avant déploiement)

`.github/workflows/test.yml` lance, à chaque push ou pull request sur `main` :
`npm run lint`, `npm run build`, `npm run test` (unitaires) et
`npm run test:e2e` (Playwright sur une base SQLite jetable, jamais la
production). Un échec apparaît dans l'onglet **Actions** de GitHub et sur le
commit, en général quelques minutes avant que Railway n'ait fini de
construire l'image.

Ce que ça garantit : un build cassé, une règle d'accès ou un flux de vente
régressé sont détectés par une commande, pas découverts en production. Ce que
ça ne remplace pas : la vérification manuelle du déploiement (`/api/health`,
connexion, logs Railway — étape 5), les migrations de schéma (`db:push`) et
tout ce qui dépend de PostgreSQL ou du volume, que les tests n'exercent pas.
Pour bloquer le déploiement tant que la CI est rouge, activez dans Railway
**Settings → Deploy → Wait for CI** (« Check Suites ») sur le service web.

## 8. Mises à jour

Chaque `git push` sur la branche liée déclenche un build et un déploiement.
Si vous modifiez `src/db/schema.sqlite.ts` :

1. `npm run db:pg-schema` (régénère `schema.pg.ts`) et commitez les deux fichiers ;
2. après le déploiement, `railway ssh` puis `npm run db:push` pour appliquer
   la migration sur la base PostgreSQL (drizzle-kit affiche les changements et
   demande confirmation ; relisez-les avant d'accepter — une suppression de
   colonne perd ses données).

Changements de schéma en attente sur la base Railway au moment d'écrire ces
lignes (à appliquer avant le prochain déploiement, tous additifs) : table
`epingles`, colonnes `users.deleted_at`, `clients.actif`, `clients.deleted_at`,
table `journal_activite`, colonnes `biens.plan_3d_url`, `biens.visite_virtuelle_url`,
`projets.delai_tma_jours`, table `demandes_tma`.

## 9. Sauvegardes

Deux workflows GitHub Actions, sans rien installer sur Railway :

- **Sauvegarde de la base** (`.github/workflows/backup-db.yml`) : tous les jours
  à 03:00 UTC, `pg_dump --format=custom` (déjà compressé) de la base de
  production, vérifié par `pg_restore --list`, publié comme **artefact du run**
  conservé **30 jours**.
- **Vérification de restauration** (`.github/workflows/backup-restore-check.yml`) :
  chaque dimanche à 04:00 UTC, le dernier dump est restauré dans une base
  PostgreSQL **jetable du job** (service `postgres` de GitHub Actions, jamais
  Railway) et les tables `users`, `biens` et `paiements` doivent contenir des
  lignes — un backup jamais restauré n'est pas vérifié. La liste des tables se
  règle dans `TABLES_OBLIGATOIRES` du workflow.

Les commandes vivent dans `scripts/db-backup.sh` et
`scripts/db-restore-check.sh` (utilisables aussi en local avec les outils
PostgreSQL installés).

### Mise en place (une fois)

1. Railway › service Postgres › **Variables** › copiez la valeur de
   `DATABASE_PUBLIC_URL` (l'URL publique, joignable depuis GitHub ; l'URL
   `*.railway.internal` ne l'est pas).
2. GitHub › dépôt › **Settings › Secrets and variables › Actions › New
   repository secret** : nom `RAILWAY_DATABASE_PUBLIC_URL`, valeur = l'URL.
   Elle n'apparaît jamais dans les workflows ni dans les journaux (GitHub la
   masque) ; ne l'écrivez nulle part dans le dépôt.
3. Lancez une première sauvegarde manuelle (ci-dessous) et vérifiez l'artefact.

Sans le secret, le job quotidien échoue avec un message explicite.

### Sauvegarde manuelle

Onglet **Actions** › « Sauvegarde de la base » › **Run workflow** › source
`railway` › Run. Ou en ligne de commande :

```bash
gh workflow run backup-db.yml -f source=railway
```

La source `auto-test` sauvegarde une base jetable du job initialisée avec le
schéma et la démo de l'application : elle éprouve toute la chaîne
(dump → artefact → restauration) sans le secret et sans toucher à Railway.

### Télécharger une sauvegarde

Onglet **Actions** › « Sauvegarde de la base » › ouvrez le run voulu › bloc
**Artifacts** en bas de page › `sauvegarde-postgres-<run>` (zip contenant
`promopro-<date>.dump`, son sommaire `.toc.txt` et `resume.txt`). En ligne
de commande :

```bash
gh run list --workflow backup-db.yml --status success --limit 5
```

```bash
gh run download <RUN_ID> --dir sauvegarde
```

### Vérifier une restauration à la demande

Onglet **Actions** › « Vérification de restauration » › **Run workflow**
(`run_id` vide = dernier run de sauvegarde réussi) ; le résumé du run liste
le nombre de lignes de chaque table restaurée.

```bash
gh workflow run backup-restore-check.yml -f run_id=<RUN_ID>
```

### Restauration d'urgence vers Railway

Prérequis : `pg_restore` et `psql` de la **même version majeure ou plus
récente** que le `pg_dump` du workflow (PostgreSQL 18) — outils PostgreSQL
installés, ou l'image officielle via Docker. Mettez le service web en pause
pendant l'opération (Railway › service web › Settings › *Sleep* / *Remove*
temporairement, ou redéployez après) : `--clean` supprime puis recrée chaque
table, l'application ne doit pas écrire pendant ce temps.

1. Récupérez le dump (ci-dessus) et l'URL publique de la base :

```bash
export RAILWAY_DATABASE_PUBLIC_URL='postgresql://postgres:MOT_DE_PASSE@HOTE.proxy.rlwy.net:PORT/railway'
```

2. Contrôlez le fichier avant de toucher à la base (liste des objets qu'il
   contient ; s'il n'affiche rien, ne continuez pas) :

```bash
pg_restore --list sauvegarde/promopro-*.dump | grep -c 'TABLE DATA'
```

3. Restaurez — chaque table est supprimée puis recréée avec les données du
   dump, le reste de la base n'est pas touché ; `--exit-on-error` arrête tout
   à la première anomalie :

```bash
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname "$RAILWAY_DATABASE_PUBLIC_URL" sauvegarde/promopro-*.dump
```

Sans outils installés, la même commande via Docker (le dossier `sauvegarde`
est monté dans le conteneur) :

```bash
docker run --rm -v "$PWD/sauvegarde:/s" -e RAILWAY_DATABASE_PUBLIC_URL postgres:18 sh -c 'pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname "$RAILWAY_DATABASE_PUBLIC_URL" /s/promopro-*.dump'
```

4. Contrôlez les tables clés, puis relancez le service web :

```bash
psql "$RAILWAY_DATABASE_PUBLIC_URL" -c "SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM biens) AS biens, (SELECT count(*) FROM paiements) AS paiements;"
```

Si le schéma a évolué depuis la sauvegarde (colonne ou table ajoutée après),
relancez `npm run db:push` après la restauration (section 8) : le dump
recrée les tables telles qu'elles étaient à la date de la sauvegarde.

Procédure répétée le 23 septembre 2026 avec les vrais outils (pg_dump /
pg_restore 18.1) sur une base PostgreSQL 18 jetable locale initialisée avec
le schéma et la démo : dump, suppression volontaire de lignes, restauration
par la commande ci-dessus, lignes revenues à l'identique. Railway n'autorisait
pas de base temporaire ce jour-là (limite du plan gratuit) ; la chaîne
GitHub complète a été éprouvée par un run `auto-test` puis une
« Vérification de restauration » sur ce run.

### Limite actuelle et évolution

Les artefacts GitHub sont gardés **30 jours** au plus et comptent dans le
quota de stockage Actions du compte (gratuit dans la limite du plan ; une
sauvegarde de démo pèse quelques dizaines de Ko, la taille suit celle de la
base). Il n'y a donc pas d'historique au-delà d'un mois ni de copie hors
GitHub. Si la base grossit nettement (plusieurs centaines de Mo) ou si une
rétention plus longue devient nécessaire, remplacez la publication en artefact
par un envoi vers un stockage objet (S3, Backblaze B2, Cloudflare R2) avec
une politique de rétention, en gardant `scripts/db-backup.sh` tel quel : seule
l'étape de publication change. À réévaluer à ce moment-là.

## Dépannage

| Symptôme | Cause probable | Correction |
|---|---|---|
| Logs : `JWT_SECRET manquant ou trop court` | variable absente | définir `JWT_SECRET` (≥ 16 caractères) |
| Logs : `getaddrinfo ENOTFOUND postgres.railway.internal` | app et Postgres dans des projets différents, ou variable non référencée | utiliser `DATABASE_PUBLIC_URL` du service Postgres, ou déplacer le service dans le même projet |
| `EACCES … /app/storage` | volume appartenant à root | `RAILWAY_RUN_UID=0` puis redéployer |
| Uploads perdus après déploiement | volume non monté sur `/app/storage` | vérifier le mount path et `UPLOAD_DIR` |
| Healthcheck en échec | mauvais chemin ou port | `/api/health`, port cible `3000` |
| `relation "users" does not exist` | base non initialisée | étape 4 (`npm run db:push`) |
