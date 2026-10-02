# Architecture & conventions

Ce document décrit les conventions établies dans ce projet, à suivre pour tout
nouveau module. Les 12 phases de la feuille de route (`PROMPTS.md`) sont
implémentées ; les contrôles de sécurité sont récapitulés dans `SECURITY.md`.

## Le schéma d'un module

Chaque module (`src/app/dashboard/<module>/`) suit la même forme :

```
<module>/
  page.tsx        Server Component : lit la session, interroge la base, affiche
  actions.ts      "use server" : mutations, vérifie le rôle avec requireRole()
  [Component].tsx "use client" : formulaire ou bouton interactif, appelle une action
```

Regarde `src/app/dashboard/propositions/` pour un exemple complet (le plus
riche du projet : création, liste filtrée par rôle, trois actions de
décision).

## Hiérarchie de création des comptes

Qui peut créer qui (implémenté dans `src/lib/roles.ts` par
`ROLES_RECRUTABLES_PAR`, appliqué côté serveur dans
`src/app/admin/actions.ts` et `src/app/dashboard/equipe/actions.ts`) :

| Créateur | Comptes créés | Où |
|---|---|---|
| `npm run create-admin` (script) | Super Admin | ligne de commande |
| Super Admin | Promoteur **+** PDG **+** Directeur Commercial **+** Directeur Financier, en un seul geste | `/admin/nouveau` |
| Directeur Commercial | Commercial, Responsable Commercial, Responsable Administratif, Assistant Administratif, Service Après-Vente | `/dashboard/equipe` |
| Directeur Financier | Comptable Interne, Recouvrement | `/dashboard/equipe` |
| Commercial / Responsable Commercial / Directeur Commercial | Clients (compte de l'espace client) | `/dashboard/clients/nouveau` |

Le PDG ne crée aucun compte. La page Équipe n'affiche à un directeur que les
membres de son pôle et ne propose que les statuts de ce pôle ; le rôle
demandé est revalidé côté serveur contre `ROLES_RECRUTABLES_PAR[session.role]`.
Pour ajouter un rôle recrutable, compléter cette constante (et `ROLE_LABELS`) :
formulaire, liste et contrôle serveur suivent. La table `users` ne trace pas
le créateur d'un compte : l'appartenance à un pôle se déduit du rôle.


### Espace Super Admin : une fiche par promoteur, directions souples

`/admin` est une grille de fiches (une par promoteur : nom, logo, statut
d'abonnement et échéance, directions en exercice), chacune ouvrant
`/admin/promoteurs/[id]` où se font toutes les actions : abonnement
(`PromoteurActions` : Activer ; une fois actif, **Prolonger** sans attendre
l'échéance — la durée s'ajoute à l'échéance en cours, ou part d'aujourd'hui si
elle est passée, `src/lib/abonnement.ts` — et Suspendre), logo
(`LogoPromoteurForm`), directions de CE promoteur
(suspendre / supprimer / réactiver via `ActionsCompte`, inchangé) et **ajout
d'une direction** à tout moment (`ajouterDirection`, `AjoutDirectionForm`).
Un rôle de direction peut avoir **plusieurs titulaires, ou aucun** : aucune
contrainte d'unicité. Quand une suspension ou une suppression laisserait le
promoteur sans titulaire d'un rôle, la confirmation le dit explicitement
(`avertissementDernierTitulaire`, `src/lib/directions.ts`) sans bloquer.
Audit du code (30 septembre 2026) : aucune requête ne suppose un titulaire
unique — les destinataires par rôle sont toujours obtenus par `findMany`
(`notifyRole`, propositions → PDG, contrats → Responsable Administratif,
prospects → Assistant) ; les textes « le PDG », « au PDG » désignent la
fonction, pas une personne. Test : `admin-promoteurs.spec.ts`.

## Sessions et rôles

Deux types de session, définis dans `src/lib/auth.ts` :

- `SessionPayload` (`kind: "staff"`) — Super Admin ou tout rôle du promoteur
  (`role`, `promoteurId`, `userId`)
- `ClientSessionPayload` (`kind: "client"`) — un client (`clientId`,
  `promoteurId`)

Dans un Server Component ou une Server Action, récupère la session avec les
helpers de `src/lib/session.ts` :

- `requireStaffSession()` — n'importe quel rôle interne, redirige vers
  `/login` sinon
- `requireRole(["PDG", "DIRECTEUR_COMMERCIAL"])` — restreint à une liste de
  rôles, redirige vers `/dashboard?erreur=acces-refuse` sinon
- `requireClientSession()` — session client

Les trois helpers vérifient à **chaque requête protégée** que le compte est
encore utilisable — ni suspendu, ni supprimé, et promoteur au statut ACTIF
(`src/lib/etat-compte.ts`, cache mémoire de 5 s invalidé par les actions de
suspension / suppression / restauration et par tout changement de statut d'un
promoteur). Un compte révoqué pendant sa session est renvoyé vers
`/api/session/fermer` (cookie supprimé) puis `/login?motif=compte-inactif` ;
les routes API répondent 401 (`getSessionActive`). Pour un compte interne, le
même contrôle refuse toute session émise avant
`users.sessions_revoquees_avant` (instant d'émission `iat` du jeton, posé par
jose) : c'est ainsi qu'une réinitialisation de mot de passe ferme les sessions
ouvertes ailleurs.

### Mot de passe oublié par e-mail (comptes internes)

Pages publiques `/mot-de-passe-oublie` (identifiant demandé) et
`/reinitialiser-mot-de-passe?token=…` (nouveau mot de passe + confirmation),
logique dans `src/lib/mot-de-passe-oublie.ts`, règles pures (jeton, empreinte,
durée, robustesse du mot de passe, texte de l'e-mail) dans
`src/lib/reinitialisation-regles.ts`. L'espace client n'est pas concerné : le
commercial réinitialise le mot de passe d'un client depuis sa fiche. Envoi
par `src/lib/courriel.ts` (Resend, clé `RESEND_API_KEY`) ; sans clé ou
pendant la suite e2e, le message est capturé en mémoire et lisible sur
`/api/dev/courriels` (404 en production), ce qui permet au test de suivre
le lien réellement produit. Voir SECURITY.md pour les garanties.

**Chaque Server Action qui modifie des données doit commencer par un appel à
`requireRole` (ou `requireStaffSession`/`requireClientSession`)** — ne fais
jamais confiance à l'UI pour cacher un bouton, la vérification doit être
côté serveur. `src/proxy.ts` ne fait qu'une protection de premier niveau
(routes), pas de contrôle fin par rôle sur les actions.

## Base de données

**Choix du driver (Phase 13).** `src/db/client.ts` est l'unique point d'entrée
et choisit le dialecte au démarrage : si `DATABASE_URL` est défini et commence
par `postgres`, il construit un client `drizzle-orm/node-postgres` (pool `pg`,
TLS d'après `sslmode=` ou `PGSSLMODE`) sur `schema.pg.ts` ; sinon il retombe
sur `@libsql/client` avec `data/promopro.db` et `schema.sqlite.ts`. `db` est
typé avec le client SQLite : les types de lignes des deux schémas sont
identiques et les API utilisées (`db.query.*`, `select/insert/update/delete`,
`returning`) existent dans les deux dialectes, ce qui permet au reste du code
d'ignorer la base réelle. `src/db/schema.ts` applique la même règle et
ré-exporte les tables du dialecte actif.

**Pourquoi deux fichiers de schéma ?** Drizzle n'a pas de définition de table
indépendante du dialecte (`sqliteTable` ≠ `pgTable`, mapping des timestamps
différent). `schema.sqlite.ts` est la source ; `schema.pg.ts` en est le miroir
généré par `npm run db:pg-schema` (`scripts/gen-pg-schema.mjs`) — à relancer
après toute modification du schéma, jamais à éditer à la main.
`drizzle.config.ts` et le seed lisent `.env.local` / `.env` (`src/db/load-env.ts`)
pour cibler la même base que l'application.

`src/db/schema.sqlite.ts` définit toutes les tables avec Drizzle. Conventions :

- Id : `text` + `crypto.randomUUID()` (voir le helper `id()` en haut du
  fichier)
- Dates : `integer(..., { mode: "timestamp" })` → manipulées comme des objets
  `Date` côté TypeScript
- Statuts : `text` avec une union de chaînes en commentaire au-dessus de la
  colonne (SQLite n'a pas d'enum natif) — reste cohérent avec les valeurs déjà
  utilisées (ex. `EN_ATTENTE`, `VALIDE`...)
- Une nouvelle table = l'ajouter à `src/db/schema.ts` puis lancer
  `npm run db:push` (et mettre à jour `src/db/seed.ts` si un jeu de données de
  démo est utile)

Requêtes : utilise l'API relationnelle `db.query.<table>.findMany({ where,
orderBy })` pour les lectures simples, et `db.select()/.insert()/.update()`
pour le reste (jointures manuelles, agrégations). Le projet n'utilise pas les
relations Drizzle (`relations()` + `with: {...}`) pour rester explicite — les
jointures sont faites "à la main" avec des requêtes séparées puis assemblées
en JS (voir `src/app/dashboard/propositions/page.tsx`). C'est un choix de
simplicité, libre à toi de basculer vers `with` si un module a besoin de
requêtes plus profondes.

**Isolation multi-promoteur** : toute requête qui liste des données internes
doit filtrer par `promoteurId` (celui de la session). Il n'y a pas de
middleware qui le fait automatiquement — c'est la responsabilité de chaque
`page.tsx`/`actions.ts`. Regarde comment `projets`, `clients`, `prospects`
filtrent directement par `promoteurId`, et comment `biens`/`propositions`
(qui n'ont pas de colonne `promoteurId` directe) remontent au promoteur via
leur `projet`/`commercial`.

## Notifications

`src/lib/notifications.ts` expose `notify({ userId, ... })` (un utilisateur
interne), `notifyMany(userIds, {...})`, `notifyRole(promoteurId, role, {...})`
(tous les utilisateurs actifs d'un rôle) et `notifyClient({ clientId, ... })`
(un client, visible dans la cloche de son espace). La table `notifications`
porte un `recipientType` (`STAFF` → `userId`, `CLIENT` → `clientId`). Utilisé
dans toutes les Server Actions qui doivent prévenir un ou plusieurs rôles
(voir le tableau récapitulatif des notifications dans le cahier des charges,
section 15).

## Paiements

`src/lib/paiements.ts` centralise la logique métier : lecture/validation du
formulaire (`lirePaiementForm`), création d'une ligne (`creerPaiement`),
notification du comptable, imputation d'un montant sur l'échéancier avec
report du trop-perçu (`imputerSurEcheancier`, section 11.9) et validation
comptable avec reçu PDF + notification client (`validerPaiement`). Les Server
Actions par rôle (commercial, client, recouvrement, comptable) ne font que
vérifier le rôle et déléguer. Le formulaire `PaiementForm`
(`src/components/paiements/`) est partagé et reçoit l'action en prop.

**Paiements fractionnés et trop-perçus (section 11.9) — choix retenu.** Un
paiement est rattaché à une tranche (`echeanceId`, par défaut la première non
soldée). À la validation comptable, `imputerSurEcheancier` ajoute le montant
exact reçu à `montantPaye` de cette tranche (→ `PARTIELLE` ou `PAYEE`) ; si le
montant dépasse le restant dû, l'excédent est reporté sur la tranche suivante
(et ainsi de suite), ce qui réduit automatiquement son restant dû. Les
versements complémentaires d'une tranche fractionnée sont saisis comme des
paiements distincts (chacun avec sa preuve) sur la même tranche, et le cumul se
met à jour à chaque validation. Un paiement ne peut pas dépasser le **restant
dû total du bien** (contrôle à la saisie et à la validation comptable, message
explicite) : le trop-perçu se reporte de tranche en tranche, jamais au-delà du
prix. La répartition est une fonction pure (`src/lib/imputation.ts`,
`repartirImputation`) : aucune tranche n'est jamais négative et la somme des
imputations vaut exactement le montant. Les montants sont modifiés uniquement
à la validation comptable : un paiement « en attente » n'affecte pas
l'échéancier. Les règles de saisie communes (montant positif à deux décimales
au plus, dates, pourcentages d'échéancier à 100 %, délai TMA, longueur des
textes) vivent dans `src/lib/validation.ts`.

### Statuts d'un paiement et désistement

`paiements.statut` vaut `EN_ATTENTE_COMPTABLE` (saisi par le commercial, le
client ou le recouvrement, à référencer et valider), `VALIDE`, ou
`ANNULE_DESISTEMENT` : au désistement du client (`enregistrerDesistement`),
les opérations encore en attente sur le bien sont annulées — jamais
supprimées, preuve et saisie restent consultables —, le Comptable Interne
est notifié (`PAIEMENTS_ANNULES_DESISTEMENT`) et le journal porte le nombre
d'opérations annulées. Un paiement annulé ne peut plus être validé
(`validerPaiement` : passage à `VALIDE` conditionné au statut
`EN_ATTENTE_COMPTABLE`). Libellés et tonalités partagés :
`libelleStatutPaiement` / `toneStatutPaiement` (`src/lib/utils.ts`) ; l'index
des paiements et l'onglet Échéancier & Paiements de la fiche client
affichent ces opérations dans une section « Annulés par désistement »
distincte des opérations en attente et des validées. Seuls les paiements
`VALIDE` comptent dans la trésorerie, les reçus et le contrat.

## Recherche de clients inter-commerciaux (détection de doublons)

Page `/dashboard/recherche-clients` (Commercial et Responsable Commercial,
`requireRole`), entrée « Recherche clients » du menu et bouton « Vérifier un
doublon » de la liste des clients. Critères par l'URL (formulaire GET : nom,
prénom, date de naissance, numéro de pièce), logique pure dans
`src/lib/recherche-clients.ts` (critères nettoyés, correspondance insensible
à la casse et aux accents, pièce comparée sans espaces ni ponctuation,
comptes supprimés exclus) testée par Vitest. La requête ne porte que sur les
clients du promoteur de la session — jamais au-delà, vérifié par
`isolation.spec.ts` — et, contrairement à la liste « Clients », inclut ceux
des autres commerciaux. Confidentialité : `projeterResultat` construit, pour
un client dont le dossier n'est pas consultable (`peutConsulterDossierClient`
faux), une projection **limitée** champ par champ — nom, prénom, date de
naissance, pièce, nom du commercial qui le suit —, sans téléphone, e-mail,
adresse, identifiant ni lien ; pour ses propres clients (et tout le pôle pour
le Responsable Commercial), la projection est complète avec le lien vers la
fiche. Résultats groupés « Vos clients » / « Clients d'autres commerciaux de
ce promoteur » dans deux `DataTable`.

## Fiche client : point d'entrée unique, pages d'index sans action

`/dashboard/clients/[id]?bien=<id>&onglet=<contrat|paiements|tma|documents>`
est le seul endroit où une action de gestion s'exerce, sur UN client et UN
bien à la fois (`src/lib/dossier-client.ts` : `biensDuClient` — biens
détenus puis biens dont le client s'est désisté — et `chargerDossierBien`,
qui ne charge que le couple client / bien). Sélecteur de bien
(`SegmentedControl`, comme dans l'espace client) puis quatre onglets :

- **Contrat** : état, PDF, copie signée ; Responsable Administratif :
  confirmation, dépôt de la copie signée, transmission au notaire (bien
  livré) ; désistement du client sur ce bien (vérification, remboursement).
- **Échéancier & Paiements** : tranches, paiements à traiter (Comptable
  Interne : référence, montant exact, réception, porteur → validation et
  reçu), paiements validés, syndic (validation comptable), saisie d'un
  encaissement par le commercial du bien.
- **Travaux modificatifs** : demandes du client sur ce bien ; SAV :
  chiffrage / refus / avancement.
- **Documents** : tout ce qui a été déposé ou généré pour ce couple, en
  lecture seule.

Les pages **Contrats**, **Paiements**, **Désistements** et **SAV (travaux
modificatifs)** sont des index : filtres, recherche, export et statistiques,
mais chaque carte ou ligne renvoie vers l'onglet concerné de la fiche
(`lienFicheClient`) et ne porte plus aucun bouton d'action. Les cartes
(`src/components/dossier/cartes.tsx`) sont partagées : `lienFiche` sur un
index, `actions` sur la fiche. Les visites, photos, livraisons et la
définition du syndic restent sur la page SAV (pas d'onglet dédié). Les
Server Actions concernées revalident `/dashboard/clients/[id]`.

## Contrat par sections, versions du PDF, suppression douce

Deux écrans nettement séparés (`src/lib/contrats-sections.ts`, module pur
testé) :

- **Le contrat d'un dossier précis** (fiche client, onglet Contrat,
  Responsable Administratif) : ses sections (`contrat_sections` : ordre,
  titre, contenu) sont du **texte simple**. À la création du contrat
  (premier accès à l'onglet, `sectionsDuContrat`), le modèle par défaut du
  promoteur — ou le jeu intégré `SECTIONS_PAR_DEFAUT` — est résolu avec les
  vraies données du dossier (`resoudreModele` + `valeursContrat`) et ce texte
  devient le contenu propre à CE contrat. Ensuite `EditeurContrat` est un
  traitement de texte : titre + texte par section, réordonner, supprimer
  (deux temps), ajouter ; ce qui est enregistré est exactement ce qui a été
  tapé, aucune retransformation. Aucun jeton, aucune syntaxe.
- **Le modèle par défaut** (`/dashboard/contrats/modele`, lien « Gérer le
  modèle par défaut » depuis l'index Contrats et l'onglet Contrat) :
  `contrat_modeles.sections` est un JSON de sections faites de **segments**
  ordonnés — `{ type: "texte", valeur }` ou `{ type: "champ", cle }`. Les
  champs disponibles (`CHAMPS` : « Nom du client », « Prix du bien »,
  « Adresse du client »…) apparaissent dans `EditeurSegments` comme des
  étiquettes encadrées non éditables avec une croix de suppression, insérées à
  la position du curseur par le bouton « Insérer un champ » (menu déroulant
  des libellés humains) ; le texte se tape librement autour. Jamais de texte
  brut à accolades.

« Générer le PDF » (`genererPdfContrat`, `src/lib/contrats.ts`) rend les
sections courantes puis une annexe automatique des paiements validés
(références comptables, section 9.1) et les cadres de signature ; la première
génération confirme le contrat (EN_ATTENTE → PRET, commercial notifié), les
suivantes gardent le statut. Chaque génération archive l'URL précédente dans
`contrats.historique_pdf` (JSON, plus récent en premier), consultable sur la
fiche et servie par `/api/files`. **Garde-fou** : une section qui
contiendrait encore un jeton `{{cle}}` (données antérieures non migrées) est
résolue à la génération (`rendreTexte`), jamais écrite brute dans le PDF ; un
jeton inconnu reste visible tel quel. La régénération après validation d'un
paiement passe par le même moteur. Toute modification est journalisée.

**Migration ponctuelle** (`npm run migrer:contrats-segments`,
`src/lib/migration-contrats-segments.ts`) : les modèles au format hérité
`{ titre, contenu }` deviennent des segments (`segmentsDepuisTexte`), les
sections de contrat contenant des jetons sont résolues avec les données de
leur dossier. Idempotente ; la préparation e2e insère des données héritées
puis lance la migration, que les specs vérifient.

**Suppression douce** : `contrats.deleted_at`. Le contrat supprimé reste
consultable (PDF courant, versions archivées, copie signée, journal) dans
« Contrats supprimés » de la fiche, mais disparaît de l'index, de l'espace
client et des régénérations ; un nouveau contrat peut être créé aussitôt
pour le même bien et le même client (`creerContrat`), pré-rempli depuis le
modèle. La suppression est annulable pendant 8 s depuis le toast
(`restaurerContrat`), ou depuis l'historique tant qu'aucun autre contrat
actif n'existe.

## Échéancier flexible

La proposition de vente porte une liste **dynamique** de tranches
(`NewPropositionForm` : « Ajouter une tranche » / « Retirer », 40/20/20/20
par défaut, total en temps réel) ; le serveur lit les champs
`tranche<N>Pourcentage` / `tranche<N>Date` jusqu'au premier absent
(`lireTranchesProposition`) et impose 1 à 24 tranches, chaque pourcentage
dans ]0 ; 100], total 100 %, dates non passées (`verifierNouvelEcheancier`,
`src/lib/echeancier.ts`, module pur testé). N'importe quelle répartition est
acceptée (100 % en une fois, dix tranches de 10 %…).

**Dates « aujourd'hui » toujours en heure locale.** Les dates par défaut de
la proposition viennent de `datesEcheancierParDefaut` (`ymd`, heure locale du
serveur) ; `toISOString().slice(0, 10)` donne la date UTC, donc la veille
entre minuit et l'heure du décalage (00 h–02 h en été à Paris, 00 h–01 h à
Casablanca), et le formulaire refusait sa propre date par défaut. Côté
validation, `lireDate` lit une date `AAAA-MM-JJ` à minuit local
(`new Date("AAAA-MM-JJ")` vaut minuit UTC). Même règle pour toute borne
`min` d'un champ date côté client (créneau de visite).

Une fois la vente conclue, le **commercial du bien** (ou le Responsable
Commercial) modifie l'échéancier depuis la fiche client, onglet Échéancier &
Paiements (`EditeurEcheancier`, action `modifierEcheancier`) :
`verifierModificationEcheancier` conserve obligatoirement les tranches PAYEE
ou PARTIELLE (jamais supprimées, montant jamais réduit sous ce qui a été
payé), ne laisse retirer, redécouper ou ajouter que des tranches EN_ATTENTE
(date non passée si nouvelle ou modifiée), impose un total de 100 % du prix,
puis renumérote 1..N — les paiements suivent (`paiements.trancheNumero`).
Chaque modification est journalisée avec l'échéancier avant → après (cible
« Échéancier »), le contrat confirmé est régénéré (version archivée) et le
client notifié.

## Concurrence sur le dossier client

Deux Server Actions peuvent viser le même dossier au même instant (deux
onglets, deux rôles). Trois mécanismes, combinés :

- **Verrou en mémoire par clé** (`avecVerrou`, `src/lib/verrou.ts`) : les
  sections critiques d'une même clé s'enchaînent dans l'ordre d'arrivée —
  `echeancier:<bienId>` (modification de l'échéancier et imputation d'un
  paiement validé), `contrat-actif:<bienId>` (création et restauration d'un
  contrat). Un seul serveur Node en production ; le verrou ne traverse pas
  plusieurs instances, d'où les deux mécanismes suivants.
- **Écritures conditionnelles** : une tranche ne se supprime que si elle est
  encore `EN_ATTENTE` au moment d'écrire (`delete … where statut = 'EN_ATTENTE'`,
  sinon « vient de recevoir un paiement ») ; un paiement ne passe à `VALIDE`
  que s'il ne l'est pas déjà ; une tranche visée par un paiement encore en
  attente de validation comptable ne peut pas être supprimée
  (`verifierModificationEcheancier`, module pur). Les tranches sont relues
  sous le verrou, jamais depuis l'état lu avant lui.
- **Génération de PDF optimiste** (`genererPdfContrat`) : l'historique est
  relu au moment d'écrire et l'écriture n'est acceptée que si le PDF courant
  n'a pas changé entre-temps, sinon on recommence sur l'état frais — deux
  générations presque simultanées archivent chacune la version précédente,
  aucune n'est perdue ni dupliquée. `creerContrat` vérifie après insertion
  qu'un seul contrat actif subsiste pour le couple bien-client et retire le
  sien sinon.

Le champ caché `_delaiTest` (`delaiDeTest`, ignoré en production) retient
une action après sa lecture initiale pour que les tests de concurrence
(`concurrence-dossier.spec.ts`, `cycle-contrat.spec.ts`) placent la seconde
requête exactement dans la fenêtre « lu, pas encore écrit ».

## Plage de dates des tableaux de bord

Le tableau de bord interne (`/dashboard`, tous les rôles sauf le client)
porte en haut à droite un sélecteur de plage (`DateRangePicker`,
`src/components/ui/`) : bouton fermé résumant la plage active, panneau à
trois onglets — **Rapide** (Aujourd'hui, Cette semaine, 7 / 30 derniers
jours, Ce mois-ci, Cette année, La semaine dernière, un clic applique),
**Relatif** (nombre + unité, derniers / prochains), **Personnalisé** (début
et fin avec l'heure, fin après le début). Le choix est un code court porté
par l'URL (`?plage=annee`, `rel:-3:mois`, `perso:<iso>_<iso>`) que le
serveur résout en [début ; fin] à chaque requête (`src/lib/plage-dates.ts`,
module pur testé : préréglages, libellés accordés, granularité jour /
semaine / mois pour les graphiques). Le dernier choix est mémorisé par
utilisateur dans localStorage et rappelé quand l'URL n'en porte pas. Pas
d'auto-rafraîchissement : les données ne changent pas assez vite pour le
justifier.

## Graphiques des tableaux de bord

Sous les cartes Stat de `/dashboard`, une section « Activité » (composant
serveur `SectionGraphiques`, diffusé sous `Suspense` avec un squelette
pendant le calcul) affiche pour la plage choisie des totaux, un graphique en
barres et une courbe (recharts, `src/components/graphiques/Graphiques.tsx`,
couleurs navy / gold). L'agrégation est un module pur
(`src/lib/graphiques.ts` : intervalles jour / semaine ISO / mois selon la
longueur de la plage, comptage ou somme, cumul, lignes recharts) ; les
données par rôle viennent de `src/lib/graphiques-data.ts`, cloisonnées au
promoteur : PDG et Directeur Commercial (ventes conclues, CA cumulé),
Commercial et Responsable Commercial (ventes personnelles ou de l'équipe,
prospects reçus vs traités), Directeur Financier et Recouvrement
(encaissements réels : paiements validés par date de réception),
Comptable Interne (paiements validés), Responsable Administratif (contrats
générés vs confirmés), Assistant Administratif (prospects importés vs
traités), SAV (visites et travaux modificatifs traités). Les totaux et le
total de chaque graphique sont exposés en attributs `data-valeur` /
`data-total` pour les tests. **État vide** explicite (`graphique-vide`, « Aucune donnée sur cette période ») à la place des axes à zéro dès qu'aucune série n'a de valeur (`seriesVides`, module pur) ; **frontière d'erreur** propre à la section (`ErreurGraphiques`, composant client) : un calcul qui échoue affiche un message et un bouton Réessayer sans emporter la page vers `error.tsx` ; `?graphiques=panne` simule la panne hors production pour les tests

## Livraison et double confirmation

La livraison d'un bien (section 12.1) exige la confirmation du client et
celle du SAV, **dans n'importe quel ordre** (`finaliserLivraisonSiComplete`,
`src/lib/livraison.ts`) : chaque confirmation notifie l'autre partie si elle
manque encore, et le bien passe à LIVRE quand les deux sont posées. Le
prompt 8 de la feuille de route décrivait un enchaînement SAV puis client ;
l'implémentation symétrique est le choix retenu (testé dans sav.spec).

## Tâches planifiées

`src/app/api/cron/rappels-echeance/route.ts` envoie le rappel J-7 aux clients
(section 11.8). Elle est idempotente (`echeances.rappelEnvoyeAt`) et protégée
par `CRON_SECRET` — voir le README pour le déclenchement en production.

## Formulaires et Server Actions

Le projet utilise `useActionState` (React 19) partout, pas de bibliothèque de
formulaire externe :

```tsx
"use client";
import { useActionState } from "react";
import { maAction } from "./actions";

export function MonFormulaire() {
  const [state, formAction, pending] = useActionState(maAction, undefined);
  return (
    <form action={formAction}>
      {/* ... */}
      {state?.error && <p>{state.error}</p>}
      <button disabled={pending}>{pending ? "..." : "Valider"}</button>
    </form>
  );
}
```

Et côté serveur :

```ts
"use server";
export async function maAction(_prev: { error?: string } | undefined, formData: FormData) {
  const session = await requireRole(["COMMERCIAL"]);
  // ... valider, écrire en base, revalidatePath(...), éventuellement redirect(...)
  return { error: undefined };
}
```

Sur un formulaire, ajoute `onSubmit={soumettreSansReinitialiser(formAction)}`
(`src/components/ui/soumission.ts`) : React 19 vide un formulaire non contrôlé
dès que l'action se termine, même sur une erreur de validation — ce helper
dispatche l'action lui-même pour que la saisie reste en place. Un formulaire
qui doit se vider après un succès le fait explicitement (`form.reset()`).

Pour une action déclenchée par un simple bouton (pas un formulaire), utilise
`useTransition` + un appel direct à une fonction serveur qui prend des
arguments simples plutôt que `FormData` (voir `acceptProposition(id)` dans
`src/app/dashboard/propositions/actions.ts`, et son utilisation dans
`PropositionActions.tsx`).

## UI

Primitives dans `src/components/ui/` : `Button`/`LinkButton`/`ConfirmButton`
(confirmation à deux temps), `Card`, `Badge`/`StatusBadge`,
`Field`/`Input`/`Select`/`Textarea` (étiquettes flottantes), `PageHeader`,
`Breadcrumb`, `Section`, `Stat`, `Callout`, `EmptyState`, `DataTable` (tri,
pagination, export CSV via `ExportCsv`), `SegmentedControl`, `Dropdown`,
`Modal` (piège de focus), `Toast` (`useToast`, action « Annuler »),
`FileUpload`, `Skeleton`, `Onglets` (onglets soulignés à indicateur doré glissant, partagés par l'espace client et la fiche client ; le `SegmentedControl` reste réservé aux filtres et bascules de vue), `DateRangePicker`. Les listes dynamiques (tranches d'échéancier, sections de contrat et de modèle) s'animent à l'ajout et au retrait (`AnimatePresence`), les étiquettes de champ du modèle reprennent le rendu du `Badge` gold, et chaque écran récent a son squelette de chargement (`loading.tsx`) et ses états vides (`EmptyState`). Pas de librairie de composants externe. Palette dans `src/app/globals.css`
(`--color-navy-*`, `--color-gold-*`, `--color-cream`), utilisée via les
classes Tailwind `bg-navy`, `text-gold-600`, etc. (Tailwind v4, configuration
CSS-first via `@theme`).

**Montants des cartes de synthèse** : `MontantCompact` (`src/components/ui/`)
affiche `formatMoneyCompact` (`src/lib/utils.ts`) — forme complète sous le
million, puis trois chiffres significatifs avec l'échelon français M / Md /
Bn / Bd (« 2,14 Md MAD ») ; au-delà du dernier échelon le nombre d'unités
s'affiche avec ses séparateurs, la longueur reste donc bornée quelle que soit
la croissance des montants. Le montant exact est en info-bulle (`title`) et
en `data-montant`. Utilisé sur toutes les cartes `Stat` en dirhams
(tableaux de bord, trésorerie, paiements, recouvrement) ; les listes, fiches
et documents gardent `formatMoney` (montant complet).

**Natures de biens** : liste par groupes dans `src/lib/natures-biens.ts`
(résidentiel, terrain, professionnel, stationnement et annexes, immeuble),
proposée à la création et à la modification d'un bien et exigée par les
Server Actions (`natureValide`) ; `biens.nature` reste un texte en base, une
valeur historique hors liste est conservée telle quelle à la modification.
Ajoute une nature ici, jamais dans un formulaire.

`src/lib/roles.ts` centralise le libellé de chaque rôle (`ROLE_LABELS`) et la
navigation de la sidebar par rôle (`NAV_BY_ROLE`) — ajoute une entrée ici
quand un nouveau module a sa propre page de menu.

### Petits écrans (320 / 375 / 768 px)

Règles issues de l'audit mobile, vérifiées par `tests/e2e/mobile.spec.ts`
(chaque page aux trois largeurs, avec interaction réelle : menus, panneaux,
formulaires soumis, listes dynamiques, éditeurs) :

- **Aucun débordement horizontal de la page** : le test compare
  `document.documentElement.scrollWidth` à la largeur de la fenêtre et nomme
  les premiers éléments qui dépassent. Deux pièges rencontrés : un élément
  `sr-only` (position absolue) placé dans un conteneur de défilement non
  positionné s'en échappe et élargit la page de toute la largeur minimale de
  la table — le conteneur `overflow-x-auto` du `DataTable` est donc
  `relative` ; et une `<table>` ignore la largeur de 1 px de `sr-only` —
  une table réservée aux lecteurs d'écran s'enveloppe dans un `<div
  className="sr-only">` (projection de trésorerie).
- **Panneaux flottants recalés dans la fenêtre** : `useRecalageDansFenetre`
  (`src/components/ui/recalage.ts`) mesure le déclencheur et la largeur
  réelle du panneau puis pose `style.right` / `style.left` sur le nœud, sans
  état ni rendu supplémentaire. Utilisé par `Dropdown`, `DateRangePicker` et
  le panneau d'import des prospects ; à reprendre pour tout nouveau menu
  positionné en absolu contre son bouton.
- **Zone d'actions du `PageHeader`** : bornée à la largeur disponible
  (`max-w-full flex-wrap`) et alignée à droite quand elle se replie sous le
  titre (`ml-auto`), pour que ses panneaux s'ouvrent dans la zone de contenu
  et non sous la barre latérale (z-index supérieur) sur tablette.
- **Aucune action masquée par une colonne cachée** : `hideBelow` sert à
  alléger, jamais à cacher un bouton (le bouton du logo d'un promoteur est
  dans une colonne toujours visible ; la table défile horizontalement).
- **En-têtes repliables** : l'en-tête de l'administration passe en
  `flex-wrap` sous 375 px.
- **Jeu de données propre au spec mobile** : deux biens vendus à un client de
  test, créés par les vrais formulaires à 375 px, pour exercer les chemins de
  succès sans toucher aux données du seed que les specs suivants supposent
  (une seule vente sur A01) ; nettoyé par désistement remboursé.
- **Lignes de tranche sur deux lignes sous 640 px** (nouvelle proposition,
  éditeur d'échéancier) : numéro, pourcentage et bouton Retirer, puis la date
  sur toute la largeur, colonnes en `minmax(0,1fr)`. En une seule ligne, les
  largeurs minimales des deux champs poussaient le bouton hors de la ligne ;
  `overflow-hidden` masquait le défaut (Playwright faisait défiler la ligne),
  `overflow-clip` l'a révélé. Le spec mobile vérifie désormais le bouton.
- **Formulaires manipulés par script dans les tests** : les formulaires
  portent `data-hydrated` (`useHydrated`) ; un test qui désactive la
  validation HTML5 (`noValidate`) pour provoquer un message serveur doit
  attendre ce marqueur — posé avant l'hydratation, l'attribut déclenche un
  avertissement React et le badge de Next.js recouvre le bouton de soumission.

### Animations et interactions : trois pièges rencontrés en CI

Le runner GitHub est plus lent qu'un poste de développement ; trois aléas
n'apparaissaient que là (journal et traces Playwright à l'appui) :

- **Conteneur animé en hauteur = `overflow-clip`, jamais `overflow-hidden`.**
  Un bloc `motion` qui passe de `height: 0` à `auto` en `overflow-hidden`
  est un *conteneur de défilement* : pendant l'animation, `scrollIntoView`
  (Playwright, lecteur d'écran, focus clavier) le fait défiler en interne
  pour atteindre un bouton encore rogné, puis le contenu se recale quand la
  hauteur atteint `auto`. Un clic calculé avant ce recalage atterrit sur un
  autre élément (le formulaire de demande TMA n'était jamais soumis en CI).
  `overflow-clip` rogne sans être défilable : le bouton reste inatteignable
  jusqu'à la fin de l'animation, et Playwright attend naturellement.
- **Focus géré en `useLayoutEffect`, pas en `useEffect` (`Dropdown`).** Le
  survol d'une entrée (`mouseenter`, événement *continu* que React rend en
  différé) laissait un effet passif en attente ; React l'exécutait au début
  du clic suivant, *après* que `selectionner()` eut fermé le menu et placé le
  focus dans la zone de texte de l'éditeur de modèle : l'entrée survolée
  reprenait le focus dans un menu fermé, et l'Espace tapé ensuite rouvrait le
  menu puis insérait une étiquette parasite. L'effet de mise en page
  s'exécute au commit, et un miroir synchrone `ouvertRef` neutralise tout
  effet périmé.
- **Bouton à deux temps : toujours `confirmer()` (`tests/e2e/helpers.ts`).**
  Un clic posé 30 ms après `load`, avant l'hydratation, est perdu ; deux
  clics enchaînés sans vérifier `data-armed` n'arment alors que le bouton.
  Le helper clique jusqu'à constater l'armement, puis confirme.

## Génération de modèles 3D à partir du plan 2D

`src/lib/plan3d/` :

- `provider.ts` — le contrat : `FournisseurPlan3d` avec deux méthodes,
  `demarrerGeneration(image, cleApi)` (→ prêt avec `modelUrl`, ou en cours
  avec une `reference`) et `verifierStatut(reference, cleApi)` (→ en cours /
  prêt / échec), la liste `FOURNISSEURS` (code, libellé, site) et
  `ErreurFournisseur` (message déjà lisible) ;
- `gemini.ts`, `neural4d.ts` — un adaptateur par fournisseur externe, qui
  traduit son API documentée vers le contrat ; les fonctions `lireReponse…`
  sont pures et testées sans réseau (`tests/unit/plan3d.test.ts`) ; la base
  d'URL est surchargeable (`GEMINI_API_URL`, `NEURAL4D_API_URL`) pour le
  simulateur des tests (`/api/dev/plan3d-stub`, 404 en production). Gemini
  lit le plan (pièces nommées, portes, dimensions réelles si une échelle est
  visible, en JSON strict) et l'application extrude elle-même le `.glb` avec
  `extrusion.ts` ; modèle surchargeable par `GEMINI_MODEL` ; les 503 (forte
  demande) sont rejoués ; synchrone, pas de suivi ;
- `gemini-rendu.ts` — « Gemini — rendu 3D » : le modèle d'image de Gemini
  (`GEMINI_MODEL_IMAGE`, défaut `gemini-3.1-flash-image`) dessine une
  maquette 3D photoréaliste du plan, puis trois vues tournées (90°, 180°,
  270°) avec le plan et la première vue en référence ; les quatre vues sont
  assemblées côte à côte (`assemblerVues`, sharp) en une planche JPEG de type
  `rendus-3d`. Partage la clé de Gemini (`cleDe: "GEMINI"` : pas de clé
  propre, `cleApiPour` lit celle du fournisseur source, la carte n'a pas de
  formulaire). Règles de la planche (nombre de vues d'après les dimensions,
  angle de chaque vue) dans `rendu-vues.ts`, sans import Node ; l'aperçu
  `Apercu3d` choisit `<model-viewer>` pour un `.glb` et la visionneuse
  tournante `RenduTournant` (glisser pour tourner, molette et boutons pour
  zoomer, rotation lente au repos) pour une planche d'images, dans le bac à
  sable, la fiche du bien et l'espace client ;
- `promopro.ts` — adaptateur **interne** « Solution PromoPro », synchrone et
  sans clé, produit par une fabrique qui permettrait d'exposer une autre
  variante du modèle sans rien dupliquer ; `inference.ts` (modèle ONNX U-Net
  ResNet-34 exécuté par `onnxruntime-node` sur CPU, prétraitement letterbox
  identique à l'entraînement, fichier dans `storage/modeles/` ou téléchargé
  depuis `PLAN3D_MODELE_URL`, session gardée en mémoire, fichier illisible
  supprimé et retéléchargé), `segmentation.ts` (`ajouterEncre` : les traits
  sombres de l'image — murs fins, fenêtres en double trait — complètent le
  masque du modèle, hors des murs déjà reconnus et après avoir écarté le
  texte, les cotes, les arcs de porte et les équipements courbes, et les
  classes porte / fenêtre posées par le modèle sur du texte sont effacées ;
  `ouverturesDansLesMurs` : une porte ou une fenêtre n'est gardée que si du
  mur la borde aux deux bouts ; pièces par composantes connexes, murs /
  portes / fenêtres comme barrières ; coupures de
  mur rebouchées le long de chaque axe seulement quand elles prolongent un
  mur, jamais entre deux murs parallèles, pour garder couloirs, WC et
  terrasses étroits), `extrusion.ts` (bords des
  pièces alignés sur des lignes de murs communes, un seul mur entre deux
  pièces voisines, murs percés aux portes, couleurs de `palette.ts`,
  encodeur glTF binaire partagé `glb.ts`) ; le `.glb` est enregistré
  directement comme fichier `plans-3d`. Activable pour les biens comme les
  autres (à la demande du promoteur, résultats non encore validés sur de vrais
  plans : la validation du Directeur Commercial reste le garde-fou) ;
  `definirFournisseurActif` crée sa ligne de configuration (sans clé) si le
  modèle est installé. Les modules
  natifs (`onnxruntime-node`, `sharp`) sont déclarés dans
  `serverExternalPackages` (next.config.ts) ;
- `palette.ts` — palette commune des modèles générés (sol en bois clair en
  deux teintes, murs crème, dessus de mur brun moyen ; teintes sRGB converties
  en linéaire à l'écriture, comme glTF l'exige pour `COLOR_0`). Utilisée par
  l'extrusion interne et appliquée par `appliquerPalette` aux `.glb` des
  fournisseurs déclarés `recolorer: true` dans `FOURNISSEURS` (Neural4D,
  dont le maillage arrive sans couleur) au moment du téléchargement
  (`rapatrierModele`) : chaque sommet reçoit sa teinte selon sa normale et sa
  hauteur (vers le haut au niveau du sol → sol ; vers le haut plus haut →
  dessus de mur ; sinon → mur), le matériau devient neutre. Un maillage
  texturé n'est pas touché ; tout imprévu rend le fichier d'origine, la
  couleur ne fait jamais échouer une génération ;
- `glb.ts` — lecture et écriture du conteneur glTF binaire ;
- `registre.ts` — code → adaptateur ;
- `chiffrement.ts` — AES-256-GCM des clés d'API (clé dérivée de
  `SECRETS_ENCRYPTION_KEY`), `masquerCle` ;
- `config.ts` — clés chiffrées et fournisseur actif (table
  `fournisseurs_plan3d_config`), journalisation de chaque changement ;
- `generation.ts` — exécution commune : lecture de l'image (PNG/JPEG
  seulement), démarrage, suivi périodique borné (`PLAN3D_INTERVALLE_MS`,
  `PLAN3D_DELAI_MAX_MS`), téléchargement du .glb et enregistrement comme
  fichier `plans-3d` de l'application (signature vérifiée, 50 Mo max),
  reprise d'une génération connue après redémarrage, règle des 24 h ;
- `labo.ts` — bac à sable du Super Admin (table `essais_plan3d_labo`, jamais
  rattachée à un bien) ; `biens.ts` — générations sur les biens (table
  `generations_plan3d`), notification du Directeur Commercial, validation qui
  copie le modèle vers `biens.plan_3d_url`.

Le travail long s'exécute **après la réponse** de la Server Action
(`after()` de `next/server`) : le dépôt du plan n'attend jamais le
fournisseur. Les pages qui affichent des générations en attente les
revérifient d'abord chez le fournisseur (référence stockée), puis se
rafraîchissent d'elles-mêmes tant qu'une génération est en cours.

**Règle absolue** : un modèle généré n'est jamais visible du client avant
validation. Son fichier n'est référencé que par `generations_plan3d` :
`file-access.ts` le sert au staff du promoteur seulement ; à la validation il
devient aussi `biens.plan_3d_url`, donc lisible par le client comme un
modèle déposé à la main. Les fichiers du bac à sable ne sont référencés que
par `essais_plan3d_labo` : seul le Super Admin (qui lit tout) les ouvre.

**Ajouter un fournisseur** : créer `src/lib/plan3d/<nom>.ts` qui exporte un
objet `FournisseurPlan3d` (deux méthodes), ajouter sa description dans
`FOURNISSEURS` (provider.ts : `necessiteCle`, `activable`, état) et dans le
registre (registre.ts), écrire les tests de ses `lireReponse…` et, si les
tests e2e doivent l'exercer, ses routes dans le simulateur. Le Super Admin le
voit aussitôt dans /admin/plan3d (carte, liste déroulante du bac à sable).
Aucune autre modification.

## Fichiers uploadés

`src/lib/storage.ts` centralise le stockage local (`storage/uploads/<type>/`,
ignoré par git). Côté client, le composant `FileUpload` (`src/components/ui/`)
envoie le fichier à `POST /api/upload` dès sa sélection et place le chemin
retourné (`/api/files/<type>/<uuid>.<ext>`) dans un `<input type="hidden">`
soumis avec le formulaire parent. Côté serveur, valide toujours ce chemin avec
`parsePublicPath()` avant de l'enregistrer en base. Les fichiers sont servis
par `GET /api/files/[type]/[filename]` : session obligatoire, et pour un
client, uniquement les documents rattachés à son dossier
(`src/lib/file-access.ts` — à étendre à chaque nouveau type de document).
Exception : le **logo du promoteur** (`promoteurs.logo_url`, type d'upload
`logos`, PNG / JPG déposé par le Super Admin à la création ou depuis la liste
`/admin`) n'est rattaché à aucun client et est servi à tout compte du
promoteur, staff comme clients (`partageAuPromoteur`).

## Documents PDF et identité du promoteur

Les documents remis au client (contrat, reçu, autorisation de visite —
`src/lib/pdf/`) et l'espace client (`src/app/client/layout.tsx` : en-tête et
titre de l'onglet) portent le nom du **promoteur**, jamais celui de la
plateforme. `PdfWriter.create(titre, entete)` reçoit un `EnteteDocument`
(`src/lib/pdf/entete.ts` : nom, ligne de contact, logo lu depuis le stockage
s'il existe) ; nom en en-tête de chaque page, logo à gauche s'il est
renseigné (illisible → ignoré), pied de page « <nom> · document généré
automatiquement », métadonnées Auteur / Créateur au nom du promoteur. Les
générateurs exigent un promoteur (`chargerPromoteur`, `src/lib/promoteurs.ts`,
lève une erreur si la clé étrangère est rompue) : aucun repli sur un nom
générique. « PromoPro » reste la marque du logiciel là où il s'adresse à ses
utilisateurs et non aux clients d'un promoteur : page de connexion, pages
légales, administration, barre latérale du tableau de bord interne. L'en-tête
de chaque espace porte l'identité de l'espace en lien vers son accueil
(`lien-accueil`, curseur pointeur) : nom et logo du promoteur vers
`/dashboard` pour les rôles internes (`DashboardShell`, promoteur chargé par
le layout), marque PromoPro vers `/admin` pour le Super Admin, logo et nom du
promoteur vers `/client` pour un client (`entete.spec.ts`). La page de
connexion n'affiche aucun compte de démonstration. Le jeu de démonstration
nomme le promoteur « Résidences Atlas » pour que la présence de « PromoPro »
dans un document ou l'espace client soit toujours une erreur (tests
`pdf-marque.test.ts`, `marque.spec.ts`).

### Icône de favori (favicon) : marque par défaut, logo du promoteur dans les espaces connectés

Fichiers spéciaux de l'App Router (`src/app/`), aucune balise `<link>`
écrite à la main :

- `icon.svg` — icône PromoPro par défaut, même visuel que la barre latérale
  et la page de connexion (carré doré `#b08d57` arrondi, pictogramme
  Building2 de lucide en blanc à la moitié de la taille) ; `favicon.ico`
  (entrées PNG 16 / 32 / 48 px, générées depuis le SVG) pour les navigateurs
  qui ne lisent pas le SVG ; `apple-icon.tsx` (PNG 180 px, fond doré plein
  bord — iOS arrondit lui-même) pour l'écran d'accueil iOS. Ces trois fichiers
  s'appliquent à toute page sans icône plus spécifique : connexion, pages
  légales, administration.
- `dashboard/icon.tsx` et `client/icon.tsx` — icône d'onglet générée par
  requête (`src/lib/icone-promoteur.tsx`) : le **logo du promoteur** de la
  session s'il en a déposé un, sinon l'icône PromoPro en PNG
  (`src/lib/icone-marque.tsx`, même dessin que `icon.svg`). Next ne
  conserve que les icônes du segment le plus profond : dans ces deux espaces,
  `icon.svg` n'est plus proposé (le navigateur n'a pas à choisir), seul
  `favicon.ico` l'accompagne. Le logo (PNG ou JPG, n'importe quelle taille)
  est ramené à un PNG carré de 64 px, contenu sans déformation sur fond
  transparent, par `ImageResponse` (next/og) : aucune dépendance native.
  Cache en mémoire par promoteur, invalidé dès que l'URL du logo change (un
  nouveau dépôt a un nouveau nom de fichier) et au plus tard après dix
  minutes ; `Cache-Control: private, max-age=900` côté navigateur. Toute
  défaillance (promoteur introuvable, fichier absent, image illisible, base
  indisponible) retombe silencieusement sur l'icône par défaut : une icône
  d'onglet ne fait jamais échouer une page. L'identifiant du promoteur vient
  de la session, jamais de la requête : un compte ne peut voir que le logo de
  son promoteur. Sans session, ces deux routes répondent l'icône par défaut
  — `src/proxy.ts` les exempte de la redirection vers `/login`, qui
  servirait une page HTML en guise d'icône. L'en-tête `X-Icone-Origine`
  (`par-defaut` / `promoteur`) dit d'où vient l'image (`favicon.spec.ts`).

