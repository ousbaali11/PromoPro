// Prototype (non intégré au site) : génère deux images de plan 2D pour tester la lecture par Gemini.
// - villa_plan_2d.png : plan « numérique » propre, pièces nommées, portes en arcs.
// - appartement_scan.jpg : plan différent, style scanné (faible contraste, légère rotation, JPEG dégradé).
// Usage : node scripts/prototypes/generer-plans.mjs
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const dossier = path.join(process.cwd(), "scripts", "prototypes", "plans");
mkdirSync(dossier, { recursive: true });

const mur = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1a1a1a"/>`;
const porte = (x, y, r, sweep) => `<path d="M${x} ${y} a${r} ${r} 0 0 ${sweep} ${r} ${r}" stroke="#1a1a1a" stroke-width="3" fill="none"/><rect x="${x - 2}" y="${y - 2}" width="4" height="${r + 4}" fill="#fff"/>`;
const texte = (x, y, t, taille = 30) => `<text x="${x}" y="${y}" font-family="Arial" font-size="${taille}" text-anchor="middle" fill="#222">${t}</text>`;

// Villa 1200 × 800 : garage à gauche, salon + cuisine au centre, deux chambres et SDB à droite
const villa = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
<rect width="1200" height="800" fill="#fff"/>
${mur(80, 80, 1040, 14)}${mur(80, 706, 1040, 14)}${mur(80, 80, 14, 640)}${mur(1106, 80, 14, 640)}
${mur(380, 80, 12, 640)}
${mur(80, 440, 312, 12)}
${mur(780, 80, 12, 640)}
${mur(780, 380, 340, 12)}
${mur(780, 560, 340, 12)}
${mur(380, 500, 412, 12)}
${porte(380, 300, 70, 1)}
${porte(780, 200, 70, 1)}
${porte(780, 460, 60, 1)}
${porte(780, 620, 60, 1)}
${porte(600, 500, 70, 0)}
${porte(200, 440, 70, 1)}
${porte(560, 706, 80, 0)}
${texte(230, 270, "Garage")}${texte(230, 590, "Entrée")}
${texte(580, 300, "Salon")}${texte(580, 620, "Cuisine")}
${texte(950, 240, "Chambre 1")}${texte(950, 480, "Chambre 2")}${texte(950, 650, "Salle de bain")}
${texte(600, 770, "Villa — RDC — échelle 1/100", 22)}
</svg>`;

// Appartement 1000 × 700, agencement différent, style scanné
const appart = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700">
<rect width="1000" height="700" fill="#f3f0ea"/>
<g transform="rotate(1.2 500 350)" stroke="#444" stroke-width="9" fill="none">
<rect x="90" y="90" width="820" height="520"/>
<line x1="90" y1="330" x2="520" y2="330"/>
<line x1="520" y1="90" x2="520" y2="610"/>
<line x1="520" y1="400" x2="910" y2="400"/>
<line x1="720" y1="400" x2="720" y2="610"/>
<line x1="320" y1="330" x2="320" y2="610"/>
</g>
<g transform="rotate(1.2 500 350)" font-family="Georgia" fill="#333">
${texte(305, 220, "Séjour", 26)}${texte(715, 250, "Chambre", 26)}${texte(205, 480, "Cuisine", 24)}${texte(420, 480, "WC", 22)}${texte(620, 520, "SDB", 24)}${texte(815, 520, "Bureau", 24)}
</g>
<g transform="rotate(1.2 500 350)" stroke="#444" stroke-width="4" fill="none">
<path d="M520 200 a60 60 0 0 1 60 60"/><path d="M400 330 a55 55 0 0 0 -55 55"/><path d="M620 400 a50 50 0 0 1 50 50"/><path d="M720 500 a45 45 0 0 1 45 45"/><path d="M320 420 a45 45 0 0 0 -45 45"/><path d="M700 610 a60 60 0 0 0 60 -60"/>
</g>
</svg>`;

const cheminVilla = path.join(dossier, "villa_plan_2d.png");
writeFileSync(cheminVilla, await sharp(Buffer.from(villa)).png().toBuffer());
const cheminAppart = path.join(dossier, "appartement_scan.jpg");
// Style scanné : flou léger, bruit par compression forte, contraste réduit
writeFileSync(cheminAppart, await sharp(Buffer.from(appart)).blur(0.8).linear(0.85, 20).jpeg({ quality: 45 }).toBuffer());
console.log("plans générés :", cheminVilla, cheminAppart);
