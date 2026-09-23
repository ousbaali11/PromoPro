"use server";

/**
 * Server Action de test (développement seulement) : lève une erreur non gérée
 * pour vérifier que les erreurs des Server Actions remontent à Sentry
 * (routeType « action »). Les valeurs du formulaire — volontairement
 * « sensibles » — ne doivent jamais apparaître dans l'événement.
 */
export async function declencherErreurTest(formData: FormData) {
  if (process.env.NODE_ENV === "production") return;
  const motDePasse = String(formData.get("motDePasse") ?? "");
  throw new Error(`Erreur de test Sentry (Server Action volontaire) — mot de passe saisi : ${motDePasse}, CIN ${formData.get("cin")}, tél ${formData.get("telephone")}`);
}
