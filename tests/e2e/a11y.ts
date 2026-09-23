import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/*
 * Analyse d'accessibilité axe-core d'une page dans son état courant.
 *
 * - Règles WCAG 2.0 / 2.1 / 2.2 niveaux A et AA.
 * - Les violations « critical » et « serious » font échouer le test, avec
 *   la règle, l'aide et les premiers éléments fautifs.
 * - Les violations « minor » et « moderate » sont seulement journalisées
 *   (annotations du rapport + console), pour ne pas noyer les vrais
 *   problèmes sous du bruit.
 * - La pastille de développement de Next (<nextjs-portal>) est exclue :
 *   elle n'existe pas en production.
 */

const BLOQUANTES = new Set(["critical", "serious"]);

export async function verifierA11y(page: Page, etat: string, options: { exclure?: string[] } = {}) {
  // Les animations d'entrée (ressorts ≤ 350 ms) faussent la mesure des couleurs à mi-fondu
  await page.waitForTimeout(400);
  let analyse = new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .exclude("nextjs-portal");
  for (const sel of options.exclure ?? []) analyse = analyse.exclude(sel);

  const resultats = await analyse.analyze();
  const bloquantes = resultats.violations.filter((v) => BLOQUANTES.has(v.impact ?? ""));
  const mineures = resultats.violations.filter((v) => !BLOQUANTES.has(v.impact ?? ""));

  for (const v of mineures) {
    const message = `[a11y ${v.impact}] ${etat} — ${v.id} : ${v.help} (${v.nodes.length} élément(s)) — ${v.helpUrl}`;
    test.info().annotations.push({ type: "a11y-warning", description: message });
    console.warn(message);
  }

  const detail = bloquantes
    .map(
      (v) =>
        `• [${v.impact}] ${v.id} — ${v.help}\n  ${v.helpUrl}\n` +
        v.nodes
          .slice(0, 3)
          .map((n) => `  ↳ ${n.target.join(" ")}\n     ${n.failureSummary?.split("\n").join("\n     ")}`)
          .join("\n"),
    )
    .join("\n");

  expect(bloquantes, `Violations d'accessibilité bloquantes (${etat}) :\n${detail}`).toEqual([]);
  return resultats;
}
