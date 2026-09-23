# Sécurité — checklist et revue systématique

État vérifié lors de la revue de sécurité du 23 septembre 2026 (toutes les
Server Actions, toutes les routes `src/app/api/`, pages de détail, stockage
des fichiers), qui prolonge la revue de la Phase 12. Les cases cochées sont
en place dans le code ; les points « au déploiement » relèvent de
l'exploitation. Les tests cités tournent à chaque `npm run test` /
`npm run test:e2e` et en CI.

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

## Authentification et comptes

- [x] Mots de passe hachés avec bcrypt (coût 10), jamais stockés en clair.
- [x] Message d'erreur identique que l'identifiant existe ou non (pas
      d'énumération de comptes).
- [x] Comptes suspendus (`actif = false`) ou supprimés (`deleted_at`) :
      connexion refusée, session en cours fermée à la prochaine page
      (`requireStaffSession` / `requireClientSession`) **et, depuis cette
      revue, routes API refusées** (`getSessionActive`, voir F3 ci-dessous).
- [x] L'abonnement du promoteur doit être `ACTIF` pour que ses utilisateurs se
      connectent.

## Revue systématique des Server Actions et routes API

Question posée à chaque fonction : au-delà de « l'appelant est-il connecté et
du bon rôle ? », vérifie-t-elle que **la ressource visée par l'identifiant
reçu** (bien, client, projet, demande, compte…) appartient au promoteur de
l'appelant (ou, pour un client, à son propre dossier) ? Un identifiant est
une chaîne devinable ou énumérable : sans ce contrôle, le promoteur A peut
lire ou modifier les données du promoteur B.

| Fichier | Contrôle de session | Rattachement de la cible vérifié | Résultat |
| --- | --- | --- | --- |
| `admin/actions.ts` (créer / activer / suspendre un promoteur) | `requireRole(SUPER_ADMIN)` | n/a : le Super Admin est global par conception | OK |
| `dashboard/equipe/actions.ts` (recruter, modifier une recrue) | `requireRole(ROLES_RECRUTEURS)` | `recrue.promoteurId === session.promoteurId` + rôle recrutable par le pôle | OK |
| `dashboard/clients/actions.ts` (créer, modifier) | `requireRole` / `requireStaffSession` | `client.promoteurId` + `peutModifierClient` | OK |
| `dashboard/clients/actions.ts` (`resetClientPassword`) | `requireStaffSession` | promoteur seulement, **aucune règle de rôle ni de commercial gérant** | **F2 — corrigé** |
| `dashboard/biens/[id]/actions.ts` (bloquer, débloquer, plans, paiement commercial, désistement) | `requireRole` | `bienDuPromoteur` (projet du bien) ; paiement et désistement : commercial en charge ou responsable | OK |
| `dashboard/projets/actions.ts` (projet, biens, épingles, modifications) | `requireRole` / `requireStaffSession` | `projetDuPromoteur` sur chaque projet / bien, y compris `toggleEpingle` | OK |
| `dashboard/propositions/actions.ts` (créer, accepter, refuser, négocier) | `requireRole` | bien via projet, client via `clients.promoteurId`, proposition via son commercial | OK |
| `dashboard/contrats/actions.ts` (confirmer, copie signée, notaire) | `requireRole(RESP. ADMIN)` | projet du bien du contrat | OK |
| `dashboard/desistements/actions.ts` (vérifier, rembourser) | `requireRole(RESP. ADMIN)` | `getDesistementDuPromoteur` | OK |
| `dashboard/paiements/actions.ts` (compléter / valider, syndic) | `requireRole(COMPTABLE)` | projet du bien du paiement ; `client.promoteurId` pour le syndic | OK |
| `dashboard/recouvrement/actions.ts` (paiement constaté) | `requireRole(RECOUVREMENT)` | projet du bien | OK |
| `dashboard/rendez-vous/actions.ts` (accepter, reproposer) | `requireStaffSession` | `client.promoteurId` + rôle du service + commercial concerné | OK |
| `dashboard/sav/actions.ts` (photos, livraison, syndic, visites) | `requireRole(SAV)` | `client.promoteurId` ou `bienDuPromoteur` | OK |
| `dashboard/sav/actions.ts` (TMA : chiffrer, refuser, avancer) | `requireRole(SAV)` | `demandeDuPromoteur` : projet du bien de la demande | OK — couvert par `isolation.spec.ts` |
| `dashboard/prospects/actions.ts` (contacté, retour client) | `requireRole` | `commercialId === session.userId` / `prospect.promoteurId` | OK |
| `dashboard/prospects/actions.ts` (`relancerCommercial`) | `requireRole(ASSISTANT)` | **aucun contrôle sur `commercialId`** | **F1 — corrigé** |
| `dashboard/prospects/actions.ts` (import : analyser, confirmer) | `requireRole(ASSISTANT)` | commerciaux et téléphones connus filtrés par `session.promoteurId` | OK — couvert par `isolation.spec.ts` |
| `client/biens/[id]/actions.ts` (paiement, visite, photos, livraison, syndic, créneau, TMA demande / acceptation) | `requireClientSession` | `bien.clientId` / `syndic.clientId` / `visite.clientId` / `demande.clientId === session.clientId` | OK |
| `client/rendez-vous/actions.ts` | `requireClientSession` | `bien.clientId`, `rdv.clientId` | OK |
| `lib/actions/comptes-actions.ts` + `POST /api/comptes/restaurer` | `requireStaffSession` / `getStaffSessionActive` | `cibleInterne` / `cibleClient` : même promoteur, pas soi-même, `ROLES_GERABLES_PAR` ou commercial gérant | OK — `comptes.spec.ts`, `isolation.spec.ts` |
| `lib/actions/notifications-actions.ts` | `getSession` | condition « mes notifications » (userId / clientId) dans la requête | OK |
| `login/actions.ts` | — | rate-limiting, comptes désactivés refusés | OK |
| `GET /api/files/[type]/[filename]` | `getSession` → **`getSessionActive`** | `file-access.ts` : promoteur du fichier (staff) ou client du dossier (client), orphelin jamais servi ; nom `uuid.ext` strict | **F3 / F5 — corrigés** |
| `POST /api/upload` | `getSession` → **`getSessionActive`** | extension et taille par type ; **contenu non vérifié, tout type ouvert aux clients, pas de limite de débit** | **F3 / F4 / F5 / F6 / F7 — corrigés** |
| `GET/POST /api/cron/rappels-echeance` | `CRON_SECRET` | n/a (traitement global) | OK |
| `GET /api/health` | aucune (sonde) | n/a, aucun accès base | OK |
| Pages de détail (`/dashboard/biens/[id]`, `/dashboard/projets/[id]`, `/dashboard/clients/[id]`, leurs `/modifier`, `/dashboard/equipe/[id]/modifier`, `/client/biens/[id]`) | `requireStaffSession` / `requireRole` / `requireClientSession` | `promoteurId` ou `clientId` comparé, sinon `notFound()` | OK — couvert par `isolation.spec.ts` |
| Journal (`/dashboard/journal`, `/admin/journal`) | `requireRole` | `journal_activite.promoteur_id = session.promoteurId` ; le Super Admin seul voit tout | OK — couvert par `isolation.spec.ts` |
| Épingles (tableau de bord) | `requireStaffSession` | épingles de `session.userId` seulement, insérées après contrôle du promoteur du bien | OK — couvert par `isolation.spec.ts` |

## Failles trouvées et corrigées

Gravité selon la règle demandée : **critique** si un promoteur peut voir ou
modifier des données d'un autre promoteur, **modérée** sinon.

| # | Gravité | Faille | Correction | Test qui la couvre |
| --- | --- | --- | --- | --- |
| F1 | **Critique** (écriture inter-promoteurs ; impact limité : une notification parasite, aucune donnée lue) | `relancerCommercial(commercialId)` notifiait l'utilisateur désigné sans vérifier qu'il appartient au promoteur de l'assistant, ni qu'il est commercial : l'assistant de A pouvait injecter une notification chez n'importe quel utilisateur de B. | La cible doit être un commercial ou responsable commercial **actif du même promoteur**, sinon « Commercial introuvable. ». | `isolation.spec.ts` « actions forgées » (3) : argument substitué par l'id du commercial de B → aucune notification chez B ni chez le commercial de A. Vérifié : le test échoue si le contrôle est retiré. |
| F2 | Modérée (intra-promoteur) | `resetClientPassword` acceptait tout membre du promoteur (SAV, comptable, assistant…) et tout client du promoteur : un commercial pouvait réinitialiser le mot de passe d'un client d'un autre commercial. | Même règle que la suspension (`peutGererClient` : commercial gérant ou direction commerciale), compte actif requis, action tracée au journal. | `isolation.spec.ts` (4) : le Commercial 2 de A, argument substitué par le client de B puis par le client du Commercial 1 → aucun mot de passe affiché, les deux clients se connectent toujours ; témoin : sur son propre client, la réinitialisation fonctionne. |
| F3 | Modérée | `/api/upload` et `/api/files` ne vérifiaient que la signature du cookie : un compte suspendu ou supprimé continuait à déposer et lire des fichiers jusqu'à expiration de la session (7 jours). | `getSessionActive()` (staff et client) : 401 dès que le compte est suspendu ou supprimé. | `isolation.spec.ts` (5) : deux contextes, client suspendu par sa direction → 401 sur dépôt et lecture, 200 après réactivation. |
| F4 | Bug fonctionnel bloquant | Le dépôt d'un modèle 3D échouait deux fois : `saveUpload` revalidait l'extension avec la liste par défaut (pas de `.glb`), et `parsePublicPath` refusait le type `plans-3d` (chiffre non admis par l'expression régulière). | Extension revalidée **par type** ; classe `[a-z0-9-]` pour le type. | `storage.test.ts` (parsePublicPath, isAllowedExtension par type) ; `plans3d.spec.ts` (dépôt réel d'un `.glb`). |
| F5 | Modérée (durcissement) | Aucune vérification du contenu à l'upload : un fichier HTML nommé `.png` était stocké et servi `inline` ; pas d'en-tête `X-Content-Type-Options`. | Signature du contenu contrôlée côté serveur (`contenuCoherent` : `%PDF`, PNG, JPEG, `glTF`, JSON glTF) à l'upload **et** dans `saveUpload` ; `nosniff` sur tout fichier servi. SVG toujours refusé. | `storage.test.ts` ; `isolation.spec.ts` (6) : HTML déguisé en `.png` → 400 ; `plans3d.spec.ts` / `isolation.spec.ts` (2) : en-tête `nosniff`. |
| F6 | Modérée (durcissement) | Une session client pouvait déposer n'importe quel type (`contrats`, `recus`, `tma-devis`, `plans-3d` jusqu'à 50 Mo). | Types autorisés aux clients : `preuves-paiement`, `pieces-identite` (pièce du porteur), `tma-croquis` ; 403 sinon. | `storage.test.ts` (`TYPES_UPLOAD_CLIENT`) ; `isolation.spec.ts` (6) : client × `contrats` / `tma-devis` / `plans-3d` → 403. |
| F7 | Modérée (abus de ressources) | Aucune limite de fréquence sur les dépôts de fichiers, l'import Excel et les demandes TMA. | Voir « Limites de débit ». | `rate-limit.test.ts` ; `isolation.spec.ts` (6) : 31e dépôt en 10 minutes → 429. |

