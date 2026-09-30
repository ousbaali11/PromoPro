// Prototype : petit serveur statique pour regarder viewer.html (GLB + images) dans un navigateur.
// Usage : node scripts/prototypes/serveur.mjs  → http://localhost:3999/viewer.html
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const racine = path.join(process.cwd(), "scripts", "prototypes");
const MIME = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".json": "application/json" };
createServer(async (req, res) => {
  const chemin = path.normalize(path.join(racine, decodeURIComponent((req.url ?? "/").split("?")[0])));
  if (!chemin.startsWith(racine)) return res.writeHead(403).end();
  try {
    const corps = await readFile(chemin);
    res.writeHead(200, { "Content-Type": MIME[path.extname(chemin)] ?? "application/octet-stream" });
    res.end(corps);
  } catch {
    res.writeHead(404).end("introuvable");
  }
}).listen(3999, () => console.log("prototype : http://localhost:3999/viewer.html"));
