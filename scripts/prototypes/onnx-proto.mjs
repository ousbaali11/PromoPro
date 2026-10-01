// Décodeur / encodeur protobuf minimal pour lire et réécrire les initialisateurs d'un ModelProto ONNX.
// Champs ONNX : ModelProto.graph = 7 ; GraphProto.node = 1, initializer = 5, input = 11, output = 12 ;
// TensorProto.dims = 1, data_type = 2, name = 8, raw_data = 9 ; NodeProto.input = 1, output = 2, name = 3, op_type = 4.
import { readFileSync, writeFileSync } from "node:fs";

export function decoder(buf) {
  const champs = [];
  let i = 0;
  const varint = () => {
    let r = 0n, s = 0n;
    for (;;) {
      const b = buf[i++];
      r |= BigInt(b & 0x7f) << s;
      if (!(b & 0x80)) return r;
      s += 7n;
    }
  };
  while (i < buf.length) {
    const cle = Number(varint());
    const no = cle >> 3, type = cle & 7;
    if (type === 0) champs.push({ no, type, valeur: varint() });
    else if (type === 2) {
      const n = Number(varint());
      champs.push({ no, type, octets: buf.subarray(i, i + n) });
      i += n;
    } else if (type === 1) { champs.push({ no, type, octets: buf.subarray(i, i + 8) }); i += 8; }
    else if (type === 5) { champs.push({ no, type, octets: buf.subarray(i, i + 4) }); i += 4; }
    else throw new Error("type de fil inattendu " + type);
  }
  return champs;
}

function ecrireVarint(v) {
  const out = [];
  let x = BigInt(v);
  do {
    let b = Number(x & 0x7fn);
    x >>= 7n;
    if (x) b |= 0x80;
    out.push(b);
  } while (x);
  return Buffer.from(out);
}

export function encoder(champs) {
  const parties = [];
  for (const c of champs) {
    parties.push(ecrireVarint((c.no << 3) | c.type));
    if (c.type === 0) parties.push(ecrireVarint(c.valeur));
    else if (c.type === 2) { parties.push(ecrireVarint(c.octets.length)); parties.push(c.octets); }
    else parties.push(c.octets);
  }
  return Buffer.concat(parties);
}

const texte = (c) => Buffer.from(c.octets).toString("utf8");

/** Lit un modèle : initialisateurs (nom, dims, type, taille) et nœuds (op, entrées, sorties). */
export function lireModele(chemin) {
  const modele = decoder(readFileSync(chemin));
  const graphe = decoder(modele.find((c) => c.no === 7).octets);
  const initialisateurs = graphe.filter((c) => c.no === 5).map((c) => {
    const t = decoder(c.octets);
    return {
      nom: texte(t.find((f) => f.no === 8)),
      dims: t.filter((f) => f.no === 1).map((f) => Number(f.valeur)),
      type: Number(t.find((f) => f.no === 2)?.valeur ?? 0),
      taille: t.find((f) => f.no === 9)?.octets.length ?? 0,
    };
  });
  const noeuds = graphe.filter((c) => c.no === 1).map((c) => {
    const n = decoder(c.octets);
    return { op: texte(n.find((f) => f.no === 4)), entrees: n.filter((f) => f.no === 1).map(texte), sorties: n.filter((f) => f.no === 2).map(texte) };
  });
  return { modele, graphe, initialisateurs, noeuds };
}

/** Réécrit le modèle en remplaçant les raw_data des initialisateurs nommés dans `remplacements` (nom → Buffer). */
export function ecrireModele(chemin, sortie, remplacements) {
  const modele = decoder(readFileSync(chemin));
  const idxGraphe = modele.findIndex((c) => c.no === 7);
  const graphe = decoder(modele[idxGraphe].octets);
  let faits = 0;
  for (const c of graphe) {
    if (c.no !== 5) continue;
    const t = decoder(c.octets);
    const nom = texte(t.find((f) => f.no === 8));
    const r = remplacements.get(nom);
    if (!r) continue;
    const raw = t.find((f) => f.no === 9);
    if (raw.octets.length !== r.length) throw new Error(`${nom} : taille ${raw.octets.length} ≠ ${r.length}`);
    raw.octets = r;
    c.octets = encoder(t);
    faits++;
  }
  modele[idxGraphe].octets = encoder(graphe);
  writeFileSync(sortie, encoder(modele));
  return faits;
}
