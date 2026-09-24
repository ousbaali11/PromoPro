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
les routes API répondent 401 (`getSessionActive`).

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
`FileUpload`, `Skeleton`. Pas de librairie de composants externe. Palette dans `src/app/globals.css`
(`--color-navy-*`, `--color-gold-*`, `--color-cream`), utilisée via les
classes Tailwind `bg-navy`, `text-gold-600`, etc. (Tailwind v4, configuration
CSS-first via `@theme`).

`src/lib/roles.ts` centralise le libellé de chaque rôle (`ROLE_LABELS`) et la
navigation de la sidebar par rôle (`NAV_BY_ROLE`) — ajoute une entrée ici
quand un nouveau module a sa propre page de menu.

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
