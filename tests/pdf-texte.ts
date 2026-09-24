import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, type PDFStream } from "pdf-lib";

/*
 * Extraction du texte d'un PDF produit par pdf-lib, pour les tests (unitaires
 * et e2e) : les flux de contenu sont compressés (Flate) et les chaînes de
 * texte encodées en hexadécimal WinAnsi (« <52E973...> Tj »). On décode chaque
 * flux de chaque page puis chaque chaîne hex ou littérale, en latin1.
 */
export async function texteDuPdf(bytes: Uint8Array | Buffer): Promise<string> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const morceaux: string[] = [];
  for (const page of doc.getPages()) {
    const contenu = page.node.Contents();
    if (!contenu) continue;
    const flux: PDFStream[] = contenu instanceof PDFArray ? contenu.asArray().map((ref) => doc.context.lookup(ref) as PDFStream) : [contenu];
    for (const s of flux) {
      const data = s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents();
      const brut = Buffer.from(data).toString("latin1");
      for (const m of brut.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) morceaux.push(Buffer.from(m[1], "hex").toString("latin1"));
      for (const m of brut.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) morceaux.push(m[1]);
    }
  }
  return morceaux.join("\n");
}

/** Nombre d'images (XObjects /Image) embarquées : un logo en en-tête en ajoute au moins une. */
export function nombreImagesDuPdf(bytes: Uint8Array | Buffer): number {
  return (Buffer.from(bytes).toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;
}

/** Métadonnées lisibles (titre, auteur, créateur, producteur). */
export async function metadonneesDuPdf(bytes: Uint8Array | Buffer) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return { titre: doc.getTitle(), auteur: doc.getAuthor(), createur: doc.getCreator(), producteur: doc.getProducer() };
}
