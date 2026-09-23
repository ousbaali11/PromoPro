// Génère tests/fixtures/cube.glb : un cube texturé minimal (damier 4×4 embarqué
// en PNG), glTF 2.0 binaire valide, quelques Ko, sans aucune dépendance.
// Sert au test e2e du rendu 3D (<model-viewer>). Relancer : node scripts/generer-cube-glb.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// --- PNG 4×4 damier (RGB) ---------------------------------------------------------
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function pngDamier(taille = 4) {
  const lignes = [];
  for (let y = 0; y < taille; y++) {
    const ligne = [0]; // filtre « none »
    for (let x = 0; x < taille; x++) {
      const clair = (x + y) % 2 === 0;
      ligne.push(...(clair ? [0xc9, 0xa2, 0x4f] : [0x1f, 0x2a, 0x44])); // or / navy
    }
    lignes.push(Buffer.from(ligne));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(taille, 0);
  ihdr.writeUInt32BE(taille, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(lignes))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Géométrie : 6 faces × 4 sommets (position, normale, UV), 36 indices ------------
const faces = [
  { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
];
const positions = [], normales = [], uvs = [], indices = [];
faces.forEach((f, i) => {
  f.v.forEach((p) => {
    positions.push(...p.map((c) => c * 0.5)); // cube de 1 unité de côté, centré
    normales.push(...f.n);
  });
  uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
  const b = i * 4;
  indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
});

const f32 = (a) => Buffer.from(new Float32Array(a).buffer);
const u16 = (a) => Buffer.from(new Uint16Array(a).buffer);
const pad4 = (b) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b);

const png = pngDamier();
const parties = [f32(positions), f32(normales), f32(uvs), u16(indices), png];
const bufferViews = [];
let offset = 0;
const bin = Buffer.concat(
  parties.map((p, i) => {
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: p.length, ...(i === 3 ? { target: 34963 } : i < 3 ? { target: 34962 } : {}) });
    const padded = pad4(p);
    offset += padded.length;
    return padded;
  }),
);
const min = [-0.5, -0.5, -0.5], max = [0.5, 0.5, 0.5];
const json = {
  asset: { version: "2.0", generator: "PromoPro scripts/generer-cube-glb.mjs" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: "Cube" }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
  materials: [{ name: "Damier", pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.8 } }],
  textures: [{ source: 0, sampler: 0 }],
  samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 10497, wrapT: 10497 }],
  images: [{ mimeType: "image/png", bufferView: 4, name: "damier" }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min, max },
    { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
    { bufferView: 2, componentType: 5126, count: 24, type: "VEC2" },
    { bufferView: 3, componentType: 5123, count: 36, type: "SCALAR" },
  ],
  bufferViews,
  buffers: [{ byteLength: bin.length }],
};
let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
if (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(4 - (jsonBuf.length % 4), 0x20)]);

const header = Buffer.alloc(12);
header.write("glTF", 0, "ascii");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
const chunkJson = Buffer.alloc(8);
chunkJson.writeUInt32LE(jsonBuf.length, 0);
chunkJson.writeUInt32LE(0x4e4f534a, 4); // JSON
const chunkBin = Buffer.alloc(8);
chunkBin.writeUInt32LE(bin.length, 0);
chunkBin.writeUInt32LE(0x004e4942, 4); // BIN

const sortie = fileURLToPath(new URL("../tests/fixtures/cube.glb", import.meta.url));
mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(sortie, Buffer.concat([header, chunkJson, jsonBuf, chunkBin, bin]));
console.log(`cube.glb écrit (${12 + 8 + jsonBuf.length + 8 + bin.length} octets)`);
