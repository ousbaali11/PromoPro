import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date());

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
export const promoteurs = sqliteTable("promoteurs", {
  id: id(),
  nom: text("nom").notNull(),
  contactEmail: text("contact_email"),
  contactTelephone: text("contact_telephone"),
  // EN_ATTENTE | ACTIF | SUSPENDU
  statut: text("statut").notNull().default("EN_ATTENTE"),
  abonnementFormule: text("abonnement_formule"), // ex: "Annuel", "Mensuel"
  abonnementDebut: integer("abonnement_debut", { mode: "timestamp" }),
  abonnementFin: integer("abonnement_fin", { mode: "timestamp" }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Utilisateurs (tous rôles confondus, y compris Super Admin: promoteurId=null)
// ---------------------------------------------------------------------------
export const users = sqliteTable("users", {
  id: id(),
  promoteurId: text("promoteur_id").references(() => promoteurs.id),
  role: text("role").notNull().$type<Role>(),
  nom: text("nom").notNull(),
  prenom: text("prenom").notNull(),
  identifiant: text("identifiant").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  email: text("email"),
  telephone: text("telephone"),
  actif: integer("actif", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Projets & Biens
// ---------------------------------------------------------------------------
export const projets = sqliteTable("projets", {
  id: id(),
  promoteurId: text("promoteur_id")
    .notNull()
    .references(() => promoteurs.id),
  nom: text("nom").notNull(),
  nomCompte: text("nom_compte").notNull(),
  iban: text("iban").notNull(),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: createdAt(),
});

// DISPONIBLE | BLOQUE_PDG | PROPOSITION_EN_COURS | VENDU | DESISTE | LIVRE
export const biens = sqliteTable("biens", {
  id: id(),
  projetId: text("projet_id")
    .notNull()
    .references(() => projets.id),
  designation: text("designation").notNull(), // ex: "Appartement B12"
  nature: text("nature").notNull().default("Appartement"), // Appartement | Parking | Local...
  prix: real("prix").notNull(),
  surface: real("surface").notNull(),
  planUrl: text("plan_url"),
  statut: text("statut").notNull().default("DISPONIBLE"),
  commercialId: text("commercial_id").references(() => users.id),
  clientId: text("client_id").references(() => clients.id),
  pdgCommentaire: text("pdg_commentaire"), // note privée, visible PDG seulement
  // Livraison (11.10 / 12.1) : double confirmation client + SAV → statut LIVRE
  livraisonConfirmeeClient: integer("livraison_confirmee_client", { mode: "boolean" }).notNull().default(false),
  livraisonConfirmeeSav: integer("livraison_confirmee_sav", { mode: "boolean" }).notNull().default(false),
  livreAt: integer("livre_at", { mode: "timestamp" }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Clients (acquéreurs)
// ---------------------------------------------------------------------------
export const clients = sqliteTable("clients", {
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
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Propositions de vente (commercial -> PDG)
// ---------------------------------------------------------------------------
// ENVOYEE | ACCEPTEE | REFUSEE | NEGOCIEE | DESISTEE (vente annulée après désistement du client)
export const propositions = sqliteTable("propositions", {
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
  decidedAt: integer("decided_at", { mode: "timestamp" }),
});

// Échéancier de paiement rattaché à une proposition/bien
// EN_ATTENTE | PARTIELLE | PAYEE
export const echeances = sqliteTable("echeances", {
  id: id(),
  propositionId: text("proposition_id")
    .notNull()
    .references(() => propositions.id),
  bienId: text("bien_id")
    .notNull()
    .references(() => biens.id),
  numero: integer("numero").notNull(),
  pourcentage: real("pourcentage").notNull(),
  montant: real("montant").notNull(),
  dateEcheance: integer("date_echeance", { mode: "timestamp" }).notNull(),
  montantPaye: real("montant_paye").notNull().default(0),
  statut: text("statut").notNull().default("EN_ATTENTE"),
});

// ---------------------------------------------------------------------------
// Contrats
// ---------------------------------------------------------------------------
// EN_ATTENTE | PRET | ENVOYE | SIGNE | ANNULE (désistement)
export const contrats = sqliteTable("contrats", {
  id: id(),
  bienId: text("bien_id")
    .notNull()
    .references(() => biens.id),
  statut: text("statut").notNull().default("EN_ATTENTE"),
  pdfUrl: text("pdf_url"),
  copieSigneeUrl: text("copie_signee_url"), // 4e copie scannée
  createdAt: createdAt(),
  confirmedAt: integer("confirmed_at", { mode: "timestamp" }),
});

// ---------------------------------------------------------------------------
// Paiements (tranches)
// ---------------------------------------------------------------------------
// EN_ATTENTE_COMPTABLE | VALIDE
export const paiements = sqliteTable("paiements", {
  id: id(),
  bienId: text("bien_id")
    .notNull()
    .references(() => biens.id),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  echeanceId: text("echeance_id").references(() => echeances.id),
  trancheNumero: integer("tranche_numero"),
  montant: real("montant").notNull(),
  devise: text("devise").notNull().default("MAD"),
  natureOperation: text("nature_operation"), // virement local | virement international | versement | cheque
  banque: text("banque"),
  dateOperation: integer("date_operation", { mode: "timestamp" }),
  dateEncaissementCheque: integer("date_encaissement_cheque", { mode: "timestamp" }),
  porteur: text("porteur"),
  porteurPieceUrl: text("porteur_piece_url"), // pièce d'identité du porteur s'il diffère du client (6.8)
  preuveUrl: text("preuve_url"),
  reference: text("reference"),
  montantExact: real("montant_exact"),
  dateReception: integer("date_reception", { mode: "timestamp" }),
  statut: text("statut").notNull().default("EN_ATTENTE_COMPTABLE"),
  recuPdfUrl: text("recu_pdf_url"),
  // Auteur de la saisie : un utilisateur interne (commercial, recouvrement...) OU le client lui-même
  saisiParId: text("saisi_par_id").references(() => users.id),
  saisiParClientId: text("saisi_par_client_id").references(() => clients.id),
  valideParId: text("valide_par_id").references(() => users.id),
  validatedAt: integer("validated_at", { mode: "timestamp" }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Désistements
// ---------------------------------------------------------------------------
// EN_ATTENTE | VERIFIE | REMBOURSE
export const desistements = sqliteTable("desistements", {
  id: id(),
  bienId: text("bien_id")
    .notNull()
    .references(() => biens.id),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  commercialId: text("commercial_id").references(() => users.id), // commercial ayant enregistré le désistement
  documentUrl: text("document_url"),
  montantARembourser: real("montant_a_rembourser").notNull().default(0), // total des paiements validés au moment du désistement
  statut: text("statut").notNull().default("EN_ATTENTE"),
  dechargeNote: text("decharge_note"), // décharge fournie ou non, commentaire du Responsable Administratif
  traiteParId: text("traite_par_id").references(() => users.id),
  verifiedAt: integer("verified_at", { mode: "timestamp" }),
  rembourseAt: integer("rembourse_at", { mode: "timestamp" }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Prospects (leads assistant administratif)
// ---------------------------------------------------------------------------
// NON_CONTACTE | CONTACTE
export const prospects = sqliteTable("prospects", {
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
// PROPOSE | ACCEPTE | REPROPOSE
export const rendezvous = sqliteTable("rendezvous", {
  id: id(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  service: text("service").notNull(), // COMMERCIAL | SAV | ADMINISTRATIF | RECOUVREMENT
  dateProposee: integer("date_proposee", { mode: "timestamp" }).notNull(),
  statut: text("statut").notNull().default("PROPOSE"),
  notes: text("notes"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Syndic (2 ans obligatoire)
// ---------------------------------------------------------------------------
// A_PAYER | EN_ATTENTE_VALIDATION | PAYE
export const syndics = sqliteTable("syndics", {
  id: id(),
  bienId: text("bien_id")
    .notNull()
    .references(() => biens.id),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  montant: real("montant").notNull(),
  periode: text("periode"), // "2 ans" | "Annuel"
  statut: text("statut").notNull().default("A_PAYER"),
  preuveUrl: text("preuve_url"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
// Destinataire : un utilisateur interne (recipientType = STAFF, userId) ou un
// client (recipientType = CLIENT, clientId).
export const notifications = sqliteTable("notifications", {
  id: id(),
  recipientType: text("recipient_type").notNull().default("STAFF"), // STAFF | CLIENT
  userId: text("user_id").references(() => users.id),
  clientId: text("client_id").references(() => clients.id),
  type: text("type").notNull(),
  titre: text("titre").notNull(),
  message: text("message"),
  lien: text("lien"),
  lu: integer("lu", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});
