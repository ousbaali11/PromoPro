# Sécurité — checklist de mise en production

État vérifié à la fin de la Phase 12 (revue de `src/proxy.ts` et de chaque
Server Action). Les cases cochées sont en place dans le code ; les points
« à faire au déploiement » relèvent de l'exploitation.

## Secrets et configuration

- [x] `JWT_SECRET` obligatoire en production : sans lui (ou s'il fait moins de
      16 caractères), `src/lib/auth.ts` refuse de signer ou vérifier toute
      session (erreur explicite dès la première requête). Une valeur de repli
      n'existe qu'en développement, avec un avertissement dans la console.
- [x] `CRON_SECRET` exigé par `/api/cron/*` en production (`Authorization:
      Bearer`), sinon 401 ; sans variable définie en production : 500 explicite.
- [x] Aucun secret dans le dépôt : `.env*` est ignoré par git ; `.env.example`
      ne contient que des valeurs de développement.
- [x] Cookie de session `httpOnly`, `sameSite=lax`, `secure` en production,
      expiration 7 jours, signé HS256 (`jose`).
- [ ] **Au déploiement** : générer `JWT_SECRET` (`openssl rand -base64 48`) et
      `CRON_SECRET`, les stocker dans le gestionnaire de secrets de la
      plateforme, jamais dans un fichier commité.
- [ ] **Au déploiement** : changer les mots de passe des comptes de
      démonstration ou ne pas exécuter `npm run db:seed` en production.

## Authentification et rate-limiting

- [x] Mots de passe hachés avec bcrypt (coût 10), jamais stockés en clair.
- [x] Rate-limiting sur `/login` (`src/lib/rate-limit.ts`) : 5 échecs par
      identifiant et 30 par adresse IP sur 15 minutes, message avec délai de
      réessai ; compteur remis à zéro à la connexion réussie.
- [x] Message d'erreur identique que l'identifiant existe ou non (pas
      d'énumération de comptes).
- [x] Comptes internes désactivables (`users.actif`) ; l'abonnement du
      promoteur doit être `ACTIF` pour que ses utilisateurs se connectent.
- [ ] **Multi-instances** : le limiteur est en mémoire ; derrière plusieurs
      instances, le remplacer par un store partagé (Redis) en gardant
      l'interface `estBloque / enregistrerEchec / reinitialiser`.

## Contrôle d'accès

- [x] `src/proxy.ts` : `/admin` réservé au Super Admin, `/dashboard` aux
      sessions internes, `/client` aux sessions client ; redirection vers
      `/login` sinon. Les routes `/api/*` vérifient elles-mêmes la session.
- [x] Chaque Server Action commence par `requireRole([...])`,
      `requireStaffSession()` ou `requireClientSession()` (revue exhaustive :
      admin, biens, clients, contrats, désistements, équipe, paiements,
      projets, propositions, prospects, recouvrement, rendez-vous, SAV,
      espace client, notifications, login).
- [x] Isolation multi-promoteur : toute lecture et toute mutation vérifie que
      l'enregistrement appartient au promoteur de la session (projet du bien,
      `clients.promoteurId`, commercial de la proposition…). Corrigé en
      Phase 12 : blocage/déblocage de bien et import de plan par le PDG /
      Directeur Commercial, ajout/suppression de bien, décisions du PDG sur
      les propositions, retour client sur un prospect, compteur de
      propositions du tableau de bord.
- [x] Isolation par client : un client ne lit que ses biens, paiements,
      documents, rendez-vous, visites, photos et syndic (`clientId` de la
      session comparé à chaque enregistrement).
- [x] Fichiers uploadés servis uniquement par `GET /api/files/...` avec
      session : un client n'obtient que les fichiers rattachés à son dossier,
      un utilisateur interne que ceux de son promoteur (`src/lib/file-access.ts`) ;
      un fichier orphelin n'est jamais servi. Noms de fichiers non devinables
      (UUID), extension et taille validées à l'upload, traversée de répertoire
      impossible (expression régulière stricte sur le nom).
- [x] Chemins de fichiers soumis par les formulaires revalidés côté serveur
      (`parsePublicPath`) avant enregistrement en base.
- [x] Les créneaux de visite, montants, dates et statuts sont validés côté
      serveur ; l'UI ne fait qu'aider la saisie.

## Données et fichiers

- [x] Stockage des fichiers isolé dans `src/lib/storage.ts` ; dossier
      configurable par `UPLOAD_DIR` (disque persistant en production).
- [x] Base SQLite par défaut ; PostgreSQL activé automatiquement par
      `DATABASE_URL` (`src/db/client.ts`, schéma miroir `src/db/schema.pg.ts`).
      `DATABASE_URL` contient un mot de passe : variable d'environnement de la
      plateforme uniquement, jamais dans un fichier commité.
- [ ] **Au déploiement** : sauvegardes régulières de la base et du dossier
      des fichiers ; TLS (HTTPS) terminé par le reverse proxy ou la plateforme.

## Points d'attention connus

- Les identifiants et mots de passe temporaires sont affichés une fois à
  l'écran à la création d'un compte (client ou recrue) : à transmettre par un
  canal sûr ; il n'y a pas d'envoi d'e-mail.
- Le rappel J-7 dépend d'un appel quotidien externe (voir README « Tâches
  planifiées »).
- Pas de journal d'audit des actions sensibles (validation de paiement,
  désistement) au-delà des colonnes `valideParId` / `traiteParId` ; à
  ajouter si la conformité l'exige.
