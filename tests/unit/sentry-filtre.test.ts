import { describe, expect, it } from "vitest";
import { MASQUE, masquerTexte, nettoyerValeur, nettoyerBreadcrumb, nettoyerEvenement, environnementSentry } from "@/lib/sentry-filtre";
import { optionsSentry } from "@/lib/sentry-options";

/*
 * Règle SECURITY.md « Suivi des erreurs (Sentry) et données personnelles » :
 * rien de sensible ne doit quitter l'application. Événements synthétiques.
 */
describe("Sentry : masquage dans un texte", () => {
  it("CIN, IBAN, téléphones, e-mail, cookie de session et jeton sont masqués", () => {
    const texte =
      "Client AB123456 (ou A 1234567), IBAN MA64011519000001205000534921, tél 06 12 34 56 78 / +212 6-12-34-56-78 / +33 6 12 34 56 78, " +
      "mail client.test@exemple.ma, cookie promopro_session=eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ4In0.abcdefghijklmnopqrstuvwxyz0123456789 ; jeton eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const masque = masquerTexte(texte);
    for (const secret of ["AB123456", "1234567", "MA6401", "06 12 34 56 78", "+212", "+33 6", "client.test@exemple.ma", "eyJhbGciOiJIUzI1NiJ9", "SflKxwRJ"]) {
      expect(masque, secret).not.toContain(secret);
    }
    expect(masque).toContain(MASQUE);
  });

  it("ne masque pas les textes ordinaires (désignations, statuts, identifiants de démo, dates)", () => {
    expect(masquerTexte("mot de passe saisi : secret-123, token=abc.def")).toBe(`mot de passe ${MASQUE}, token ${MASQUE}`);
    for (const t of ["Appartement A01 vendu", "Résidence Al Manar", "PDG-DEMO", "Failed query: select 1", "2026-09-23T16:18:24.244Z", "SQLITE_ERROR: no such table: epingles", "15 000 MAD"]) {
      expect(masquerTexte(t)).toBe(t);
    }
  });
});

