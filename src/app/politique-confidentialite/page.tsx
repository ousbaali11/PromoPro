import type { Metadata } from "next";
import { PageLegale, ACompleter } from "@/components/legal/PageLegale";

export const metadata: Metadata = { title: "Politique de confidentialité — PromoPro", robots: { index: false } };

/**
 * Politique de confidentialité : liste FACTUELLE des données que l'application
 * collecte réellement (voir src/db/schema.sqlite.ts), finalités, conservation,
 * droits. TEXTE PROVISOIRE — à faire valider par un juriste avant publication.
 */
export default function PolitiqueConfidentialitePage() {
  return (
    <PageLegale
      titre="Politique de confidentialité"
      sousTitre="Quelles données sont collectées, pourquoi, combien de temps, et vos droits."
      miseAJour="24 septembre 2026"
      sections={[
        {
          id: "responsable",
          titre: "Responsable du traitement",
          contenu: (
            <p>
              Les données des clients acquéreurs et des équipes sont traitées pour le compte de chaque <strong>promoteur immobilier</strong>
              utilisateur de la plateforme, qui en est le responsable de traitement ; l&apos;éditeur de PromoPro intervient comme
              sous-traitant technique. <ACompleter>identité et coordonnées du responsable, contrat de sous-traitance — qualification à valider</ACompleter>
            </p>
          ),
        },
        {
          id: "donnees",
          titre: "Données collectées",
          contenu: (
            <>
              <p>Uniquement les données saisies par le promoteur, ses équipes ou le client dans le cadre du service :</p>
              <ul>
                <li>
                  <strong>Comptes internes</strong> (équipes du promoteur) : nom, prénom, rôle, identifiant de connexion, e-mail
                  professionnel facultatif, mot de passe (stocké uniquement sous forme hachée).
                </li>
                <li>
                  <strong>Clients acquéreurs</strong> : nom, prénom, date et lieu de naissance, adresse, type et numéro de pièce
                  d&apos;identité (CIN ou passeport) et sa copie numérisée, téléphones, e-mail, identifiant de connexion, mot de passe haché,
                  commercial référent.
                </li>
                <li>
                  <strong>Données de vente et financières</strong> : bien acquis, prix, échéancier de paiement, paiements déclarés et
                  validés (montant, nature de l&apos;opération, banque, référence, date, preuve de paiement, porteur de l&apos;opération et
                  copie de sa pièce d&apos;identité), reçus, contrat de vente et sa copie signée, désistements (document légalisé, montant
                  remboursé), part de syndic et preuve de règlement, IBAN du compte du projet (données du promoteur).
                </li>
                <li>
                  <strong>Suivi du bien</strong> : demandes de visite et autorisations, rendez-vous, demandes de photos d&apos;avancement,
                  livraison, demandes de travaux modificatifs (description, croquis, devis, acceptation horodatée).
                </li>
                <li>
                  <strong>Prospects</strong> (personnes contactées par le promoteur avant toute vente) : nom, téléphone, source
                  (portail immobilier, salon…), retour d&apos;appel.
                </li>
                <li>
                  <strong>Journal d&apos;activité et notifications</strong> : qui a créé, modifié, suspendu, supprimé, restauré ou importé
                  quoi, et quand ; notifications internes.
                </li>
                <li>
                  <strong>Données techniques</strong> : adresse IP conservée en mémoire au plus 15 minutes pour limiter les tentatives de
                  connexion ; erreurs techniques transmises à Sentry après suppression des données personnelles (mots de passe, jetons,
                  cookie, CIN, IBAN, téléphones, e-mails, corps des formulaires).
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "finalites",
          titre: "Finalités et bases légales",
          contenu: (
            <>
              <ul>
                <li>Gestion commerciale et administrative des ventes immobilières (propositions, contrats, échéanciers).</li>
                <li>Suivi et justification des paiements, reçus, remboursements ; obligations comptables.</li>
                <li>Relation avec l&apos;acquéreur après la vente : visites, livraison, syndic, travaux modificatifs, rappels d&apos;échéance.</li>
                <li>Prospection commerciale du promoteur (prospects).</li>
                <li>Sécurité du service (authentification, contrôle d&apos;accès par rôle et par promoteur, traçabilité, suivi des erreurs).</li>
              </ul>
              <p>
                Bases légales pressenties : exécution du contrat de vente et des mesures précontractuelles, obligations légales
                (comptables, fiscales), intérêt légitime pour la sécurité et la prospection. <ACompleter>à qualifier par un juriste au regard de la loi 09-08 et, le cas échéant, du RGPD</ACompleter>
              </p>
            </>
          ),
        },
        {
          id: "destinataires",
          titre: "Destinataires et accès",
          contenu: (
            <>
              <p>
                Chaque donnée n&apos;est visible que par le personnel habilité du promoteur concerné, selon son rôle (un commercial ne voit
                que ses clients, le service comptable les paiements, etc.), et par le client acquéreur pour son propre dossier. Les
                données d&apos;un promoteur ne sont jamais accessibles à un autre promoteur.
              </p>
              <p>
                Sous-traitants techniques : Railway (hébergement de l&apos;application, de la base et des fichiers), Sentry (erreurs
                techniques, données personnelles filtrées), GitHub (sauvegardes chiffrées en transit, conservées 30 jours).
                <ACompleter>régions et garanties de transfert à préciser</ACompleter>
              </p>
            </>
          ),
        },
        {
          id: "conservation",
          titre: "Durée de conservation",
          contenu: (
            <>
              <p>
                Fonctionnement actuel de l&apos;application : la suppression d&apos;un compte est une <strong>suppression douce</strong> — la
                connexion est refusée et le compte sort des listes actives, mais les données et l&apos;historique (ventes, paiements,
                journal) restent en base pour préserver la traçabilité. Les sauvegardes quotidiennes sont conservées 30 jours.
              </p>
              <p>
                Durées à fixer : <ACompleter>durée de conservation des dossiers de vente après livraison, des pièces d&apos;identité, des
                prospects sans suite, du journal d&apos;activité ; procédure d&apos;effacement définitif — à définir avec un juriste selon les
                obligations comptables et contractuelles</ACompleter>
              </p>
            </>
          ),
        },
        {
          id: "droits",
          titre: "Vos droits",
          contenu: (
            <>
              <p>
                Conformément à la loi 09-08 <ACompleter>et au RGPD si des personnes résidant dans l&apos;Union européenne sont concernées</ACompleter>,
                toute personne dispose d&apos;un droit d&apos;accès, de rectification, d&apos;opposition et, dans les conditions prévues par la
                loi, d&apos;effacement de ses données. Un client peut consulter et signaler une correction de ses informations à son
                commercial référent ; l&apos;équipe du promoteur les corrige depuis sa fiche (modification tracée au journal).
              </p>
              <p>
                Contact pour l&apos;exercice des droits : <ACompleter>adresse e-mail du promoteur / délégué</ACompleter>. Autorité de contrôle :
                Commission nationale de contrôle de la protection des données à caractère personnel (CNDP) <ACompleter>numéro de déclaration ou d&apos;autorisation du traitement</ACompleter>.
              </p>
            </>
          ),
        },
        {
          id: "securite",
          titre: "Sécurité",
          contenu: (
            <ul>
              <li>Mots de passe hachés (bcrypt), sessions signées, cookie inaccessible aux scripts, connexion limitée en tentatives.</li>
              <li>Contrôle d&apos;accès par rôle et cloisonnement strict entre promoteurs, vérifiés par des tests automatisés.</li>
              <li>Fichiers servis uniquement aux personnes rattachées au dossier, contenu vérifié au dépôt, types et tailles limités.</li>
              <li>Sauvegardes quotidiennes de la base avec restauration vérifiée chaque semaine.</li>
              <li>Chiffrement en transit (HTTPS) assuré par l&apos;hébergeur. <ACompleter>chiffrement au repos : à confirmer avec l&apos;hébergeur</ACompleter></li>
            </ul>
          ),
        },
        {
          id: "cookies",
          titre: "Cookies",
          contenu: (
            <p>
              Un seul cookie technique de session (<code>promopro_session</code>, 7 jours au plus), aucun cookie publicitaire ni de mesure
              d&apos;audience. Détail dans les mentions légales.
            </p>
          ),
        },
      ]}
    />
  );
}