Les règles partagées avec le navigateur (types, extensions, tailles maximales,
messages) vivent dans `src/lib/uploads-regles.ts`, sans import Node :
`FileUpload` vérifie taille et extension **avant** d'envoyer le fichier
(message immédiat, aucun transfert inutile), puis `/api/upload` revérifie
tout côté serveur (`Content-Length` contre le type annoncé dans l'URL avant
de lire le corps, puis le fichier réel, puis sa signature).

Contrat de `POST /api/upload` : **toujours du JSON** — `{ path, name }` ou
`{ error }`, y compris pour une défaillance du disque (`ErreurStockage`
levée par `saveUpload` : EACCES, ENOSPC, ENOTDIR… → 503 « Le stockage des
fichiers est temporairement indisponible, contactez l'administrateur. ») et
pour toute erreur inattendue (500 « Le fichier n'a pas pu être envoyé,
réessayez ou contactez le support. ») ; le détail technique part dans Sentry.
`FileUpload` lit la réponse en texte et la parse prudemment : un corps vide
ou non JSON donne le même message générique, jamais « Unexpected end of JSON
input » (incident de production du 24 septembre 2026). Les Server Actions qui
écrivent un PDF (autorisation de visite, contrat, reçu) passent par
`tenterStockage` (`src/lib/stockage-erreurs.ts`) pour le même message ;
`validerPaiement` sonde le disque (`exigerStockageInscriptible`) **avant**
de passer le paiement en VALIDE, pour ne jamais laisser un paiement validé
sans reçu. Au démarrage, `src/instrumentation.ts` vérifie que `UPLOAD_DIR`
est inscriptible (sous-dossiers créés, fichier témoin) et le signale dans les
logs et Sentry sinon ; en production, `docker-entrypoint.sh` attribue le
volume à l'utilisateur `node` avant de lancer le serveur (voir DEPLOY.md).

## Échéancier de paiement

La règle par défaut (40% le jour du blocage, puis 20% tous les 6 mois,
modifiable par le commercial) est centralisée dans
`defaultEcheancier(prix, dateBlocage)` (`src/lib/utils.ts`). Réutilise cette
fonction plutôt que de recalculer les pourcentages ailleurs.

## Ce qui n'est volontairement pas fait ici

- Pas de librairie de gestion d'état global (tout passe par des Server
  Components + revalidation) — inutile vu la taille du projet
- Les règles pures sont isolées dans `src/lib/` (`creneaux.ts`, `periodes.ts`,
  `tresorerie.ts`, `projection.ts`, `imputation.ts`, `validation.ts`,
  `prospects.ts`, `recherche.ts`, `csv.ts`…) et couvertes par des tests
  unitaires Vitest ; les parcours par rôle, l'isolation multi-promoteur, les
  sessions et la concurrence sont couverts par Playwright (voir README,
  « Tests automatisés »). Chaque correction de comportement s'accompagne d'un
  test qui la justifie.
