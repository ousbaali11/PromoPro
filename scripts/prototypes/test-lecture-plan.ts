/*
 * Prototype isolé (aucune page, route ni table du site) : envoie l'image d'un
 * plan 2D à l'API Gemini et affiche tel quel le JSON renvoyé — pièces avec
 * coordonnées relatives (x, y du coin haut-gauche, largeur, hauteur entre 0 et 1),
 * nom lu sur le plan, et ouvertures (portes) repérées.
 *
 * Usage (la clé ne vit que dans l'environnement de la commande, jamais dans un fichier) :
 *   PowerShell : $env:GEMINI_API_KEY="…"; npx tsx scripts/prototypes/test-lecture-plan.ts scripts/prototypes/plans/villa_plan_2d.png
 * Le JSON brut est aussi écrit à côté de l'image (<image>.gemini.json) pour l'étape suivante.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const MODELE = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

const PROMPT = `Tu analyses l'image d'un plan d'architecte 2D (vue de dessus d'un logement).
Renvoie UNIQUEMENT un objet JSON strict, sans commentaire ni markdown, de la forme :
{
  "pieces": [ { "nom": "Salon", "x": 0.12, "y": 0.08, "largeur": 0.3, "hauteur": 0.4 } ],
  "portes": [ { "x": 0.42, "y": 0.25, "mur": "vertical", "relie": ["Salon", "Cuisine"] } ],
  "remarques": "texte court"
}
Règles :
- x, y = coin haut-gauche de la pièce, largeur et hauteur : fractions de la largeur et de la hauteur totales de l'image (entre 0 et 1), mesurées sur les murs qui délimitent la pièce.
- Une pièce = une zone fermée par des murs. Le nom est celui lisible sur le plan (sinon "Pièce N").
- Une porte = une ouverture dans un mur (arc de porte, interruption du trait) ; x, y = son centre en fractions ; "mur" = "vertical" ou "horizontal" ; "relie" = les deux pièces (ou "extérieur").
- Ne fais aucune supposition non visible ; si l'image n'est pas un plan, renvoie { "pieces": [], "portes": [], "remarques": "..." }.`;

function appeler(cle: string, corps: unknown) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": cle },
    body: JSON.stringify(corps),
  });
}

async function main() {
  const cle = process.env.GEMINI_API_KEY;
  if (!cle) throw new Error("GEMINI_API_KEY absente de l'environnement.");
  const chemin = process.argv[2];
  if (!chemin) throw new Error("Usage : test-lecture-plan.ts <image du plan>");
  const octets = readFileSync(chemin);
  const mime = chemin.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

  const corps = {
    contents: [{ role: "user", parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: octets.toString("base64") } }] }],
    generationConfig: { temperature: 0, response_mime_type: "application/json" },
  };
  const debut = Date.now();
  // Pics de charge (503) : jusqu'à cinq tentatives espacées de 15 s
  let reponse: Response | undefined;
  for (let tentative = 1; tentative <= 5; tentative++) {
    reponse = await appeler(cle, corps);
    if (reponse.status !== 503) break;
    console.error(`Gemini 503 (forte demande), nouvelle tentative ${tentative}/5 dans 15 s…`);
    await new Promise((r) => setTimeout(r, 15_000));
  }
  if (!reponse) throw new Error("aucune réponse");
  const duree = Date.now() - debut;
  const texte = await reponse.text();
  if (!reponse.ok) {
    console.error(`Gemini a répondu ${reponse.status} en ${duree} ms :`);
    console.error(texte.slice(0, 2000));
    process.exit(1);
  }
  const enveloppe = JSON.parse(texte) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: unknown };
  const json = enveloppe.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  console.log(`--- ${path.basename(chemin)} — ${MODELE} — ${duree} ms — usage : ${JSON.stringify(enveloppe.usageMetadata)}`);
  console.log(json);
  const sortie = chemin.replace(/\.(png|jpe?g)$/i, "") + ".gemini.json";
  writeFileSync(sortie, json);
  console.log(`--- JSON brut écrit dans ${sortie}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
