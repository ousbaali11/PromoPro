# Prompts pour Claude Code — suite du développement PromoPro

> **État : les 12 phases décrites ci-dessous sont implémentées** (commits
> « Phase 1 » à « Phase 12 » dans l'historique git). Ce fichier est conservé
> comme trace de la feuille de route ; pour l'état actuel du projet, voir
> `README.md`, `ARCHITECTURE.md` et `SECURITY.md`.

Ce fichier contient une séquence de prompts prêts à copier-coller dans Claude Code,
**dans l'ordre**, pour terminer l'application à partir de la base posée dans ce
dépôt. Chaque prompt est autonome : Claude Code a accès au code, il retrouvera les
conventions déjà en place (voir `ARCHITECTURE.md`) en lisant les modules existants
(`propositions/`, `contrats/`, `prospects/`) qui suivent tous le même schéma.

**Avant de commencer**, placez le PDF du cahier des charges (`PromoPro_Cahier_des_charges.pdf`)
à la racine du projet : plusieurs prompts y font référence pour les règles exactes
(elles sont aussi résumées dans chaque prompt, mais le PDF fait foi en cas de doute).

Travaillez un prompt à la fois, vérifiez que `npm run build` passe et que le flux
fonctionne dans le navigateur avant de passer au suivant. Chaque prompt se termine
par une checklist de vérification à donner telle quelle à Claude Code.

---

## Prompt 1 — Upload de fichiers (infrastructure transversale)

```
Le projet PromoPro n'a pas encore de gestion d'upload de fichiers. Plusieurs
modules en ont besoin : scan de pièce d'identité (client), preuve de paiement
(commercial et client), plan d'un bien (Directeur Commercial), document de
désistement légalisé, photo de la 4e copie de contrat signée, photos
d'avancement (SAV), document d'autorisation de visite.

Mets en place une solution simple de stockage local :
1. Crée un dossier `storage/uploads/` à la racine (ajoute-le au .gitignore),
   avec des sous-dossiers par type : pieces-identite/, preuves-paiement/,
   plans/, desistements/, contrats/, photos-avancement/.
2. Crée un handler `POST /api/upload` (route.ts) qui reçoit un FormData avec un
   champ `file` et un champ `type` (un des sous-dossiers ci-dessus), vérifie
   l'authentification (`getSession()` depuis `@/lib/session`), valide
   l'extension (pdf, jpg, jpeg, png uniquement) et une taille max de 10 Mo,
   génère un nom de fichier unique (crypto.randomUUID + extension d'origine),
   écrit le fichier dans le bon sous-dossier, et retourne son chemin public
   (sers ces fichiers via une route `GET /api/files/[type]/[filename]` plutôt
   que depuis /public, pour garder le contrôle d'accès).
3. Crée un composant client réutilisable `src/components/ui/FileUpload.tsx` :
   zone de dépôt + bouton, aperçu du nom de fichier une fois uploadé, état de
   chargement, appelle `/api/upload` et expose la valeur (chemin du fichier)
   à un input caché pour qu'il soit soumis avec le formulaire parent (comme
   les autres champs de src/components/ui/Primitives.tsx).
4. Branche-le dans le formulaire de création de client
   (src/app/dashboard/clients/nouveau/page.tsx) pour le champ pieceDocUrl, et
   enregistre le chemin retourné dans clients.pieceDocUrl lors de la création
   (src/app/dashboard/clients/actions.ts).

Vérification : je crée un client avec une pièce d'identité scannée (PDF ou
image), le fichier est bien enregistré dans storage/uploads/pieces-identite/,
et son chemin est visible dans la fiche client.
```

---

## Prompt 2 — Génération de PDF (contrats et reçus)

```
Deux documents PDF sont attendus par le cahier des charges (section 7.2 pour le
contrat, section 9.2 pour le reçu de paiement) : le contrat de vente et le reçu
de paiement. Utilise la librairie `pdf-lib` (à installer) pour les générer
côté serveur.

1. Crée `src/lib/pdf/contrat.ts` avec une fonction `genererContratPdf(bien,
   client, echeances)` qui produit un PDF simple mais propre : en-tête
   PromoPro, informations du bien (désignation, prix, surface), informations
   du client (nom, prénom, CIN/passeport, adresse), tableau de l'échéancier
   (numéro, %, montant, date), zone de signature. Retourne un Buffer.
2. Crée `src/lib/pdf/recu.ts` avec `genererRecuPdf(paiement, bien, client)` :
   un reçu d'une page (numéro de reçu, date, montant, tranche concernée,
   référence de l'opération).
3. Enregistre les PDF générés dans `storage/uploads/contrats/` et
   `storage/uploads/recus/`, sers-les via la route `/api/files/...` du prompt
   précédent.
4. Branche la génération du contrat dans `confirmerContrat`
   (src/app/dashboard/contrats/actions.ts) : au moment de la confirmation par
   le Responsable Administratif, génère le PDF et enregistre son chemin dans
   contrats.pdfUrl.
5. Prépare (sans forcément la finaliser) la génération du reçu pour le prompt
   3 (module Paiements), qui appellera `genererRecuPdf` à la validation d'un
   paiement.

Vérification : après acceptation d'une proposition puis confirmation du
contrat par RESPADM-DEMO, un PDF est généré et son chemin est stocké en base.
```

---

## Prompt 3 — Module Paiements (Comptable Interne)

```
Complète le module Paiements (src/app/dashboard/paiements/) selon la section 9
du cahier des charges (PromoPro_Cahier_des_charges.pdf).

Actions à ajouter dans src/app/dashboard/paiements/actions.ts :
1. `completerReference(paiementId, formData)` — le Comptable Interne
   (role COMPTABLE_INTERNE) complète référence, montant exact, date de
   réception, porteur, puis passe paiements.statut à "VALIDE". Utilise
   `genererRecuPdf` (prompt 2) pour créer le reçu, enregistre son chemin dans
   paiements.recuPdfUrl. Met à jour l'échéance liée (echeances.montantPaye +=
   paiement.montant ; si montantPaye >= montant de l'échéance, passe son
   statut à "PAYEE", sinon "PARTIELLE"). Notifie le client de la disponibilité
   du reçu (voir src/lib/notifications.ts — pour l'instant les clients n'ont
   pas de table de notifications séparée : ajoute un champ ou une table
   dédiée si besoin, ou étends `notifications.userId` pour accepter un id
   client avec un champ `recipientType`).
2. Un formulaire inline (comme AddBienForm) pour saisir référence / montant
   exact / date de réception / porteur sur chaque ligne "En attente".

Ajoute aussi, côté Commercial, la saisie de la première tranche lors de la
création d'une vente : pour l'instant rien ne déclenche la création d'un
`paiements` lors de l'acceptation d'une proposition. Ajoute un formulaire sur
la page bien détail (ou propositions) permettant au commercial de saisir les
informations de paiement de la 1ère tranche (nature d'opération, banque, date,
montant, devise, porteur, preuve — utilise FileUpload du prompt 1), qui crée
une ligne `paiements` avec statut "EN_ATTENTE_COMPTABLE" et notifie le
Comptable Interne.

Vérification : COM1-DEMO saisit un paiement sur une vente, COMPTA-DEMO le voit
dans sa liste, le complète et le valide ; un reçu PDF est généré et
l'échéance correspondante passe à "Payée".
```

---

## Prompt 4 — Module Désistements

```
Implémente le flux de désistement décrit à la section 6.5 (déclenchement par
le commercial) et 7.1 (traitement par le Responsable Administratif) du cahier
des charges.

1. Sur la page bien détail (src/app/dashboard/biens/[id]/page.tsx), ajoute un
   bouton "Enregistrer un désistement" visible par le commercial gérant le
   bien, uniquement si bien.statut === "VENDU". Formulaire : upload du document
   de désistement légalisé (FileUpload). À la soumission :
   - crée une ligne `desistements` (statut "EN_ATTENTE")
   - remet le bien à zéro : statut "DISPONIBLE", clientId = null, commercialId
     = null (le bien redevient disponible ET reste tracé dans desistements
     pour l'historique — voir section 6.5, "deux pages différentes")
   - notifie tous les RESPONSABLE_ADMINISTRATIF du promoteur
2. Ajoute une page "Biens désistés" (src/app/dashboard/projets/desistes/page.tsx
   ou un filtre sur la page projet) listant les biens ayant un désistement,
   même si le bien est redevenu "Disponible".
3. Complète src/app/dashboard/desistements/page.tsx pour le Responsable
   Administratif : actions "Vérifier" (statut → VERIFIE) puis "Marquer
   remboursé" (statut → REMBOURSE), avec le champ texte libre pour noter si
   une décharge a été fournie (section 7.1 : rembourser directement seulement
   si les infos du payeur correspondent au client).

Vérification : COM1-DEMO désiste la vente créée au prompt 3, le bien redevient
disponible, RESPADM-DEMO voit le désistement en attente et peut le traiter.
```

---

## Prompt 5 — Espace Client : pièces, contrat, reçus, échéancier détaillé

```
Complète l'espace client (src/app/client/) selon la section 11.2, 11.4 et 11.8.

1. Bouton de téléchargement du contrat PDF (contrat.pdfUrl du prompt 2) et des
   reçus de paiement (paiements.recuPdfUrl du prompt 3), sur
   src/app/client/biens/[id]/page.tsx.
2. Fonctionnalité "Ajouter un paiement" (section 11.8) : le client déclare
   lui-même le règlement d'une tranche avant/à échéance, avec les mêmes champs
   que ceux saisis par le commercial (nature d'opération, banque, date,
   montant, devise, porteur, preuve via FileUpload). Crée une ligne
   `paiements` liée au client courant (requireClientSession), statut
   "EN_ATTENTE_COMPTABLE", notifie le Comptable Interne — réutilise la même
   action que pour la saisie commerciale (prompt 3) en généralisant
   l'auteur.
3. Gestion des paiements fractionnés et des trop-perçus (section 11.9) :
   quand un paiement validé porte le montantPaye d'une échéance au-delà de son
   montant dû, réduis automatiquement le montant restant dû de l'échéance
   suivante (ajoute un champ `montantAjuste` sur `echeances` ou calcule à la
   volée dans l'affichage — documente ton choix).
4. Rappel automatique J-7 avant échéance (section 11.8) : un script/route
   (`src/app/api/cron/rappels-echeance/route.ts`) qui parcourt les échéances
   non payées à J-7 et crée une notification client ("le paiement est prévu le
   jj/mm/aaaa, montant X, tranche n° Y, 20%"). Documente dans le README
   comment le déclencher (cron externe, ex. Vercel Cron ou un simple
   `setInterval` en dev).

Vérification : CL-DEMO peut télécharger son contrat et ses reçus, ajouter un
paiement pour sa prochaine tranche avec une preuve, et voir l'avancement se
mettre à jour.
```

---

## Prompt 6 — Espace Client : rendez-vous, demande de visite, contact service

```
Implémente la section 11.5 (rendez-vous), 11.6 (contacter un service) et 11.7
(demande de visite) du cahier des charges.

1. Table `rendezvous` déjà présente dans le schéma. Crée
   src/app/client/rendez-vous/page.tsx : calendrier simple (un <input
   type="date"> + <input type="time"> suffit, pas besoin d'un vrai composant
   calendrier) pour proposer une date/heure à un service (COMMERCIAL, SAV,
   ADMINISTRATIF, RECOUVREMENT). Crée la ligne avec statut "PROPOSE" et
   notifie les utilisateurs du service concerné (pour COMMERCIAL, notifie le
   commercial du bien).
2. Côté staff, sur chaque page de module concerné (sav/, recouvrement/,
   contrats/ pour l'administratif, dashboard/ pour le commercial), ajoute une
   section "Rendez-vous" listant les demandes PROPOSE/REPROPOSE avec deux
   actions : Accepter (statut → ACCEPTE, notifie le client) ou Reproposer
   (nouvelle date/heure, statut → REPROPOSE, notifie le client qui peut à son
   tour accepter ou reproposer — boucle simple à deux acteurs).
3. "Contacter un service" (section 11.6) : sur src/app/client/page.tsx ou une
   nouvelle page, une liste des 4 services avec le numéro de téléphone
   correspondant (celui du commercial pour "Service commercial", et pour les
   autres le premier utilisateur trouvé avec le rôle correspondant chez ce
   promoteur).
4. "Demande de visite" (section 11.7) : bouton sur src/app/client/biens/[id]/page.tsx,
   crée une entrée (ajoute une table `demandes_visite` au schéma si absente —
   bienId, clientId, statut DEMANDE/ACCEPTE/REFUSE, dateVisite). Le SAV
   accepte/refuse depuis src/app/dashboard/sav/page.tsx ; si accepté, le
   client choisit un créneau parmi Lun-Ven 8h-12h/14h-18h et Sam 8h-12h
   (génère les créneaux valides côté serveur, ne fais pas confiance à une
   date arbitraire envoyée par le client).

Vérification : CL-DEMO demande un RDV avec le service après-vente, SAV-DEMO le
voit et l'accepte ou repropose une date ; CL-DEMO demande une visite de son
bien, SAV-DEMO accepte, CL-DEMO choisit un créneau valide.
```

---

## Prompt 7 — Espace Client : demande de photos d'avancement + multi-biens

```
Implémente la section 11.3 (photos d'avancement, limitée à une fois tous les 6
mois) et vérifie la section 11.11 (multi-biens).

1. Ajoute `derniereDemandePhotos` (timestamp nullable) sur `biens` (ou une
   table dédiée `demandes_photos` avec bienId, clientId, dateDemande,
   photos: liste de chemins de fichiers). Bouton "Demander des photos" sur
   src/app/client/biens/[id]/page.tsx : désactivé si une demande a eu lieu il
   y a moins de 6 mois, avec un compte à rebours affiché (jours restants).
   Sinon, crée la demande et notifie les utilisateurs SERVICE_APRES_VENTE.
2. Sur src/app/dashboard/sav/page.tsx, section "Demandes de photos" : liste
   des demandes en attente, upload de plusieurs photos (FileUpload multiple,
   étends le composant si besoin) qui deviennent visibles dans l'espace
   client une fois déposées.
3. Vérifie/renforce le cloisonnement multi-biens (section 11.11) : sur
   src/app/client/page.tsx, si le client a plusieurs biens, chacun doit
   rester consultable indépendamment (déjà largement le cas par construction
   puisque chaque page est /client/biens/[id]) — ajoute simplement un fil
   d'Ariane ou un sélecteur de bien visible sur la page détail pour naviguer
   d'un bien à l'autre sans repasser par la liste.

Vérification : sur CL-DEMO, la demande de photos fonctionne une fois, puis le
bouton devient grisé avec un compte à rebours ; SAV-DEMO dépose des photos
visibles ensuite côté client.
```

---

## Prompt 8 — Service Après-Vente : livraison et syndic

```
Implémente la section 12 du cahier des charges (livraison et syndic
obligatoire de 2 ans).

1. Livraison (section 11.10 + 12.1) : sur src/app/client/biens/[id]/page.tsx,
   bouton "Confirmer la réception" pour le client (visible si bien.statut ===
   "LIVRE" n'est pas encore atteint et que le SAV a marqué le bien comme livré
   — ajoute un champ `livraisonConfirmeeClient` et `livraisonConfirmeeSav`
   (booléens) sur `biens`). Sur src/app/dashboard/sav/page.tsx, bouton
   symétrique côté SAV. Quand les deux sont vrais, passe bien.statut à
   "LIVRE" et notifie les RESPONSABLE_ADMINISTRATIF ("dossier à transmettre
   au notaire") — affiche ces biens dans une section dédiée de
   src/app/dashboard/contrats/page.tsx ("En attente de transmission au
   notaire").
2. Syndic (section 12.2) : sur src/app/dashboard/sav/page.tsx, formulaire pour
   définir le montant d'un client pour le syndic (crée une ligne `syndics`,
   statut "A_PAYER", notifie le client). Côté client
   (src/app/client/biens/[id]/page.tsx), affichage du montant dû + upload de
   la preuve de paiement (statut → "EN_ATTENTE_VALIDATION", notifie le
   Comptable Interne). Le Comptable Interne valide depuis
   src/app/dashboard/paiements/page.tsx (ajoute une section "Syndic en
   attente" en plus des paiements de tranches), ce qui passe le statut à
   "PAYE" et notifie le SAV.

Vérification : sur le bien vendu du seed, SAV-DEMO et CL-DEMO confirment
chacun la livraison, le bien passe à "Livré" ; SAV-DEMO définit un montant de
syndic pour CL-DEMO, qui le paie, et COMPTA-DEMO le valide.
```

---

## Prompt 9 — Recouvrement : filtres et ajout de paiement pour le compte du client

```
Complète src/app/dashboard/recouvrement/ selon la section 13 du cahier des
charges.

1. Filtres de période (13.2) : ajoute des boutons/segments "Aujourd'hui",
   "Demain", "Cette semaine", "Ce mois", "Période personnalisée" (deux
   <input type="date">) qui filtrent les échéances affichées par
   dateEcheance. Fais le filtrage côté serveur via searchParams (page.tsx
   reçoit `searchParams` et construit la requête Drizzle avec `gte`/`lte` sur
   echeances.dateEcheance).
2. "Ajouter un paiement pour le compte du client" (13.3) : formulaire
   identique à celui du prompt 3/5, mais déclenché par un utilisateur
   RECOUVREMENT au nom d'un client (sélection du bien puis de l'échéance
   concernée). Crée directement une ligne `paiements` avec statut "VALIDE"
   (le recouvrement constate un paiement déjà effectué) et met à jour
   l'échéance — le résultat doit apparaître immédiatement dans l'espace du
   client concerné (aucune étape de validation supplémentaire nécessaire ici,
   contrairement au circuit normal du Comptable Interne).

Vérification : je filtre les échéances "cette semaine" et je vois uniquement
celles qui tombent dans les 7 prochains jours ; RECOUV-DEMO ajoute un paiement
au nom de CL-DEMO et il apparaît aussitôt dans l'espace client.
```

---

## Prompt 10 — Directeur Financier : trésorerie détaillée

```
Enrichis src/app/dashboard/finance/page.tsx (section 8 du cahier des charges) :
sépare clairement le portefeuille chèques (avec date d'encaissement à venir
vs déjà encaissés) des virements/versements, avec un total du jour et un
total à venir (7 prochains jours), sous forme de quelques cartes de synthèse
en haut de page (réutilise le composant Stat de src/app/dashboard/page.tsx,
à extraire dans src/components/ui/Primitives.tsx si tu le réutilises
ailleurs).

Vérification : les totaux affichés correspondent bien à la somme des
paiements validés dont la date d'opération ou d'encaissement tombe dans la
période concernée.
```

---

## Prompt 11 — Qualité : états de chargement, erreurs, responsive

```
Passe en revue l'ensemble des pages de src/app/dashboard, src/app/admin et
src/app/client :
1. Ajoute un fichier loading.tsx par segment de route qui en bénéficie (listes
   avec potentiellement beaucoup de lignes : projets, propositions, clients,
   prospects, paiements) avec un simple squelette (des <div> avec
   `animate-pulse` et la palette existante).
2. Ajoute error.tsx (Client Component) aux segments dashboard/, admin/,
   client/ avec un message clair et un bouton "Réessayer" (reset()).
3. Vérifie le responsive mobile de la Sidebar (src/components/layout/Sidebar.tsx)
   : elle doit se transformer en menu accessible via un bouton hamburger sous
   768px plutôt que de rester fixe à 256px.
4. Vérifie que tous les tableaux (biens, propositions, clients, paiements...)
   restent utilisables sur mobile (scroll horizontal dans un conteneur plutôt
   que débordement de la page).

Vérification : navigation fluide sur un viewport 375px de large sur toutes les
pages listées, sans debordement horizontal de la page elle-même.
```

---

## Prompt 12 — Préparation production

```
Prépare le projet pour un déploiement réel :
1. Suis la section "Migrer vers PostgreSQL" du README.md pour basculer
   drizzle vers Postgres (garde SQLite disponible en dev via une variable
   d'environnement DATABASE_DRIVER si tu veux les deux, sinon bascule
   complètement — documente ton choix dans le README).
2. Remplace le stockage de fichiers local (storage/uploads/) par un stockage
   objet (S3-compatible) si le projet est déployé sur une plateforme sans
   disque persistant (Vercel, par exemple) — sinon documente clairement que
   le déploiement nécessite un disque persistant.
3. Vérifie que JWT_SECRET est bien lu depuis une variable d'environnement
   obligatoire en production (fais échouer le démarrage si absente et
   NODE_ENV==="production", dans src/lib/auth.ts).
4. Ajoute un rate-limiting basique sur /login (src/app/login/actions.ts) pour
   limiter les tentatives de connexion par IP.
5. Relis src/proxy.ts et chaque `requireRole(...)` du projet : vérifie qu'
   aucune page ou Server Action sensible n'a été oubliée.

Vérification : `npm run build` passe, une checklist de sécurité (secrets,
rate-limiting, contrôle d'accès) est cochée dans un fichier SECURITY.md que tu
crées.
```

---

## Après ces 12 prompts

L'application couvre alors l'intégralité du cahier des charges. Pour aller
plus loin (facultatif) : tests automatisés (Vitest + Playwright), export Excel
des tableaux de bord, notifications par e-mail en plus des notifications
in-app, tableau de bord Super Admin plus riche (utilisation par promoteur,
alertes d'abonnement expirant).
