import sharp from "sharp";
import { saveUpload } from "@/lib/storage";
import { ErreurFournisseur, type Demarrage, type FournisseurPlan3d, type ImagePlan, type StatutGeneration } from "./provider";
import { appelerGemini, erreurGemini, type Enveloppe } from "./gemini";
import { HAUTEUR_VUE, LARGEUR_VUE, NB_VUES, angleDeLaVue } from "./rendu-vues";

/*
 * Adaptateur « Gemini — rendu 3D » : le modèle d'image de Gemini (Nano
 * Banana, gemini-3.1-flash-image par défaut, surchargeable par
 * GEMINI_MODEL_IMAGE) dessine une maquette 3D photoréaliste du plan — le
 * rendu obtenu par le promoteur en demandant « peux-tu me faire la 3D de ce
 * plan » —, puis trois autres vues de la même maquette tournée de 90°, 180°
 * et 270°, chacune générée avec le plan et la première vue en référence pour
 * garder mobilier et couleurs. Les quatre vues sont assemblées côte à côte
 * en une planche JPEG (fichier rendus-3d) que la visionneuse tournante fait
 * défiler au glisser. Ce sont des images, pas un modèle 3D : la cohérence
 * entre vues dépend du modèle, et chaque plan coûte quatre générations.
 * Même clé d'API que le fournisseur Gemini (cleDe dans FOURNISSEURS).
 *
 * API : generateContent avec generationConfig.responseModalities ["IMAGE"]
 * → parts[].inlineData { mimeType, data (base64) }. Appel, rejeu des 503 et
 * lecture des erreurs partagés avec gemini.ts.
 */

export const GEMINI_MODELE_IMAGE_PAR_DEFAUT = "gemini-3.1-flash-image";

export function modeleGeminiImage() {
  return process.env.GEMINI_MODEL_IMAGE?.trim() || GEMINI_MODELE_IMAGE_PAR_DEFAUT;
}

export const PROMPT_PREMIERE_VUE = `Réalise un rendu 3D photoréaliste de ce plan d'appartement, comme une maquette d'architecte vue de dessus en légère perspective (trois quarts), murs coupés à mi-hauteur, sols et mobilier sobres et réalistes dans chaque pièce, les noms des pièces lisibles à leur place exacte, fond blanc uni, aucune cote ni annotation ajoutée. Respecte strictement la disposition, les proportions et les ouvertures du plan.`;

export function promptVueTournee(angle: number) {
  return `Même maquette 3D que l'image de référence, strictement les mêmes pièces, le même mobilier, les mêmes couleurs et le même fond blanc, mais la caméra a tourné de ${angle}° dans le sens horaire autour de l'axe vertical de la maquette, en gardant la même hauteur de vue et le même cadrage. Le plan 2D joint est la source : ne change rien à la disposition.`;
}

/** Première image rendue par Gemini (octets et type MIME), ou erreur lisible. Fonction pure, testée sans réseau. */
export function lireImageGemini(statutHttp: number, corps: Enveloppe): { octets: Buffer; mime: string } {
  erreurGemini(statutHttp, corps);
  for (const partie of corps.candidates?.[0]?.content?.parts ?? []) {
    const donnees = partie.inlineData?.data ?? partie.inline_data?.data;
    if (donnees) {
      const octets = Buffer.from(donnees, "base64");
      if (octets.length > 0) return { octets, mime: partie.inlineData?.mimeType ?? partie.inline_data?.mime_type ?? "image/png" };
    }
  }
  const texte = corps.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join(" ").trim();
  throw new ErreurFournisseur(texte ? `Gemini n'a pas rendu d'image (${texte.slice(0, 200)}).` : "Gemini n'a pas rendu d'image.");
}

/** Assemble les vues côte à côte (chacune ramenée en 4:3 sur fond blanc) en une planche JPEG. */
export async function assemblerVues(vues: Buffer[]): Promise<Buffer> {
  if (vues.length === 0) throw new ErreurFournisseur("Aucune vue à assembler.");
  const cadres = await Promise.all(
    vues.map((v) => sharp(v).resize(LARGEUR_VUE, HAUTEUR_VUE, { fit: "contain", background: "#ffffff" }).removeAlpha().png().toBuffer()),
  );
  return sharp({ create: { width: LARGEUR_VUE * cadres.length, height: HAUTEUR_VUE, channels: 3, background: "#ffffff" } })
    .composite(cadres.map((input, i) => ({ input, left: LARGEUR_VUE * i, top: 0 })))
    .jpeg({ quality: 88 })
    .toBuffer();
}

function partieImage(octets: Uint8Array, mime: string) {
  return { inline_data: { mime_type: mime, data: Buffer.from(octets).toString("base64") } };
}

export const geminiRendu: FournisseurPlan3d = {
  code: "GEMINI_RENDU",

  async demarrerGeneration(image: ImagePlan, cleApi: string): Promise<Demarrage> {
    const modele = modeleGeminiImage();
    const plan = partieImage(image.octets, image.mime);
    const generer = async (texte: string, references: ReturnType<typeof partieImage>[]) => {
      const { statut, corps } = await appelerGemini(cleApi, modele, {
        contents: [{ role: "user", parts: [{ text: texte }, ...references] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      });
      return lireImageGemini(statut, corps);
    };
    const premiere = await generer(PROMPT_PREMIERE_VUE, [plan]);
    const vues = [premiere.octets];
    for (let i = 1; i < NB_VUES; i++) {
      const vue = await generer(promptVueTournee(angleDeLaVue(i)), [plan, partieImage(premiere.octets, premiere.mime)]);
      vues.push(vue.octets);
    }
    const planche = await assemblerVues(vues);
    const modelUrl = await saveUpload("rendus-3d", "rendu.jpg", planche);
    return { etat: "pret", modelUrl };
  },

  async verifierStatut(): Promise<StatutGeneration> {
    // La génération est synchrone : il n'y a jamais de tâche à suivre
    return { etat: "echec", message: "Gemini — rendu 3D : aucune génération en attente à vérifier." };
  },
};
