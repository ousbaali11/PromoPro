import { describe, expect, it } from "vitest";
import {
  DUREE_JETON_MS,
  MESSAGE_DEMANDE_ENVOYEE,
  courrielReinitialisation,
  dateExpiration,
  empreinteJeton,
  genererJeton,
  jetonPlausible,
  jetonUtilisable,
  verifierNouveauMotDePasse,
} from "@/lib/reinitialisation-regles";
import { masquerEmail } from "@/lib/mot-de-passe-oublie";

describe("jeton de réinitialisation", () => {
  it("génère un jeton aléatoire de 43 caractères base64url, différent à chaque appel, reconnu comme plausible", () => {
    const a = genererJeton();
    const b = genererJeton();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(jetonPlausible(a)).toBe(true);
    expect(jetonPlausible("")).toBe(false);
    expect(jetonPlausible("abc")).toBe(false);
    expect(jetonPlausible(`${a}'`)).toBe(false);
  });

  it("l'empreinte est déterministe, ne contient pas le jeton et diffère d'un jeton à l'autre", () => {
    const jeton = genererJeton();
    const e = empreinteJeton(jeton);
    expect(e).toBe(empreinteJeton(jeton));
    expect(e).toMatch(/^[0-9a-f]{64}$/);
    expect(e).not.toContain(jeton);
    expect(e).not.toBe(empreinteJeton(genererJeton()));
  });

  it("expire après une heure et ne sert qu'une fois", () => {
    const now = new Date("2026-09-30T10:00:00Z");
    const expiresAt = dateExpiration(now);
    expect(expiresAt.getTime() - now.getTime()).toBe(DUREE_JETON_MS);
    expect(jetonUtilisable({ expiresAt, usedAt: null }, now)).toBe(true);
    expect(jetonUtilisable({ expiresAt, usedAt: null }, new Date(now.getTime() + DUREE_JETON_MS - 1))).toBe(true);
    expect(jetonUtilisable({ expiresAt, usedAt: null }, new Date(now.getTime() + DUREE_JETON_MS))).toBe(false);
    expect(jetonUtilisable({ expiresAt, usedAt: now }, now)).toBe(false);
    // Valeurs numériques (SQLite) acceptées
    expect(jetonUtilisable({ expiresAt: expiresAt.getTime(), usedAt: null }, now)).toBe(true);
  });
});

describe("verifierNouveauMotDePasse", () => {
  it("accepte un mot de passe de 8 caractères au moins avec lettre et chiffre, confirmé", () => {
    expect(verifierNouveauMotDePasse("Nouveau2026", "Nouveau2026", "PDG-DEMO")).toBeNull();
    expect(verifierNouveauMotDePasse("abcdefg1", "abcdefg1", "PDG-DEMO")).toBeNull();
  });

  it("refuse vide, trop court, trop long, sans lettre ou sans chiffre, identique à l'identifiant, confirmation différente", () => {
    expect(verifierNouveauMotDePasse("", "", "X")).toMatch(/choisir un mot de passe/);
    expect(verifierNouveauMotDePasse("abc1234", "abc1234", "X")).toMatch(/au moins 8 caractères/);
    expect(verifierNouveauMotDePasse("a1".repeat(37), "a1".repeat(37), "X")).toMatch(/72 caractères/);
    expect(verifierNouveauMotDePasse("12345678", "12345678", "X")).toMatch(/une lettre et un chiffre/);
    expect(verifierNouveauMotDePasse("abcdefgh", "abcdefgh", "X")).toMatch(/une lettre et un chiffre/);
    expect(verifierNouveauMotDePasse("PDG-DEMO1", "PDG-DEMO1", "pdg-demo1")).toMatch(/identique à l'identifiant/);
    expect(verifierNouveauMotDePasse("Nouveau2026", "Nouveau2027", "X")).toMatch(/ne sont pas identiques/);
  });
});

describe("e-mail et messages", () => {
  it("l'e-mail contient le prénom, le lien en texte et en HTML (échappé) et la durée de validité", () => {
    const lien = "https://app.exemple.ma/reinitialiser-mot-de-passe?token=abc&x=<y>";
    const { sujet, texte, html } = courrielReinitialisation("Karim", lien);
    expect(sujet).toContain("réinitialisation");
    expect(texte).toContain("Bonjour Karim");
    expect(texte).toContain(lien);
    expect(texte).toContain("une heure");
    expect(html).toContain('href="https://app.exemple.ma/reinitialiser-mot-de-passe?token=abc&amp;x=&lt;y&gt;"');
    expect(html).not.toContain("<y>");
  });

  it("le message de demande ne révèle rien ; l'adresse est masquée dans le journal", () => {
    expect(MESSAGE_DEMANDE_ENVOYEE).toBe("Si ce compte existe, un e-mail a été envoyé.");
    expect(masquerEmail("karim.alaoui@promopro.ma")).toBe("k…@promopro.ma");
    expect(masquerEmail("sans-arobase")).toBe("…");
  });
});
