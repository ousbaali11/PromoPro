/*
 * Prototype isolé : mesure la disponibilité de l'API Gemini en enchaînant N appels
 * identiques (même image, même prompt que test-lecture-plan.ts) et en notant, pour
 * chaque appel, le statut de chaque tentative et le nombre de tentatives nécessaires
 * avec une attente de 15 s entre deux essais (3 essais au plus). Rien n'est stocké.
 *
 * Usage : GEMINI_API_KEY (et GEMINI_MODEL) dans l'environnement, puis
 *   npx tsx scripts/prototypes/disponibilite.ts <image> [nombre d'appels = 5]
 */
import { readFileSync } from "node:fs";

const MODELE = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
const ESSAIS_MAX = 3;
const ATTENTE_MS = 15_000;

async function main() {
  const cle = process.env.GEMINI_API_KEY;
  if (!cle) throw new Error("GEMINI_API_KEY absente de l'environnement.");
  const [chemin, n = "5"] = process.argv.slice(2);
  if (!chemin) throw new Error("Usage : disponibilite.ts <image> [nombre d'appels]");
  const octets = readFileSync(chemin);
  const mime = chemin.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const corps = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: "Décris ce plan en une phrase." }, { inline_data: { mime_type: mime, data: octets.toString("base64") } }] }],
    generationConfig: { temperature: 0 },
  });

  const lignes: string[] = [];
  let reussis = 0;
  let total503 = 0;
  for (let appel = 1; appel <= Number(n); appel++) {
    const statuts: string[] = [];
    let ok = false;
    for (let essai = 1; essai <= ESSAIS_MAX; essai++) {
      const debut = Date.now();
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": cle },
        body: corps,
      });
      await r.text();
      statuts.push(`${r.status} en ${Date.now() - debut} ms`);
      if (r.status === 503) total503++;
      if (r.ok) {
        ok = true;
        break;
      }
      if (r.status !== 503 && r.status !== 429) break;
      if (essai < ESSAIS_MAX) await new Promise((res) => setTimeout(res, ATTENTE_MS));
    }
    if (ok) reussis++;
    lignes.push(`appel ${appel} : ${ok ? "OK" : "ÉCHEC"} après ${statuts.length} tentative(s) — ${statuts.join(" → ")}`);
    console.log(lignes[lignes.length - 1]);
  }
  console.log(`\n${MODELE} : ${reussis}/${n} appels réussis avec ${ESSAIS_MAX} essais max et ${ATTENTE_MS / 1000} s d'attente ; ${total503} réponse(s) 503 au total.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
