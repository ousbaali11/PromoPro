# Déployer PromoPro sur Railway

Ce guide suppose un projet Railway **existant** contenant déjà un service
**Postgres**, et le code poussé sur un dépôt **GitHub**. L'application est
construite avec le `Dockerfile` du dépôt (Next.js 16 en mode `standalone`)
et exposée sur le port `3000`.

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
lancez qu'à l'initialisation, jamais sur une base en exploitation. Pour une
base vierge sans données de démo, faites seulement `db:push` puis créez le
premier promoteur avec le compte Super Admin… qui est lui-même créé par le
seed : dans ce cas, lancez le seed puis supprimez le promoteur de démo depuis
`/admin` (ou changez immédiatement les mots de passe de démo).

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

## 7. Mises à jour

Chaque `git push` sur la branche liée déclenche un build et un déploiement.
Si vous modifiez `src/db/schema.sqlite.ts` :

1. `npm run db:pg-schema` (régénère `schema.pg.ts`) et commitez les deux fichiers ;
2. après le déploiement, `railway ssh` puis `npm run db:push` pour appliquer
   la migration sur la base PostgreSQL (drizzle-kit affiche les changements et
   demande confirmation ; relisez-les avant d'accepter — une suppression de
   colonne perd ses données).

## Dépannage

| Symptôme | Cause probable | Correction |
|---|---|---|
| Logs : `JWT_SECRET manquant ou trop court` | variable absente | définir `JWT_SECRET` (≥ 16 caractères) |
| Logs : `getaddrinfo ENOTFOUND postgres.railway.internal` | app et Postgres dans des projets différents, ou variable non référencée | utiliser `DATABASE_PUBLIC_URL` du service Postgres, ou déplacer le service dans le même projet |
| `EACCES … /app/storage` | volume appartenant à root | `RAILWAY_RUN_UID=0` puis redéployer |
| Uploads perdus après déploiement | volume non monté sur `/app/storage` | vérifier le mount path et `UPLOAD_DIR` |
| Healthcheck en échec | mauvais chemin ou port | `/api/health`, port cible `3000` |
| `relation "users" does not exist` | base non initialisée | étape 4 (`npm run db:push`) |
