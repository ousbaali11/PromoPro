// ---------------------------------------------------------------------------
// Schéma PostgreSQL — miroir exact de schema.sqlite.ts (SQLite) pour la production.
// Voir README « Migrer vers PostgreSQL ». Généré par scripts/gen-pg-schema.mjs
// (`npm run db:pg-schema`) : ne pas éditer à la main, modifier schema.sqlite.ts.
// ---------------------------------------------------------------------------
import { pgTable, text, integer, doublePrecision, timestamp, boolean } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date());

// ---------------------------------------------------------------------------
// Roles (kept as a plain union — SQLite has no native enum type)
// ---------------------------------------------------------------------------
export const ROLES = [
  "SUPER_ADMIN",
  "PDG",
  "DIRECTEUR_COMMERCIAL",
  "COMMERCIAL",
  "RESPONSABLE_COMMERCIAL",
  "RESPONSABLE_ADMINISTRATIF",
  "DIRECTEUR_FINANCIER",
  "COMPTABLE_INTERNE",
  "ASSISTANT_ADMINISTRATIF",
  "SERVICE_APRES_VENTE",
  "RECOUVREMENT",
] as const;
export type Role = (typeof ROLES)[number];

// ---------------------------------------------------------------------------
// Niveau 1 — Plateforme / Super Admin
// ---------------------------------------------------------------------------
export const promoteurs = pgTable("promoteurs", {
  id: id(),
  nom: text("nom").notNull(),
  contactEmail: text("contact_email"),
  contactTelephone: text("contact_telephone"),
  // Logo optionnel (PNG / JPG déposé par le Super Admin, type d'upload « logos ») : en-tête des PDF et de l'espace client
  logoUrl: text("logo_url"),
  // EN_ATTENTE | ACTIF | SUSPENDU
  statut: text("statut").notNull().default("EN_ATTENTE"),
  abonnementFormule: text("abonnement_formule"), // ex: "Annuel", "Mensuel"
  abonnementDebut: timestamp("abonnement_debut", { withTimezone: true }),
  abonnementFin: timestamp("abonnement_fin", { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Utilisateurs (tous rôles confondus, y compris Super Admin: promoteurId=null)
// ---------------------------------------------------------------------------
export const users = pgTable("users", {
  id: id(),
  promoteurId: text("promoteur_id").references(() => promoteurs.id),
  role: text("role").notNull().$type<Role>(),
  nom: text("nom").notNull(),
  prenom: text("prenom").notNull(),
  identifiant: text("identifiant").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  email: text("email"),
  telephone: text("telephone"),
  actif: boolean("actif").notNull().default(true), // false = suspendu (connexion refusée)
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // suppression douce : historique conservé, connexion refusée
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Projets & Biens
// ---------------------------------------------------------------------------
export const projets = pgTable("projets", {
  id: id(),
  promoteurId: text("promoteur_id")
    .notNull()
    .references(() => promoteurs.id),
  nom: text("nom").notNull(),
  nomCompte: text("nom_compte").notNull(),
  iban: text("iban").notNull(),
  delaiTmaJours: integer("delai_tma_jours").notNull().default(60), // fenêtre de dépôt des TMA après le blocage d'un bien
  createdById: text("created_by_id").references(() => users.id),
  createdAt: createdAt(),
});

// DISPONIBLE | BLOQUE_PDG | PROPOSITION_EN_COURS | VENDU | DESISTE | LIVRE
export const biens = pgTable("biens", {
  id: id(),
  projetId: text("projet_id")
    .notNull()
    .references(() => projets.id),
  designation: text("designation").notNull(), // ex: "Appartement B12"
  nature: text("nature").notNull().default("Appartement"), // Appartement | Parking | Local...
  prix: doublePrecision("prix").notNull(),
  surface: doublePrecision("surface").notNull(),
  // Plans : la colonne historique plan_url garde son nom (pas de migration destructive), exposée comme plan2dUrl
  plan2dUrl: text("plan_url"), // image ou PDF
  plan3dUrl: text("plan_3d_url"), // modèle .glb / .gltf (visualiseur <model-viewer>)
  visiteVirtuelleUrl: text("visite_virtuelle_url"), // lien externe vers une visite 360°
  statut: text("statut").notNull().default("DISPONIBLE"),
  commercialId: text("commercial_id").references(() => users.id),
  clientId: text("client_id").references(() => clients.id),
  pdgCommentaire: text("pdg_commentaire"), // note privée, visible PDG seulement
  // Livraison (11.10 / 12.1) : double confirmation client + SAV → statut LIVRE
  livraisonConfirmeeClient: boolean("livraison_confirmee_client").notNull().default(false),
  livraisonConfirmeeSav: boolean("livraison_confirmee_sav").notNull().default(false),
  livreAt: timestamp("livre_at", { withTimezone: true }),
  notaireTransmisAt: timestamp("notaire_transmis_at", { withTimezone: true }), // dossier transmis au notaire (7.4)
  createdAt: createdAt(),
});

// Biens épinglés par un utilisateur interne pour un accès rapide depuis son tableau de bord
export const epingles = pgTable("epingles", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  bienId: text("bien_id")
    .notNull()
    .references(() => biens.id),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Clients (acquéreurs)
// ---------------------------------------------------------------------------
export const clients = pgTable("clients", {
  id: id(),
  promoteurId: text("promoteur_id")
    .notNull()
    .references(() => promoteurs.id),
  nom: text("nom").notNull(),
  prenom: text("prenom").notNull(),
  dateNaissance: text("date_naissance"),
  lieuNaissance: text("lieu_naissance"),
  adresse: text("adresse"),
  pieceType: text("piece_type").default("CIN"), // CIN | PASSEPORT
  pieceNumero: text("piece_numero"),
  pieceDocUrl: text("piece_doc_url"),
  telephone1: text("telephone1"),
  telephone2: text("telephone2"),
  email: text("email"),
  identifiant: text("identifiant").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  commercialId: text("commercial_id").references(() => users.id),
  actif: boolean("actif").notNull().default(true), // false = suspendu (connexion refusée)
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // suppression douce : historique conservé, connexion refusée
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Propositions de vente (commercial -> PDG)
// ---------------------------------------------------------------------------
// ENVOYEE | ACCEPTEE | REFUSEE | NEGOCIEE | DESISTEE (vente annulée après désistement du client)
export const propositions = pgTable("propositions", {
  id: id(),
  bienId: text("bien_id")
    .notNull()
    .references(() => biens.id),
  commercialId: text("commercial_id")
    .notNull()
    .references(() => users.id),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  statut: text("statut").notNull().default("ENVOYEE"),
  noteNegociation: text("note_negociation"), // contre-proposition du PDG
  createdAt: createdAt(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

// Échéancier de paiement rattaché à une proposition/bien
// EN_ATTENTE | PARTIELLE | PAYEE
export const echeances = pgTable("echeances", {
  id: id(),
  propositionId: text("proposition_id")
    .notNull()
    .references(() => propositions.id),
  bienId: text("bien_id")
    .notNull()
    .references(() => biens.id),
  numero: integer("numero").notNull(),
  pourcentage: doublePrecision("pourcentage").notNull(),
  montant: doublePrecision("montant").notNull(),
  dateEcheance: timestamp("date_echeance", { withTimezone: true }).notNull(),
  montantPaye: doublePrecision("montant_paye").notNull().default(0),
  statut: text("statut").notNull().default("EN_ATTENTE"),
  rappelEnvoyeAt: timestamp("rappel_envoye_at", { withTimezone: true }), // rappel J-7 envoyé au client (11.8)
});

// ---------------------------------------------------------------------------
// Contrats
// ---------------------------------------------------------------------------
// EN_ATTENTE | PRET | ENVOYE | SIGNE | ANNULE (désistement)
export const contrats = pgTable("contrats", {
  id: id(),
  bienId: text("bien_id")
    .notNull()
    .references(() => biens.id),
  // Client acquéreur (null pour les contrats antérieurs à la colonne : celui du bien)
  clientId: text("client_id").references(() => clients.id),
  statut: text("statut").notNull().default("EN_ATTENTE"),
  pdfUrl: text("pdf_url"),
  copieSigneeUrl: text("copie_signee_url"), // 4e copie scannée
  // Versions précédentes du PDF, JSON [{ url, dateGeneration }] (jamais supprimées : trace de ce qui a pu être signé)
  historiquePdf: text("historique_pdf"),
  pdfGenereAt: timestamp("pdf_genere_at", { withTimezone: true }),
  // Suppression douce : le contrat reste consultable, un nouveau peut être créé pour le même bien / client
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: createdAt(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

// Sections ordonnées d'un contrat (titre + texte avec jetons de fusion), éditées par le Responsable Administratif
export const contratSections = pgTable("contrat_sections", {
  id: id(),
  contratId: text("contrat_id")
    .notNull()
    .references(() => contrats.id),
  ordre: integer("ordre").notNull(),
  titre: text("titre").notNull(),
  contenu: text("contenu").notNull().default(""),
});

// Modèle par défaut du promoteur : jeu de sections (JSON [{ titre, contenu }]) dont partent les nouveaux contrats
export const contratModeles = pgTable("contrat_modeles", {
  id: id(),
  promoteurId: text("promoteur_id")
    .notNull()
    .references(() => promoteurs.id),
  nom: text("nom").notNull().default("Modèle par défaut"),
  sections: text("sections").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).$defaultFn(() => new Date()),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Paiements (tranches)
// ---------------------------------------------------------------------------
// EN_ATTENTE_COMPTABLE | VALIDE
export const paiements = pgTable("paiements", {
  id: id(),
  bienId: text("bien_id")
    .notNull()
    .references(() => biens.id),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  echeanceId: text("echeance_id").references(() => echeances.id),
  trancheNumero: integer("tranche_numero"),
  montant: doublePrecision("montant").notNull(),
  devise: text("devise").notNull().default("MAD"),
  natureOperation: text("nature_operation"), // virement local | virement international | versement | cheque
  banque: text("banque"),
  dateOperation: timestamp("date_operation", { withTimezone: true }),
  dateEncaissementCheque: timestamp("date_encaissement_cheque", { withTimezone: true }),
  porteur: text("porteur"),
  porteurPieceUrl: text("porteur_piece_url"), // pièce d'identité du porteur s'il diffère du client (6.8)
  preuveUrl: text("preuve_url"),
  reference: text("reference"),
  montantExact: doublePrecision("montant_exact"),
  dateReception: timestamp("date_reception", { withTimezone: true }),
  statut: text("statut").notNull().default("EN_ATTENTE_COMPTABLE"),
  recuPdfUrl: text("recu_pdf_url"),
  // Auteur de la saisie : un utilisateur interne (commercial, recouvrement...) OU le client lui-même
  saisiParId: text("saisi_par_id").references(() => users.id),
  saisiParClientId: text("saisi_par_client_id").references(() => clients.id),
  valideParId: text("valide_par_id").references(() => users.id),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Désistements
// ---------------------------------------------------------------------------
// EN_ATTENTE | VERIFIE | REMBOURSE
export const desistements = pgTable("desistements", {
  id: id(),
  bienId: text("bien_id")
    .notNull()
    .references(() => biens.id),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  commercialId: text("commercial_id").references(() => users.id), // commercial ayant enregistré le désistement
  documentUrl: text("document_url"),
  montantARembourser: doublePrecision("montant_a_rembourser").notNull().default(0), // total des paiements validés au moment du désistement
  statut: text("statut").notNull().default("EN_ATTENTE"),
  dechargeNote: text("decharge_note"), // décharge fournie ou non, commentaire du Responsable Administratif
  traiteParId: text("traite_par_id").references(() => users.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  rembourseAt: timestamp("rembourse_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Prospects (leads assistant administratif)
// ---------------------------------------------------------------------------
// NON_CONTACTE | CONTACTE
export const prospects = pgTable("prospects", {
  id: id(),
  promoteurId: text("promoteur_id")
    .notNull()
    .references(() => promoteurs.id),
  nom: text("nom"),
  telephone: text("telephone"),
  source: text("source"), // Avito, Mubawab...
  commercialId: text("commercial_id").references(() => users.id),
  statutContact: text("statut_contact").notNull().default("NON_CONTACTE"),
  retourClient: text("retour_client"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Rendez-vous
// ---------------------------------------------------------------------------
// PROPOSE | ACCEPTE | REPROPOSE — `dernierAuteur` indique qui a fait la dernière
// proposition (CLIENT ou SERVICE) : c'est à l'autre partie d'accepter ou de reproposer.
export const rendezvous = pgTable("rendezvous", {
  id: id(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  bienId: text("bien_id").references(() => biens.id), // rendez-vous rattaché à un bien (cloisonnement 11.11)
  service: text("service").notNull(), // COMMERCIAL | SAV | ADMINISTRATIF | RECOUVREMENT
  dateProposee: timestamp("date_proposee", { withTimezone: true }).notNull(),
  statut: text("statut").notNull().default("PROPOSE"),
  dernierAuteur: text("dernier_auteur").notNull().default("CLIENT"), // CLIENT | SERVICE
  notes: text("notes"),
  traiteParId: text("traite_par_id").references(() => users.id),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Demandes de visite du bien (11.7 / 12.3)
// ---------------------------------------------------------------------------
// DEMANDEE | ACCEPTEE (autorisation émise, créneau à choisir) | PLANIFIEE | REFUSEE
export const visites = pgTable("visites", {
  id: id(),
  bienId: text("bien_id")
    .notNull()
    .references(() => biens.id),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  statut: text("statut").notNull().default("DEMANDEE"),
  dateVisite: timestamp("date_visite", { withTimezone: true }),
  autorisationUrl: text("autorisation_url"), // PDF « Autorisation de visite »
  motifRefus: text("motif_refus"),
  traiteParId: text("traite_par_id").references(() => users.id),
  createdAt: createdAt(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Photos d'avancement (11.3 / 12.4) — une demande tous les 6 mois par bien
// ---------------------------------------------------------------------------
// EN_ATTENTE | TRAITEE
export const demandesPhotos = pgTable("demandes_photos", {
  id: id(),
  bienId: text("bien_id")
    .notNull()
    .references(() => biens.id),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  statut: text("statut").notNull().default("EN_ATTENTE"),
  traiteParId: text("traite_par_id").references(() => users.id),
  traiteAt: timestamp("traite_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const photosAvancement = pgTable("photos_avancement", {
  id: id(),
  demandeId: text("demande_id").references(() => demandesPhotos.id),
  bienId: text("bien_id")
    .notNull()
    .references(() => biens.id),
  url: text("url").notNull(),
  legende: text("legende"),
  deposeParId: text("depose_par_id").references(() => users.id),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Syndic (2 ans obligatoire)
// ---------------------------------------------------------------------------
// A_PAYER | EN_ATTENTE_VALIDATION | PAYE
export const syndics = pgTable("syndics", {
  id: id(),
  bienId: text("bien_id")
    .notNull()
    .references(() => biens.id),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  montant: doublePrecision("montant").notNull(),
  periode: text("periode"), // "2 ans" | "Annuel"
  statut: text("statut").notNull().default("A_PAYER"),
  definiParId: text("defini_par_id").references(() => users.id), // SAV
  // Paiement déclaré par le client (12.2)
  natureOperation: text("nature_operation"),
  banque: text("banque"),
  dateOperation: timestamp("date_operation", { withTimezone: true }),
  porteur: text("porteur"),
  preuveUrl: text("preuve_url"),
  reference: text("reference"),
  payeAt: timestamp("paye_at", { withTimezone: true }),
  valideParId: text("valide_par_id").references(() => users.id), // Comptable Interne
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
// Destinataire : un utilisateur interne (recipientType = STAFF, userId) ou un
// client (recipientType = CLIENT, clientId).
export const notifications = pgTable("notifications", {
  id: id(),
  recipientType: text("recipient_type").notNull().default("STAFF"), // STAFF | CLIENT
  userId: text("user_id").references(() => users.id),
  clientId: text("client_id").references(() => clients.id),
  type: text("type").notNull(),
  titre: text("titre").notNull(),
  message: text("message"),
  lien: text("lien"),
  lu: boolean("lu").notNull().default(false),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Journal d'activité (traçabilité) : créations, modifications, suppressions,
// suspensions et restaurations. Les noms sont copiés au moment de l'action
// pour rester lisibles même si l'acteur ou la cible est supprimé ensuite.
// ---------------------------------------------------------------------------
export const journalActivite = pgTable("journal_activite", {
  id: id(),
  promoteurId: text("promoteur_id").references(() => promoteurs.id), // null : action de plateforme (Super Admin)
  acteurId: text("acteur_id"), // volontairement sans clé étrangère : la ligne survit à la suppression de l'acteur
  acteurNom: text("acteur_nom").notNull(),
  action: text("action").notNull(), // CREATION | MODIFICATION | SUPPRESSION | SUSPENSION | RESTAURATION
  cibleType: text("cible_type").notNull(), // user | client | promoteur | projet | bien
  cibleId: text("cible_id"),
  cibleNom: text("cible_nom").notNull(),
  details: text("details"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Travaux Modificatifs Acquéreurs (TMA) : demande du client → chiffrage et
// devis par le SAV → acceptation du devis (case horodatée, pas une signature
// électronique juridique) → travaux suivis jusqu'à leur fin.
// ---------------------------------------------------------------------------
export const demandesTma = pgTable("demandes_tma", {
  id: id(),
  bienId: text("bien_id")
    .notNull()
    .references(() => biens.id),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  description: text("description").notNull(),
  croquisUrl: text("croquis_url"), // photo ou croquis joint par le client
  // DEMANDE | CHIFFRE | SIGNE | EN_COURS | TERMINE | REFUSE
  statut: text("statut").notNull().default("DEMANDE"),
  montant: doublePrecision("montant"),
  devisUrl: text("devis_url"),
  motifRefus: text("motif_refus"),
  chiffreParId: text("chiffre_par_id").references(() => users.id),
  dateDemande: timestamp("date_demande", { withTimezone: true }).$defaultFn(() => new Date()),
  dateLimite: timestamp("date_limite", { withTimezone: true }), // blocage + délai du projet, figée à la demande
  signatureClientAt: timestamp("signature_client_at", { withTimezone: true }),
  createdAt: createdAt(),
});
