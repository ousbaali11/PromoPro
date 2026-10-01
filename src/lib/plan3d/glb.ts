/*
 * Lecture et écriture d'un conteneur glTF 2.0 binaire (.glb) : un en-tête,
 * un chunk JSON et un chunk BIN. Sans dépendance ; partagé par l'extrusion
 * (écriture) et la palette (lecture puis réécriture).
 */

const MAGIE = "glTF";
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export type Glb = { json: Record<string, unknown>; bin: Buffer<ArrayBufferLike> };

/** Décode un .glb ; null si ce n'en est pas un (ou si sa structure est inattendue). */
export function lireGlb(octets: Buffer<ArrayBufferLike>): Glb | null {
  if (octets.length < 20 || octets.subarray(0, 4).toString("ascii") !== MAGIE || octets.readUInt32LE(4) !== 2) return null;
  if (octets.readUInt32LE(8) !== octets.length) return null;
  const longueurJson = octets.readUInt32LE(12);
  if (octets.readUInt32LE(16) !== CHUNK_JSON || 20 + longueurJson > octets.length) return null;
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(octets.subarray(20, 20 + longueurJson).toString("utf8"));
  } catch {
    return null;
  }
  let bin: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  const debutBin = 20 + longueurJson;
  if (debutBin + 8 <= octets.length) {
    const longueurBin = octets.readUInt32LE(debutBin);
    if (octets.readUInt32LE(debutBin + 4) !== CHUNK_BIN || debutBin + 8 + longueurBin > octets.length) return null;
    bin = octets.subarray(debutBin + 8, debutBin + 8 + longueurBin);
  }
  return { json, bin };
}

/** Complète un tampon à un multiple de 4 octets (espaces pour le JSON, zéros pour le binaire). */
export function aligner4(b: Buffer<ArrayBufferLike>, remplissage = 0): Buffer<ArrayBufferLike> {
  return b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4), remplissage)]) : b;
}

/** Assemble un .glb à partir du document JSON et du chunk binaire. */
export function ecrireGlb(json: Record<string, unknown>, bin: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> {
  const jsonBuf = aligner4(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
  const binBuf = aligner4(bin);
  const entete = Buffer.alloc(12);
  entete.write(MAGIE, 0, "ascii");
  entete.writeUInt32LE(2, 4);
  entete.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
  const cJson = Buffer.alloc(8);
  cJson.writeUInt32LE(jsonBuf.length, 0);
  cJson.writeUInt32LE(CHUNK_JSON, 4);
  const cBin = Buffer.alloc(8);
  cBin.writeUInt32LE(binBuf.length, 0);
  cBin.writeUInt32LE(CHUNK_BIN, 4);
  return Buffer.concat([entete, cJson, jsonBuf, cBin, binBuf]);
}
