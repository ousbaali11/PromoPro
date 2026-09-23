/*
 * Filtrage des données personnelles avant tout envoi à Sentry (client,
 * serveur, edge). Règle documentée dans SECURITY.md, « Suivi des erreurs
 * (Sentry) et données personnelles » ; testée dans tests/unit/sentry-filtre.test.ts.
 *
 * Aucune dépendance Node ni navigateur : ce module est importé par les trois
 * configurations Sentry.
 */

export const MASQUE = "[masqué]";

/** Clés (noms de champs, de paramètres, d'en-têtes) dont la valeur est toujours masquée, quel qu'en soit le contenu. */
export const CLES_SENSIBLES =
  /mot.?de.?passe|passw|pwd|hash|token|secret|authorization|cookie|session|jwt|\bcin\b|piece|iban|\brib\b|t[eé]l[eé]phone|phone|\btel\d*\b|gsm|mobile|e-?mail|courriel|identifiant|ip_address/i;

/** En-têtes HTTP retirés des événements (le cookie de session promopro_session y transite). */
export const ENTETES_RETIRES = ["cookie", "set-cookie", "authorization", "x-forwarded-for", "x-real-ip"];

/** Motifs masqués dans tout texte : cookie de session, jetons, IBAN, CIN marocaine, téléphones, e-mails. */
export const MOTIFS_TEXTE: { nom: string; motif: RegExp }[] = [
  { nom: "cookie de session", motif: /promopro_session=[^;\s"]+/g },
  // « mot de passe : xxx », « password=xxx », « token xxx » : la valeur qui suit le mot-clé
  { nom: "valeur après un mot-clé sensible", motif: /\b(mot\s?de\s?passe|password|passwd|pwd|token|secret|jeton)\b\s*(?:saisi|fourni|actuel|temporaire)?\s*[:=]?\s*([^\s,;"]+)/gi },
  { nom: "jeton (JWT)", motif: /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { nom: "IBAN", motif: /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30}\b/g },
  { nom: "CIN", motif: /\b[A-Z]{1,2}[ -]?\d{5,7}\b/g },
  { nom: "téléphone marocain", motif: /(?:\+?212|\b0)[\s.-]?[5-7](?:[\s.-]?\d){8}\b/g },
  { nom: "téléphone international", motif: /\+\d{1,3}[\s.-]?(?:\d[\s.-]?){7,13}\d\b/g },
  { nom: "e-mail", motif: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
];

/** Masque, dans un texte libre, tout ce qui ressemble à une donnée personnelle ou à un secret. */
export function masquerTexte(texte: string): string {
  let resultat = texte;
  for (const { nom, motif } of MOTIFS_TEXTE) {
    resultat = nom === "valeur après un mot-clé sensible" ? resultat.replace(motif, `$1 ${MASQUE}`) : resultat.replace(motif, MASQUE);
  }
  return resultat;
}

const PROFONDEUR_MAX = 8;

/**
 * Nettoie récursivement une valeur : la valeur d'une clé sensible est masquée
 * entièrement, chaque chaîne passe par masquerTexte, les objets et tableaux
 * sont parcourus (profondeur bornée, cycles ignorés).
 */
export function nettoyerValeur(valeur: unknown, cle?: string, profondeur = 0, vus = new WeakSet<object>()): unknown {
  if (cle && CLES_SENSIBLES.test(cle)) return valeur == null ? valeur : MASQUE;
  if (typeof valeur === "string") return masquerTexte(valeur);
  if (valeur == null || typeof valeur !== "object") return valeur;
  if (profondeur >= PROFONDEUR_MAX || vus.has(valeur)) return MASQUE;
  vus.add(valeur);
  if (Array.isArray(valeur)) return valeur.map((v) => nettoyerValeur(v, undefined, profondeur + 1, vus));
  const sortie: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valeur as Record<string, unknown>)) sortie[k] = nettoyerValeur(v, k, profondeur + 1, vus);
  return sortie;
}

type Dict = Record<string, unknown>;

/** Sous-ensemble de l'événement Sentry manipulé ici (types volontairement larges : le SDK peut évoluer). */
export type EvenementSentry = {
  message?: string;
  logentry?: { message?: string; params?: unknown[] };
  user?: unknown;
  request?: {
    url?: string;
    query_string?: unknown;
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
    env?: unknown;
  };
  exception?: {
    values?: {
      type?: string;
      value?: string;
      stacktrace?: { frames?: { vars?: unknown; pre_context?: string[]; context_line?: string; post_context?: string[] }[] };
    }[];
  };
  breadcrumbs?: Breadcrumb[];
  extra?: Dict;
  contexts?: Dict;
  tags?: Dict;
};

export type Breadcrumb = { message?: string; data?: Dict; category?: string };

/** Une miette de contexte (breadcrumb) : message et données nettoyés. */
export function nettoyerBreadcrumb<B extends Breadcrumb>(miette: B): B {
  const copie: Breadcrumb = { ...miette };
  if (typeof copie.message === "string") copie.message = masquerTexte(copie.message);
  if (copie.data) copie.data = nettoyerValeur(copie.data) as Dict;
  return copie as B;
}

/**
 * Hook `beforeSend` : retire l'utilisateur, les cookies, le corps et les
 * en-têtes sensibles de la requête, les variables locales des piles (et
 * masque les lignes de code de contexte), puis
 * masque clés et motifs sensibles partout ailleurs (message, exception,
 * miettes, extra, contexts, tags).
 */
export function nettoyerEvenement<E extends EvenementSentry>(evenement: E): E {
  const e: EvenementSentry = { ...evenement };
  delete e.user;

  if (e.request) {
    const req = { ...e.request };
    delete req.data;
    delete req.cookies;
    delete req.env;
    if (typeof req.url === "string") req.url = masquerTexte(req.url);
    if (req.query_string != null) req.query_string = nettoyerValeur(req.query_string);
    if (req.headers) {
      const entetes: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (ENTETES_RETIRES.includes(k.toLowerCase())) continue;
        entetes[k] = masquerTexte(String(v));
      }
      req.headers = entetes;
    }
    e.request = req;
  }

  if (typeof e.message === "string") e.message = masquerTexte(e.message);
  if (e.logentry) {
    e.logentry = {
      ...e.logentry,
      message: typeof e.logentry.message === "string" ? masquerTexte(e.logentry.message) : e.logentry.message,
      params: e.logentry.params?.map((p) => nettoyerValeur(p)),
    };
  }
  if (e.exception?.values) {
    e.exception = {
      ...e.exception,
      values: e.exception.values.map((v) => ({
        ...v,
        value: typeof v.value === "string" ? masquerTexte(v.value) : v.value,
        // variables locales retirées ; lignes de code de contexte masquées (un littéral dans le code ne doit pas fuir non plus)
        stacktrace: v.stacktrace
          ? {
              ...v.stacktrace,
              frames: v.stacktrace.frames?.map((f) => ({
                ...f,
                vars: undefined,
                pre_context: f.pre_context?.map(masquerTexte),
                context_line: typeof f.context_line === "string" ? masquerTexte(f.context_line) : f.context_line,
                post_context: f.post_context?.map(masquerTexte),
              })),
            }
          : v.stacktrace,
      })),
    };
  }
  if (e.breadcrumbs) e.breadcrumbs = e.breadcrumbs.map(nettoyerBreadcrumb);
  if (e.extra) e.extra = nettoyerValeur(e.extra) as Dict;
  if (e.contexts) e.contexts = nettoyerValeur(e.contexts) as Dict;
  if (e.tags) e.tags = nettoyerValeur(e.tags) as Dict;
  return e as E;
}

/** Environnement rapporté à Sentry : SENTRY_ENVIRONMENT, sinon NODE_ENV, sinon « development ». */
export function environnementSentry(env: { SENTRY_ENVIRONMENT?: string; NODE_ENV?: string } = {}): string {
  return env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV?.trim() || "development";
}