describe("Sentry : nettoyage d'un événement", () => {
  const evenement = {
    message: "Échec pour AB123456",
    user: { id: "u1", email: "x@y.ma", ip_address: "1.2.3.4" },
    request: {
      url: "https://app/dashboard/clients?telephone=0612345678&nom=Test",
      query_string: { telephone: "0612345678", nom: "Test" },
      data: { motDePasse: "secret", nom: "Test" },
      cookies: { promopro_session: "jeton" },
      headers: { cookie: "promopro_session=abc", authorization: "Bearer x", "user-agent": "UA", host: "app" },
      env: { REMOTE_ADDR: "1.2.3.4" },
    },
    exception: {
      values: [
        {
          type: "Error",
          value: "SQLITE_ERROR près de CIN AB123456, mot de passe secret-123",
          stacktrace: { frames: [{ filename: "a.ts", vars: { motDePasse: "secret" }, pre_context: ["const cin = \"AB123456\";"], context_line: "throw new Error(\"tél 06 12 34 56 78\")", post_context: ["// mail x@y.ma"] }] },
        },
      ],
    },
    breadcrumbs: [
      { category: "ui.input", message: "input[name=pieceNumero]", data: { value: "AB123456" } },
      { category: "fetch", message: "POST /api/upload", data: { url: "/api/upload?token=abc", password: "x", statut: 200 } },
      { category: "console", message: "connexion de client.test@exemple.ma" },
    ],
    extra: { formulaire: { nom: "Test", passwordHash: "$2b$10$…", telephone1: "06 12 34 56 78", iban: "MA64011519000001205000534921", pieceNumero: "AB123456" }, token: "xyz", commentaire: "ras" },
    contexts: { nextjs: { request_path: "/api/test?cin=AB123456", route_type: "route" }, runtime: { name: "node" } },
    tags: { espace: "dashboard", identifiant: "PDG-DEMO" },
  };

  const nettoye = nettoyerEvenement(evenement);
  const json = JSON.stringify(nettoye);

  it("retire l'utilisateur, les cookies, le corps de requête, l'environnement et les en-têtes sensibles", () => {
    expect(nettoye.user).toBeUndefined();
    expect(nettoye.request?.data).toBeUndefined();
    expect(nettoye.request?.cookies).toBeUndefined();
    expect(nettoye.request?.env).toBeUndefined();
    expect(Object.keys(nettoye.request!.headers!)).toEqual(["user-agent", "host"]);
  });

  it("masque les valeurs des clés sensibles (mot de passe, hash, token, CIN, IBAN, téléphone) et les motifs dans les textes", () => {
    expect(nettoye.request?.query_string).toEqual({ telephone: MASQUE, nom: "Test" });
    expect(nettoye.extra).toEqual({
      formulaire: { nom: "Test", passwordHash: MASQUE, telephone1: MASQUE, iban: MASQUE, pieceNumero: MASQUE },
      token: MASQUE,
      commentaire: "ras",
    });
    expect(nettoye.exception?.values?.[0].value).toBe(`SQLITE_ERROR près de CIN ${MASQUE}, mot de passe ${MASQUE}`);
    expect(nettoye.exception?.values?.[0].stacktrace?.frames?.[0].vars).toBeUndefined();
    expect(nettoye.exception?.values?.[0].stacktrace?.frames?.[0]).toMatchObject({
      pre_context: [`const cin = "${MASQUE}";`],
      context_line: `throw new Error("tél ${MASQUE}")`,
      post_context: [`// mail ${MASQUE}`],
    });
    expect(nettoye.breadcrumbs?.[0].data).toEqual({ value: MASQUE });
    expect(nettoye.breadcrumbs?.[1].data).toEqual({ url: `/api/upload?token ${MASQUE}`, password: MASQUE, statut: 200 });
    expect(nettoye.breadcrumbs?.[2].message).toBe(`connexion de ${MASQUE}`);
    expect(nettoye.contexts).toEqual({ nextjs: { request_path: `/api/test?cin=${MASQUE}`, route_type: "route" }, runtime: { name: "node" } });
    expect(nettoye.tags).toEqual({ espace: "dashboard", identifiant: MASQUE });
    expect(nettoye.message).toBe(`Échec pour ${MASQUE}`);
  });

  it("aucune donnée sensible ne subsiste dans l'événement sérialisé", () => {
    for (const secret of ["AB123456", "0612345678", "secret", "$2b$", "MA6401", "06 12 34", "x@y.ma", "1.2.3.4", "jeton", "Bearer", "abc"]) {
      expect(json, secret).not.toContain(secret);
    }
  });

  it("ne modifie pas l'objet d'origine et borne la récursion (cycles)", () => {
    expect(evenement.extra.token).toBe("xyz");
    const cyclique: Record<string, unknown> = { a: 1 };
    cyclique.moi = cyclique;
    expect(nettoyerValeur(cyclique)).toEqual({ a: 1, moi: MASQUE });
    expect(nettoyerBreadcrumb({ message: "ok", data: { tel: "0612345678" } })).toEqual({ message: "ok", data: { tel: MASQUE } });
  });
});

describe("Sentry : options", () => {
  it("environnement : SENTRY_ENVIRONMENT, sinon NODE_ENV, sinon development", () => {
    expect(environnementSentry({ SENTRY_ENVIRONMENT: "production", NODE_ENV: "development" })).toBe("production");
    expect(environnementSentry({ NODE_ENV: "production" })).toBe("production");
    expect(environnementSentry({ NODE_ENV: "test" })).toBe("test");
    expect(environnementSentry({})).toBe("development");
  });

  it("sans DSN le SDK est désactivé ; jamais de PII par défaut, pas de traces, hooks de filtrage branchés", () => {
    const sans = optionsSentry({ dsn: "", environnement: "development" });
    expect(sans.enabled).toBe(false);
    expect(sans.dsn).toBeUndefined();
    const avec = optionsSentry({ dsn: "https://cle@o1.ingest.sentry.io/1", environnement: "production", release: "abc" });
    expect(avec.enabled).toBe(true);
    expect(avec.environment).toBe("production");
    expect(avec.release).toBe("abc");
    expect(avec.sendDefaultPii).toBe(false);
    expect(avec.tracesSampleRate).toBe(0);
    const evt = avec.beforeSend({ message: "tél 06 12 34 56 78", type: undefined } as never);
    expect(evt.message).toBe(`tél ${MASQUE}`);
    expect(avec.beforeBreadcrumb({ message: "x", data: { password: "p" } }).data).toEqual({ password: MASQUE });
  });
});
