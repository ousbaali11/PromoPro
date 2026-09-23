import type { Metadata } from "next";
import { PageLegale, ACompleter } from "@/components/legal/PageLegale";

export const metadata: Metadata = { title: "Mentions légales — PromoPro", robots: { index: false } };

/**
 * Mentions légales : structure standard, contenu factuel d'après ce que
 * l'application fait réellement. TEXTE PROVISOIRE — à faire valider par un
 * juriste avant publication ; les passages « [À compléter] » attendent l'éditeur.
 */
export default function MentionsLegalesPage() {
  return (
    <PageLegale
      titre="Mentions légales"
      sousTitre="Identité de l'éditeur, hébergement, propriété intellectuelle, cookies."
      miseAJour="24 septembre 2026"
      sections={[
        {
          id: "editeur",
          titre: "Éditeur du site",
          contenu: (
            <ul>
              <li>
                Dénomination sociale : <ACompleter>raison sociale de l&apos;éditeur</ACompleter>
              </li>
              <li>
                Forme juridique et capital : <ACompleter />
              </li>
              <li>
                Siège social : <ACompleter>adresse complète</ACompleter>
              </li>
              <li>
                Registre de commerce, identifiant fiscal, ICE : <ACompleter />
              </li>
              <li>
                Directeur de la publication : <ACompleter>nom et qualité</ACompleter>
              </li>
              <li>
                Contact : <ACompleter>adresse e-mail et téléphone</ACompleter>
              </li>
            </ul>
          ),
        },
        {
          id: "hebergement",
          titre: "Hébergement",
          contenu: (
            <>
              <p>
                L&apos;application et sa base de données sont hébergées sur la plateforme <strong>Railway</strong> (Railway Corporation) ; les
                fichiers déposés (pièces d&apos;identité, preuves de paiement, contrats, plans, photos, devis) sont stockés sur un volume
                persistant de ce même hébergeur. Région d&apos;hébergement : <ACompleter>région Railway du projet</ACompleter>.
              </p>
              <p>
                Le suivi des erreurs techniques est confié à <strong>Sentry</strong> (Functional Software, Inc.), après filtrage des données
                personnelles (voir la politique de confidentialité). Région : <ACompleter>EU ou US selon l&apos;organisation Sentry</ACompleter>.
              </p>
            </>
          ),
        },
        {
          id: "objet",
          titre: "Objet du service",
          contenu: (
            <p>
              PromoPro est une plateforme de gestion à l&apos;usage des promoteurs immobiliers et de leurs équipes (projets, biens,
              propositions de vente, contrats, paiements, service après-vente) et de leurs clients acquéreurs (espace client :
              échéancier, paiements, documents, visites, livraison). L&apos;accès est réservé aux comptes créés par le promoteur ; aucune
              inscription publique n&apos;est possible.
            </p>
          ),
        },
        {
          id: "propriete",
          titre: "Propriété intellectuelle",
          contenu: (
            <p>
              La structure, le code et les éléments graphiques de l&apos;application sont la propriété de l&apos;éditeur
              <ACompleter>ou du prestataire, selon le contrat</ACompleter>. Les données saisies par un promoteur et ses clients restent la
              propriété de ce promoteur. Toute reproduction non autorisée est interdite. <ACompleter>licence et conditions à préciser</ACompleter>
            </p>
          ),
        },
        {
          id: "cookies",
          titre: "Cookies",
          contenu: (
            <>
              <p>
                L&apos;application dépose un seul cookie, strictement nécessaire au fonctionnement : <code>promopro_session</code>, qui
                identifie la session de l&apos;utilisateur connecté (signé, inaccessible aux scripts, durée maximale de 7 jours, supprimé à la
                déconnexion). Il n&apos;est pas utilisé à des fins publicitaires ni de mesure d&apos;audience.
              </p>
              <p>Aucun traceur tiers, aucun outil de mesure d&apos;audience ni réseau social n&apos;est intégré.</p>
            </>
          ),
        },
        {
          id: "responsabilite",
          titre: "Responsabilité et droit applicable",
          contenu: (
            <p>
              <ACompleter>Limitation de responsabilité, droit applicable (droit marocain, loi 09-08 relative à la protection des personnes
              physiques à l&apos;égard du traitement des données à caractère personnel) et juridiction compétente : à rédiger par un juriste.</ACompleter>
            </p>
          ),
        },
      ]}
    />
  );
}
