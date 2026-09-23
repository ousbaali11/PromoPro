// Vérification des contrastes WCAG 2.x (AA) de la palette du design system.
//
//   npm run check:contrast
//
// Les couleurs sont lues dans src/app/globals.css (bloc @theme) : si la
// palette change, le script suit. Chaque paire décrit un usage réel
// (texte + fond, ou composant graphique + fond) avec le seuil applicable :
//   - 4.5 : texte normal (< 18 pt, ou < 14 pt gras) — presque tout ici, les
//     libellés faisant 11 à 14 px ;
//   - 3   : texte large, icônes et composants d'interface (WCAG 1.4.11).
// Les couleurs translucides (« navy-200/80 ») sont composées sur leur fond
// avant calcul, comme le fait le navigateur.
//
// Sortie non nulle si une paire est sous son seuil : utilisable en CI.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const racine = dirname(dirname(fileURLToPath(import.meta.url)));
const css = readFileSync(join(racine, "src/app/globals.css"), "utf8");

// --- Tokens ---------------------------------------------------------------
const tokens = {};
for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[m[1]] = m[2];
tokens.white = "#ffffff";

function couleur(nom) {
  const [base, alpha] = nom.split("/");
  const hex = tokens[base];
  if (!hex) throw new Error(`Token inconnu : --color-${base}`);
  return { rgb: hexVersRgb(hex), alpha: alpha ? Number(alpha) / 100 : 1 };
}

// --- Calculs WCAG ---------------------------------------------------------
const hexVersRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const composer = (fg, bg, a) => fg.map((v, i) => v * a + bg[i] * (1 - a));
function luminance([r, g, b]) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function ratio(fg, bg) {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Ratio d'un premier plan (éventuellement translucide) sur un fond (éventuellement translucide sur `sous`). */
function contraste(premierPlan, fond, sous = "white") {
  const f = couleur(fond);
  const s = couleur(sous);
  const fondOpaque = f.alpha < 1 ? composer(f.rgb, s.rgb, f.alpha) : f.rgb;
  const p = couleur(premierPlan);
  const pOpaque = p.alpha < 1 ? composer(p.rgb, fondOpaque, p.alpha) : p.rgb;
  return ratio(pOpaque, fondOpaque);
}

// --- Paires vérifiées ------------------------------------------------------
// [premier plan, fond, seuil, usage, (fond sous-jacent si le fond est translucide)]
// Un seuil `null` = paire informative (affichée, jamais bloquante).
const TEXTE = 4.5;
const GRAPHIQUE = 3;
const INFO = null;
const PAIRES = [
  // Coquille navy (sidebar, en-têtes)
  ["white", "navy", TEXTE, "texte blanc sur navy (nav active, bouton primaire, segment actif)"],
  ["navy-100/75", "navy", TEXTE, "entrées de navigation inactives"],
  ["navy-100/70", "navy", TEXTE, "déconnexion, comptes de démonstration"],
  ["navy-200/80", "navy", TEXTE, "sous-titre « Plateforme promoteur »"],
  ["navy-200/70", "navy", TEXTE, "rôle sous le nom (sidebar)"],
  ["gold-200", "white/10", TEXTE, "initiales de l'avatar", "navy"],
  ["gold", "navy", GRAPHIQUE, "icône de nav active, barre dorée (graphique)"],
  ["white", "gold", GRAPHIQUE, "icône blanche sur la tuile dorée du logo (graphique)"],
  // Boutons
  ["white", "gold-600", TEXTE, "bouton doré (texte blanc)"],
  ["white", "gold-700", TEXTE, "bouton doré survolé"],
  ["white", "danger", TEXTE, "bouton danger"],
  ["white", "success", TEXTE, "bouton WhatsApp"],
  ["white", "gold-600", TEXTE, "compteur de la cloche (10 px gras)"],
  // Texte sur fonds clairs
  ["navy-900", "white", TEXTE, "texte principal"],
  ["navy-400", "white", TEXTE, "texte secondaire sur blanc"],
  ["navy-400", "cream", TEXTE, "texte secondaire sur fond de page"],
  ["navy-400", "navy-50", TEXTE, "texte secondaire sur tranches / formulaires repliés"],
  ["navy-300", "white", TEXTE, "placeholders, texte atténué, horodatages"],
  ["navy-300", "cream", TEXTE, "texte atténué sur fond de page"],
  ["navy-300", "navy-50", GRAPHIQUE, "icônes atténuées (état vide, tuiles)"],
  ["navy-600", "navy-50", TEXTE, "segment inactif"],
  ["gold-600", "white", TEXTE, "liens et sur-titres dorés"],
  ["gold-600", "cream", TEXTE, "sur-titres dorés sur fond de page"],
  ["gold-600", "gold-50", TEXTE, "« Tout marquer comme lu », badge gold clair"],
  ["gold-700", "gold-50", TEXTE, "badge tone gold"],
  ["success-fg", "white", TEXTE, "excédent en votre faveur"],
  ["danger-fg", "white", TEXTE, "restant dû en retard, erreurs"],
  // Badges de statut (12 px)
  ["success-fg", "success-bg", TEXTE, "badge succès"],
  ["warning-fg", "warning-bg", TEXTE, "badge avertissement"],
  ["danger-fg", "danger-bg", TEXTE, "badge danger"],
  ["info-fg", "info-bg", TEXTE, "badge information"],
  ["navy-400", "navy-50", TEXTE, "badge neutre"],
  ["navy", "navy/10", TEXTE, "badge navy", "white"],
  // Champs
  ["gold-600", "white", TEXTE, "étiquette flottante au focus"],
  ["danger-fg", "danger-bg", TEXTE, "message d'erreur (Callout)"],
  // Bordure de champ : sous les 3:1 de WCAG 1.4.11, compensé par l'ombre interne, le fond blanc
  // sur crème et l'étiquette dans le champ ; suivi à titre indicatif, à traiter si la palette évolue.
  ["navy-100", "white", INFO, "bordure de champ au repos"],
];

// --- Rapport ---------------------------------------------------------------
let echecs = 0;
const lignes = PAIRES.map(([fg, bg, seuil, usage, sous]) => {
  const r = contraste(fg, bg, sous);
  const etat = seuil === null ? "INFO " : r >= seuil ? "OK   " : "ÉCHEC";
  if (etat === "ÉCHEC") echecs++;
  const exigence = seuil === null ? "      " : `(≥ ${String(seuil).padEnd(3)})`;
  return `${etat}  ${r.toFixed(2).padStart(5)}  ${exigence}  ${fg.padEnd(12)} sur ${(bg + (sous ? ` / ${sous}` : "")).padEnd(16)}  ${usage}`;
});
console.log(`Contrastes WCAG AA — ${PAIRES.length} paires, palette lue dans src/app/globals.css\n`);
console.log(lignes.join("\n"));
console.log(`\n${echecs === 0 ? "Toutes les paires respectent leur seuil." : `${echecs} paire(s) sous le seuil.`}`);
process.exit(echecs === 0 ? 0 : 1);