Vérifications faites sans faille trouvée (couvertes par des tests depuis
cette revue) : actions TMA côté SAV et côté client (même promoteur / même
client), import de prospects (commerciaux du promoteur seulement), journal
(promoteur de la session ; Super Admin seul global), épingles (biens du
promoteur, épingles de l'utilisateur), suspension / suppression /
restauration (règles de `comptes.spec.ts` inchangées, plus deux cibles
inter-promoteurs), traversée de chemin sur `/api/files` avec les nouveaux
types `plans-3d`, `tma-croquis`, `tma-devis` (`isSafeFilename`,
`parsePublicPath`).

## Tableau appelant × cible × réponse attendue (`tests/e2e/isolation.spec.ts`)

Le test crée un promoteur B complet (directions, commercial, client, projet,
bien vendu, plan, demande TMA) puis joue, depuis le promoteur A de démo :

| Appelant (A) | Cible (B) | Vecteur | Réponse attendue |
| --- | --- | --- | --- |
| Directeur Commercial | bien, projet, leurs pages `/modifier` | URL directe | page 404 (`page-introuvable`) |
| Commercial 1 | client, page `/modifier` | URL directe | page 404 |
| Directeur Commercial | plan du bien | `GET /api/files/...` | 403 (200 pour B, 401 sans session) |
| PDG | bien | `bienId` substitué dans le formulaire de blocage | « Bien introuvable. », bien de B inchangé |
| Directeur Commercial | bien | argument de `toggleEpingle` substitué | erreur, rien d'épinglé (ni le bien de B, ni celui de A) |
| Assistant Administratif | commercial | argument de `relancerCommercial` substitué | aucune notification chez B (ni chez le commercial de A) |
| Commercial 2 | client de B, puis client du Commercial 1 (A) | argument de `resetClientPassword` substitué | aucun mot de passe affiché, connexions des deux clients intactes |
| Directeur Commercial | commercial et client | `POST /api/comptes/restaurer` | 403 |
| SAV | demande TMA | `demandeId` substitué dans le formulaire de chiffrage | « Demande introuvable. », demande de B toujours « Demande envoyée » |
| PDG | journal | `/dashboard/journal` | aucune ligne de B (le Super Admin les voit sur `/admin/journal`) |
| Assistant Administratif | commercial | aperçu d'import de prospects | le commercial de B n'apparaît pas dans la répartition |

Les substitutions d'argument passent par `forgerArgumentAction` (helper
Playwright qui réécrit le corps de la requête de Server Action, comme un
client HTTP modifié) ; chaque cas comporte un témoin qui échoue si la
substitution n'a pas eu lieu.

