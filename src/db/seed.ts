/* eslint-disable no-console */
import { eq } from "drizzle-orm";
import { db, client as libsqlClient } from "./client";
import {
  promoteurs,
  users,
  projets,
  biens,
  clients,
  propositions,
  echeances,
  paiements,
  prospects,
  notifications,
  contrats,
} from "./schema";
import { hashPassword } from "../lib/auth";
import { defaultEcheancier } from "../lib/utils";
import { genererEtStockerContrat } from "../lib/pdf/contrat";
import { genererEtStockerRecu } from "../lib/pdf/recu";

async function main() {
  console.log("→ Nettoyage des tables...");
  for (const table of [
    "notifications",
    "paiements",
    "echeances",
    "propositions",
    "prospects",
    "desistements",
    "contrats",
    "syndics",
    "rendezvous",
    "biens",
    "clients",
    "projets",
    "users",
    "promoteurs",
  ]) {
    await libsqlClient.execute(`DELETE FROM ${table};`);
  }

  console.log("→ Création du promoteur PromoPro...");
  const [promopro] = await db
    .insert(promoteurs)
    .values({
      nom: "PromoPro",
      contactEmail: "contact@promopro.ma",
      contactTelephone: "+212 5 00 00 00 00",
      statut: "ACTIF",
      abonnementFormule: "Annuel",
      abonnementDebut: new Date(),
      abonnementFin: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    })
    .returning();

  console.log("→ Création des utilisateurs (un par rôle)...");
  const pw = await hashPassword("demo1234");
  const superAdminPw = await hashPassword("admin1234");

  const staff = {
    superAdmin: { role: "SUPER_ADMIN", nom: "Plateforme", prenom: "Admin", identifiant: "SUPERADMIN", promoteurId: null as string | null, passwordHash: superAdminPw },
    pdg: { role: "PDG", nom: "Alaoui", prenom: "Karim", identifiant: "PDG-DEMO" },
    dircom: { role: "DIRECTEUR_COMMERCIAL", nom: "Bennis", prenom: "Sara", identifiant: "DIRCOM-DEMO" },
    com1: { role: "COMMERCIAL", nom: "Idrissi", prenom: "Youssef", identifiant: "COM1-DEMO" },
    com2: { role: "COMMERCIAL", nom: "Tazi", prenom: "Imane", identifiant: "COM2-DEMO" },
    respAdm: { role: "RESPONSABLE_ADMINISTRATIF", nom: "El Fassi", prenom: "Nadia", identifiant: "RESPADM-DEMO" },
    dirFin: { role: "DIRECTEUR_FINANCIER", nom: "Chraibi", prenom: "Omar", identifiant: "DIRFIN-DEMO" },
    compta: { role: "COMPTABLE_INTERNE", nom: "Lahlou", prenom: "Salma", identifiant: "COMPTA-DEMO" },
    assist: { role: "ASSISTANT_ADMINISTRATIF", nom: "Berrada", prenom: "Hicham", identifiant: "ASSIST-DEMO" },
    sav: { role: "SERVICE_APRES_VENTE", nom: "Ziani", prenom: "Fatima", identifiant: "SAV-DEMO" },
    recouv: { role: "RECOUVREMENT", nom: "Amrani", prenom: "Rachid", identifiant: "RECOUV-DEMO" },
  } as const;

  const insertedUsers: Record<string, typeof users.$inferSelect> = {};
  let i = 0;
  for (const [key, u] of Object.entries(staff)) {
    i++;
    const [row] = await db
      .insert(users)
      .values({
        promoteurId: key === "superAdmin" ? null : promopro.id,
        role: u.role,
        nom: u.nom,
        prenom: u.prenom,
        identifiant: u.identifiant,
        passwordHash: "passwordHash" in u ? u.passwordHash : pw,
        email: `${u.identifiant.toLowerCase()}@promopro.ma`,
        telephone: key === "superAdmin" ? null : `+212 6 61 00 00 ${String(i).padStart(2, "0")}`,
      })
      .returning();
    insertedUsers[key] = row;
  }

  console.log("→ Création du projet Résidence Al Manar...");
  const [projet] = await db
    .insert(projets)
    .values({
      promoteurId: promopro.id,
      nom: "Résidence Al Manar",
      nomCompte: "SCI Al Manar",
      iban: "MA00 0000 0000 0000 0000 0000",
      createdById: insertedUsers.dircom.id,
    })
    .returning();

  console.log("→ Création des biens...");
  const biensData = [
    { designation: "Appartement A01", nature: "Appartement", prix: 850_000, surface: 68 },
    { designation: "Appartement A02", nature: "Appartement", prix: 920_000, surface: 74 },
    { designation: "Appartement B01", nature: "Appartement", prix: 1_050_000, surface: 82 },
    { designation: "Appartement B02", nature: "Appartement", prix: 780_000, surface: 61 },
    { designation: "Parking P01", nature: "Parking", prix: 90_000, surface: 12 },
  ];
  const insertedBiens: (typeof biens.$inferSelect)[] = [];
  for (const b of biensData) {
    const [row] = await db.insert(biens).values({ ...b, projetId: projet.id }).returning();
    insertedBiens.push(row);
  }

  // Bien bloqué par le PDG (avec commentaire privé)
  await db
    .update(biens)
    .set({ statut: "BLOQUE_PDG", pdgCommentaire: "Réservé pour un partenaire — ne pas exploiter avant nouvel ordre." })
    .where(eq(biens.id, insertedBiens[3].id));

  console.log("→ Création du client de démonstration...");
  const [demoClient] = await db
    .insert(clients)
    .values({
      promoteurId: promopro.id,
      nom: "Naciri",
      prenom: "Hamid",
      dateNaissance: "1985-03-12",
      lieuNaissance: "Casablanca",
      adresse: "12 rue des Orangers, Casablanca",
      pieceType: "CIN",
      pieceNumero: "BE123456",
      telephone1: "+212 6 00 11 22 33",
      email: "hamid.naciri@example.com",
      identifiant: "CL-DEMO",
      passwordHash: pw,
      commercialId: insertedUsers.com1.id,
    })
    .returning();

  console.log("→ Vente conclue sur l'Appartement A01 (proposition acceptée)...");
  const bienVendu = insertedBiens[0];
  const [propAcceptee] = await db
    .insert(propositions)
    .values({
      bienId: bienVendu.id,
      commercialId: insertedUsers.com1.id,
      clientId: demoClient.id,
      statut: "ACCEPTEE",
      decidedAt: new Date(),
    })
    .returning();

  await db.update(biens).set({ statut: "VENDU", commercialId: insertedUsers.com1.id, clientId: demoClient.id }).where(eq(biens.id, bienVendu.id));

  const echeancier = defaultEcheancier(bienVendu.prix, new Date(Date.now() - 40 * 24 * 3600 * 1000));
  for (const [i, e] of echeancier.entries()) {
    await db.insert(echeances).values({
      propositionId: propAcceptee.id,
      bienId: bienVendu.id,
      numero: e.numero,
      pourcentage: e.pourcentage,
      montant: e.montant,
      dateEcheance: e.dateEcheance,
      montantPaye: i === 0 ? e.montant : 0,
      statut: i === 0 ? "PAYEE" : "EN_ATTENTE",
    });
  }

  const echeancesA01 = (await db.select().from(echeances)).filter((e) => e.propositionId === propAcceptee.id);
  const firstEcheance = echeancesA01.find((e) => e.numero === 1);
  const [paiement1] = await db
    .insert(paiements)
    .values({
      bienId: bienVendu.id,
      clientId: demoClient.id,
      echeanceId: firstEcheance?.id,
      trancheNumero: 1,
      montant: Math.round(bienVendu.prix * 0.4),
      devise: "MAD",
      natureOperation: "virement local",
      banque: "Attijariwafa Bank",
      dateOperation: new Date(Date.now() - 40 * 24 * 3600 * 1000),
      porteur: "Hamid Naciri",
      reference: "VIR-2026-00458",
      montantExact: Math.round(bienVendu.prix * 0.4),
      dateReception: new Date(Date.now() - 39 * 24 * 3600 * 1000),
      statut: "VALIDE",
      saisiParId: insertedUsers.com1.id,
      valideParId: insertedUsers.compta.id,
      validatedAt: new Date(Date.now() - 39 * 24 * 3600 * 1000),
    })
    .returning();

  console.log("→ Génération du contrat et du reçu PDF de la vente A01...");
  const bienA01 = (await db.query.biens.findFirst({ where: eq(biens.id, bienVendu.id) }))!;
  const recuPdfUrl = await genererEtStockerRecu(paiement1, bienA01, demoClient, {
    projet,
    promoteur: promopro,
    echeance: firstEcheance,
    validePar: `${insertedUsers.compta.prenom} ${insertedUsers.compta.nom}`,
  });
  await db.update(paiements).set({ recuPdfUrl }).where(eq(paiements.id, paiement1.id));

  const contratPdfUrl = await genererEtStockerContrat(bienA01, demoClient, echeancesA01, {
    projet,
    promoteur: promopro,
    paiements: [{ ...paiement1, recuPdfUrl }],
  });
  await db.insert(contrats).values({
    bienId: bienVendu.id,
    statut: "PRET",
    pdfUrl: contratPdfUrl,
    confirmedAt: new Date(Date.now() - 35 * 24 * 3600 * 1000),
  });

  console.log("→ Proposition en attente de décision PDG (Appartement A02)...");
  await db.insert(propositions).values({
    bienId: insertedBiens[1].id,
    commercialId: insertedUsers.com2.id,
    clientId: demoClient.id,
    statut: "ENVOYEE",
  });
  await db.update(biens).set({ statut: "PROPOSITION_EN_COURS", commercialId: insertedUsers.com2.id }).where(eq(biens.id, insertedBiens[1].id));

  console.log("→ Prospects de démonstration...");
  await db.insert(prospects).values([
    { promoteurId: promopro.id, nom: "Yassine Alami", telephone: "+212 6 12 34 56 78", source: "Avito", commercialId: insertedUsers.com1.id, statutContact: "NON_CONTACTE" },
    { promoteurId: promopro.id, nom: "Laila Benjelloun", telephone: "+212 6 22 33 44 55", source: "Mubawab", commercialId: insertedUsers.com1.id, statutContact: "CONTACTE", retourClient: "Intéressée, rappeler dans 2 semaines." },
    { promoteurId: promopro.id, nom: "Omar Saidi", telephone: "+212 6 33 44 55 66", source: "Avito", commercialId: insertedUsers.com2.id, statutContact: "NON_CONTACTE" },
  ]);

  console.log("→ Notifications de démonstration...");
  await db.insert(notifications).values([
    { userId: insertedUsers.pdg.id, type: "PROPOSITION", titre: "Nouvelle proposition de vente", message: `${insertedUsers.com2.prenom} ${insertedUsers.com2.nom} propose l'Appartement A02.`, lien: "/dashboard/propositions" },
    { userId: insertedUsers.com1.id, type: "AFFAIRE_CONCRETISEE", titre: "Affaire concrétisée", message: "Votre vente de l'Appartement A01 a été validée par le PDG.", lien: "/dashboard/projets" },
  ]);

  console.log("\n✅ Seed terminé.\n");
  console.log("Identifiants de démonstration (mot de passe entre parenthèses) :");
  console.log("  Super Admin        SUPERADMIN   (admin1234)");
  for (const [key, u] of Object.entries(staff)) {
    if (key === "superAdmin") continue;
    console.log(`  ${u.role.padEnd(18)} ${u.identifiant.padEnd(12)} (demo1234)`);
  }
  console.log("  CLIENT             CL-DEMO      (demo1234)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    libsqlClient.close();
  });
