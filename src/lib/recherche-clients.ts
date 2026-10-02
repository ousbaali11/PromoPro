import { normaliser } from "./recherche";

/*
 * Recherche de clients inter-commerciaux (détection de doublons), espace
 * Commercial et Responsable Commercial : par nom, prénom, date de naissance
 * ou numéro de pièce, parmi TOUS les clients du promoteur courant — y compris
 * ceux suivis par d'autres commerciaux —, à la différence de la liste
 * « Clients » limitée aux siens. Logique pure ici (critères, correspondance,
 * projection selon le droit de consultation) ; le cloisonnement par
 * promoteur est appliqué par la page avant d'appeler ces fonctions, et ne se
 * discute pas : aucun client d'un autre promoteur n'arrive jusqu'ici.
 *
 * Règle de confidentialité : pour un client qui n'appartient pas à celui qui
 * cherche, seule la projection « limitée » est construite — nom, prénom, date
 * de naissance, pièce, commercial qui le suit — et rien d'autre n'est
 * transmis au composant (ni adresse, ni téléphone, ni e-mail, ni identifiant,
 * ni lien vers le dossier).
 */

export type CriteresRecherche = { nom?: string; prenom?: string; dateNaissance?: string; piece?: string };

export type ClientRecherchable = {
  id: string;
  nom: string;
  prenom: string;
  dateNaissance: string | null;
  pieceType: string | null;
  pieceNumero: string | null;
  commercialId: string | null;
  telephone1?: string | null;
  email?: string | null;
  identifiant?: string;
  deletedAt?: Date | null;
};

/** Résultat limité (client d'un autre commercial) : rien d'autre que ce qui confirme l'identité et oriente vers le bon collègue. */
export type ResultatLimite = {
  detail: "limite";
  id: string;
  nom: string;
  prenom: string;
  dateNaissance: string | null;
  piece: string | null;
  commercial: string | null;
};

/** Résultat complet (client consultable par celui qui cherche) : les informations de la liste habituelle et le lien vers le dossier. */
export type ResultatComplet = {
  detail: "complet";
  id: string;
  nom: string;
  prenom: string;
  dateNaissance: string | null;
  piece: string | null;
  commercial: string | null;
  telephone: string | null;
  email: string | null;
  identifiant: string | null;
  href: string;
};

export type ResultatClient = ResultatLimite | ResultatComplet;

/** Numéro de pièce comparable : majuscules, lettres et chiffres seulement (« be 123-456 » ≡ « BE123456 »). */
export function pieceCanonique(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Critères nettoyés ; une valeur vide est retirée. */
export function nettoyerCriteres(brut: Record<string, string | string[] | undefined>): CriteresRecherche {
  const lire = (cle: string) => {
    const v = brut[cle];
    const texte = (Array.isArray(v) ? v[0] : v) ?? "";
    return texte.trim().slice(0, 80);
  };
  const c: CriteresRecherche = {};
  if (lire("nom")) c.nom = lire("nom");
  if (lire("prenom")) c.prenom = lire("prenom");
  if (/^\d{4}-\d{2}-\d{2}$/.test(lire("dateNaissance"))) c.dateNaissance = lire("dateNaissance");
  if (pieceCanonique(lire("piece")).length >= 2) c.piece = lire("piece");
  return c;
}

/** Au moins un critère exploitable (deux caractères utiles pour un nom ou un prénom). */
export function criteresValides(c: CriteresRecherche): boolean {
  return (
    (!!c.nom && normaliser(c.nom).length >= 2) ||
    (!!c.prenom && normaliser(c.prenom).length >= 2) ||
    !!c.dateNaissance ||
    (!!c.piece && pieceCanonique(c.piece).length >= 2)
  );
}

/**
 * Clients correspondant à tous les critères fournis (insensible à la casse et
 * aux accents ; date de naissance exacte ; pièce comparée sans espaces ni
 * ponctuation, correspondance exacte ou par début pour laisser chercher avec
 * les premiers caractères). Les comptes supprimés sont exclus. Triés par nom
 * puis prénom.
 */
export function rechercherClients<T extends ClientRecherchable>(clients: T[], c: CriteresRecherche): T[] {
  if (!criteresValides(c)) return [];
  const nom = c.nom ? normaliser(c.nom) : null;
  const prenom = c.prenom ? normaliser(c.prenom) : null;
  const piece = c.piece ? pieceCanonique(c.piece) : null;
  return clients
    .filter((cl) => !cl.deletedAt)
    .filter((cl) => {
      if (nom && !normaliser(cl.nom).includes(nom)) return false;
      if (prenom && !normaliser(cl.prenom).includes(prenom)) return false;
      if (c.dateNaissance && cl.dateNaissance !== c.dateNaissance) return false;
      if (piece) {
        const canon = cl.pieceNumero ? pieceCanonique(cl.pieceNumero) : "";
        if (!canon || !(canon === piece || canon.startsWith(piece))) return false;
      }
      return true;
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }) || a.prenom.localeCompare(b.prenom, "fr", { sensitivity: "base" }));
}

function libellePiece(cl: ClientRecherchable): string | null {
  if (!cl.pieceNumero) return null;
  return `${cl.pieceType === "PASSEPORT" ? "Passeport" : "CIN"} ${cl.pieceNumero}`;
}

/**
 * Projection d'un client selon le droit de consultation de celui qui cherche :
 * complète (avec lien vers le dossier) s'il peut consulter le dossier, limitée
 * sinon. La projection limitée est construite champ par champ : aucune donnée
 * privée n'y transite, même par mégarde.
 */
export function projeterResultat(cl: ClientRecherchable, options: { consultable: boolean; commercial: string | null }): ResultatClient {
  const base = { id: cl.id, nom: cl.nom, prenom: cl.prenom, dateNaissance: cl.dateNaissance, piece: libellePiece(cl), commercial: options.commercial };
  if (!options.consultable) return { detail: "limite", ...base };
  return {
    detail: "complet",
    ...base,
    telephone: cl.telephone1 ?? null,
    email: cl.email ?? null,
    identifiant: cl.identifiant ?? null,
    href: `/dashboard/clients/${cl.id}`,
  };
}