## Limites de débit

En mémoire (`src/lib/rate-limit.ts`, fenêtre glissante, une clé par compte),
suffisant pour une instance ; derrière plusieurs instances, remplacer le
`Map` par un store partagé (Redis) en gardant l'interface.

| Cible | Limite | Réponse | Pourquoi |
| --- | --- | --- | --- |
| `/login` | 5 échecs / identifiant, 30 / IP, 15 min | message avec délai | force brute (Phase 12) |
| `POST /api/upload` | 30 fichiers / compte / 10 min | 429 | tout compte connecté peut déposer ; borne le remplissage du disque (jusqu'à 50 Mo par modèle 3D) |
| Import Excel (`analyserImportProspects`) | 10 analyses / assistant / 10 min | message | parsing en mémoire d'un fichier jusqu'à 4 Mo |
| Demande TMA (`demanderTma`) | 10 demandes / client / heure | message | création libre depuis l'espace client, chaque demande notifie le SAV |

Écarté, et pourquoi :

- **Acceptation d'un devis TMA** : transition d'état unique, gardée par le
  statut (`CHIFFRE → SIGNE`) et l'appartenance de la demande au client ; un
  rejeu n'a aucun effet supplémentaire.
- **Restauration de compte** (`/api/comptes/restaurer`) : déjà gardée par
  l'autorisation par compte et idempotente ; les identifiants sont des UUID
  non énumérables, une rafale ne produit que des 403.
- **Autres actions client** (visite, photos, rendez-vous) : déjà bornées par
  la logique métier (une visite en cours à la fois, une demande de photos par
  6 mois) ou sans coût notable ; à revoir si un abus est constaté.

## Dépôts de fichiers (`src/lib/storage.ts`)

Toutes les limites sont appliquées **côté serveur** dans `POST /api/upload`
(extension par type, taille par type, signature du contenu, type autorisé à
la session) et de nouveau dans `saveUpload` ; l'attribut `accept` du
composant `FileUpload` n'est qu'une aide à la saisie.

| Type | Extensions | Taille max | Déposé par |
| --- | --- | --- | --- |
| `pieces-identite` | pdf, jpg, jpeg, png | 10 Mo | staff, client (pièce du porteur d'un paiement) |
| `preuves-paiement` | pdf, jpg, jpeg, png | 10 Mo | staff, client |
| `tma-croquis` | pdf, jpg, jpeg, png | 10 Mo | staff, client |
| `plans` | pdf, jpg, jpeg, png | 10 Mo | staff |
| `plans-3d` | glb, gltf | 50 Mo | staff |
| `desistements`, `contrats`, `photos-avancement`, `recus`, `autorisations-visite`, `tma-devis` | pdf, jpg, jpeg, png | 10 Mo | staff (`recus`, `contrats`, `autorisations-visite` sont surtout générés par le serveur) |

Les fichiers sont nommés `uuid.ext` (non devinables, expression régulière
stricte : aucune traversée de répertoire), servis uniquement par
`GET /api/files/...` après contrôle de rattachement, avec `Cache-Control:
private, no-store` et `X-Content-Type-Options: nosniff`. Un chemin soumis par
un formulaire est revalidé par `parsePublicPath` (type attendu compris, ex.
`tma-devis` pour un devis) avant enregistrement. Point accepté : un
utilisateur qui connaîtrait l'UUID d'un fichier d'un autre dossier pourrait
le référencer comme pièce jointe ; l'UUID v4 n'est pas devinable et l'upload
ne renvoie le chemin qu'au déposant.

## Rendu 3D — couverture de test

`tests/fixtures/cube.glb` (2 Ko) est un cube texturé glTF 2.0 généré par
`node scripts/generer-cube-glb.mjs` (aucun fichier téléchargé, aucune licence
tierce). `tests/e2e/plans3d.spec.ts` le dépose comme modèle 3D d'un bien,
ouvre l'onglet « Modèle 3D » et vérifie que `<model-viewer>` a chargé le
modèle (`loaded === true`, dimensions 1 × 1 × 1) et que le fichier est servi
en `model/gltf-binary` avec `nosniff`. Le composant web vient du CDN Google :
ce test a besoin du réseau.

## Suivi des erreurs (Sentry) et données personnelles

Sentry (`@sentry/nextjs`) remonte les erreurs non gérées du navigateur, des
Server Components, des **Server Actions** et des **routes API**
(`src/instrumentation.ts` → `onRequestError` → `captureRequestError`, tag
`route_type` = render / action / route), plus les erreurs de rendu captées par
les `error.tsx` et `global-error.tsx`. Configuration : `sentry.server.config.ts`,
`sentry.edge.config.ts`, `src/instrumentation-client.ts`, options communes
dans `src/lib/sentry-options.ts`.

- [x] **DSN** uniquement par la variable `SENTRY_DSN` (copiée au build dans
      `NEXT_PUBLIC_SENTRY_DSN` pour le navigateur — la DSN n'est pas un secret,
      elle est visible dans tout navigateur). Sans DSN, le SDK est désactivé
      (`enabled: false`) : rien n'est envoyé, l'application fonctionne
      normalement.
- [x] **Environnement** tagué sur chaque événement : `SENTRY_ENVIRONMENT`,
      sinon `NODE_ENV` (`development` en local, `production` sur Railway) ;
      `release` = `SENTRY_RELEASE` ou `RAILWAY_GIT_COMMIT_SHA`.
- [x] **Aucune donnée personnelle par défaut** : `sendDefaultPii: false`
      (pas d'adresse IP, pas de cookies), `tracesSampleRate: 0` (pas de
      traces : elles contiendraient URL et paramètres), **pas de Session
      Replay** (il enregistrerait les écrans avec les données des clients),
      `includeLocalVariables: false` (pas les valeurs des variables locales
      des piles).

**RÈGLE — filtrage avant envoi** (`src/lib/sentry-filtre.ts`, hooks
`beforeSend` et `beforeBreadcrumb` des trois runtimes ; tests dans
`tests/unit/sentry-filtre.test.ts`). Sur chaque événement, avant qu'il ne
quitte le processus :

| Quoi | Où | Comment |
| --- | --- | --- |
| Utilisateur (`event.user`) | événement | retiré entièrement |
| Corps de requête (`request.data` : valeurs de formulaire), cookies (`request.cookies`), `request.env` | requête | retirés |
| En-têtes `cookie`, `set-cookie`, `authorization`, `x-forwarded-for`, `x-real-ip` | requête | retirés ; les autres en-têtes passent par le masquage de texte |
| Valeur de toute clé dont le nom contient : mot de passe / `passw` / `pwd` / `hash` / `token` / `secret` / `authorization` / `cookie` / `session` / `jwt` / `cin` / `piece` / `iban` / `rib` / téléphone / `phone` / `tel` / `gsm` / `mobile` / e-mail / `courriel` / `identifiant` / `ip_address` | `query_string`, `extra`, `contexts`, `tags`, données des miettes, paramètres de `logentry` — récursivement (profondeur 8, cycles ignorés) | remplacée par `[masqué]` quel que soit son contenu |
| Motifs dans tout texte : cookie `promopro_session=…`, valeur suivant « mot de passe / password / token / secret / jeton », jetons JWT (`aaa.bbb.ccc`), IBAN, CIN marocaine (1–2 lettres + 5–7 chiffres), téléphones marocains (`06…`, `+212…`) et internationaux (`+CC …`), e-mails | message, `logentry`, valeur de chaque exception, messages des miettes, URL de la requête, toutes les chaînes des objets parcourus | remplacés par `[masqué]` |
| Variables locales des cadres de pile (`frames[].vars`) | exceptions | retirées |
| Lignes de code de contexte des cadres de pile (`pre_context`, `context_line`, `post_context`) | exceptions | masquage de texte (un littéral présent dans le code ne fuit pas non plus) |

Limites à connaître : un nom ou une adresse postale écrits en clair dans un
message d'erreur ne sont pas reconnaissables par un motif — ne mettez jamais
de données de client dans un message d'erreur ou un `console.error` (les
miettes `console` sont envoyées, masquées). Le masquage par clé porte sur les
noms de champs du projet (`telephone1`, `pieceNumero`, `passwordHash`,
`motDePasse`…) : un nouveau champ sensible au nom exotique doit être ajouté à
`CLES_SENSIBLES`.

Vérification continue : `GET /api/test-erreur` et la page `/dev/test-erreur`
(route API, Server Action, erreur client), **en développement seulement**
(404 en production), lèvent des erreurs volontaires chargées de fausses
données sensibles ; dans Sentry elles doivent apparaître en `[masqué]`, avec
l'environnement `development`. Vérifié le 23 septembre 2026 sur un récepteur
Sentry local : trois événements (route, action, client), aucune des valeurs
de test présente dans les charges utiles.

## Données et fichiers

- [x] Stockage des fichiers isolé dans `src/lib/storage.ts` ; dossier
      configurable par `UPLOAD_DIR` (disque persistant en production).
- [x] Base SQLite par défaut ; PostgreSQL activé automatiquement par
      `DATABASE_URL` (`src/db/client.ts`, schéma miroir `src/db/schema.pg.ts`).
      `DATABASE_URL` contient un mot de passe : variable d'environnement de la
      plateforme uniquement, jamais dans un fichier commité.
- [x] Journal d'activité (`journal_activite`) sur créations, modifications,
      suppressions, suspensions, restaurations, imports et réinitialisations
      de mot de passe, cloisonné par promoteur.
- [ ] **Au déploiement** : sauvegardes régulières de la base et du dossier
      des fichiers ; TLS (HTTPS) terminé par le reverse proxy ou la plateforme.

## Points d'attention connus

- Les identifiants et mots de passe temporaires sont affichés une fois à
  l'écran à la création d'un compte (client ou recrue) ou à la
  réinitialisation : à transmettre par un canal sûr ; il n'y a pas d'envoi
  d'e-mail.
- Le rappel J-7 dépend d'un appel quotidien externe (voir README « Tâches
  planifiées »).
- L'acceptation d'un devis TMA est une case cochée horodatée, pas une
  signature électronique juridique.
- Le rate-limiting est en mémoire (mono-instance).
