import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

/*
 * POST /api/upload : quoi qu'il arrive, la réponse est du JSON avec un message
 * utilisateur — jamais un 500 sans corps (que le composant FileUpload affichait
 * comme « Unexpected end of JSON input », incident de production du
 * 24 septembre 2026 : EACCES sur mkdir dans UPLOAD_DIR, volume Railway
 * appartenant à root). Session, limite de débit et Sentry sont simulés ;
 * le disque est un dossier temporaire, ou un chemin sous un fichier ordinaire
 * pour provoquer l'échec de mkdir (équivalent local de l'EACCES).
 */
const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException: (...args: unknown[]) => captureException(...args) }));
vi.mock("@/lib/session", () => ({
  getSessionActive: async () => ({ kind: "staff", userId: "u-test", role: "COMMERCIAL", promoteurId: "p-test" }),
}));
vi.mock("@/lib/rate-limit", () => ({
  consommer: () => ({ autorise: true }),
  LIMITES: { upload: { max: 30, fenetreMs: 600_000 } },
  messageLimite: () => "",
}));

const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "promopro-upload-"));
const journal = vi.spyOn(console, "error").mockImplementation(() => {});

function requete(fichier: { name: string; contenu: Buffer; mime: string } | null, type = "preuves-paiement", entetes: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append("type", type);
  if (fichier) fd.append("file", new Blob([new Uint8Array(fichier.contenu)], { type: fichier.mime }), fichier.name);
  return new NextRequest(`http://localhost/api/upload?type=${type}`, { method: "POST", body: fd, headers: entetes });
}

async function poster(...args: Parameters<typeof requete>) {
  const { POST } = await import("@/app/api/upload/route");
  const res = await POST(requete(...args));
  const texte = await res.text();
  return { status: res.status, contentType: res.headers.get("content-type") ?? "", texte, json: JSON.parse(texte) as { path?: string; error?: string } };
}

beforeEach(() => {
  captureException.mockClear();
  journal.mockClear();
  vi.doUnmock("@/lib/storage");
  vi.resetModules();
});
afterEach(() => {
  delete process.env.UPLOAD_DIR;
});
afterAll(async () => {
  journal.mockRestore();
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("/api/upload : contrat de réponse JSON", () => {
  it("disque inscriptible : 200, chemin public et fichier écrit", async () => {
    process.env.UPLOAD_DIR = path.join(tmp, "ok");
    const r = await poster({ name: "preuve.png", contenu: PNG_1x1, mime: "image/png" });
    expect(r.status).toBe(200);
    expect(r.json.path).toMatch(/^\/api\/files\/preuves-paiement\/[0-9a-f-]{36}\.png$/);
    const surDisque = await fs.readFile(path.join(tmp, "ok", "preuves-paiement", path.basename(r.json.path!)));
    expect(surDisque.equals(PNG_1x1)).toBe(true);
  });

  it("mkdir impossible dans UPLOAD_DIR (EACCES / ENOTDIR) : 503 JSON « stockage indisponible », détail dans Sentry et les journaux seulement", async () => {
    await fs.writeFile(path.join(tmp, "fichier-plat"), "pas un dossier");
    process.env.UPLOAD_DIR = path.join(tmp, "fichier-plat", "uploads");
    const r = await poster({ name: "preuve.png", contenu: PNG_1x1, mime: "image/png" });
    expect(r.status).toBe(503);
    expect(r.contentType).toContain("application/json");
    expect(r.json).toEqual({ error: "Le stockage des fichiers est temporairement indisponible, contactez l'administrateur." });
    expect(r.texte).not.toMatch(/ENOTDIR|EACCES|mkdir|fichier-plat/); // rien de technique vers le navigateur
    expect(captureException).toHaveBeenCalledTimes(1);
    const [erreur, contexte] = captureException.mock.calls[0] as [Error, { tags: Record<string, string> }];
    expect(erreur.name).toBe("ErreurStockage");
    expect(erreur.message).toMatch(/mkdir/);
    expect(contexte.tags).toMatchObject({ route: "/api/upload", stockage: "uploads" });
    expect(journal).toHaveBeenCalled();
  });

  it("erreur serveur inattendue (simulée) : 500 JSON avec un message utilisateur générique, jamais un corps vide", async () => {
    vi.doMock("@/lib/storage", async (importOriginal) => {
      const reel = await importOriginal<typeof import("@/lib/storage")>();
      return {
        ...reel,
        saveUpload: async () => {
          throw new Error("panne simulée : disque plein");
        },
      };
    });
    const r = await poster({ name: "preuve.png", contenu: PNG_1x1, mime: "image/png" });
    expect(r.status).toBe(500);
    expect(r.contentType).toContain("application/json");
    expect(r.json).toEqual({ error: "Le fichier n'a pas pu être envoyé, réessayez ou contactez le support." });
    expect(r.texte).not.toContain("disque plein");
    expect(captureException).toHaveBeenCalledTimes(1);
    expect((captureException.mock.calls[0][0] as Error).message).toContain("disque plein");
  });

  it("Content-Length au-delà de la limite du type annoncé : 413 JSON avant toute lecture du corps", async () => {
    process.env.UPLOAD_DIR = path.join(tmp, "ok");
    const r = await poster({ name: "preuve.png", contenu: PNG_1x1, mime: "image/png" }, "preuves-paiement", {
      "content-length": String(10 * 1024 * 1024 + 64 * 1024 + 1),
    });
    expect(r.status).toBe(413);
    expect(r.json).toEqual({ error: "Fichier trop volumineux (10 Mo maximum)." });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("fichier réel au-delà de 10 Mo : 400 JSON avec la limite ; à 10 Mo exactement : accepté", async () => {
    process.env.UPLOAD_DIR = path.join(tmp, "ok");
    const jpeg = (taille: number) => {
      const b = Buffer.alloc(taille, 0x20);
      b[0] = 0xff;
      b[1] = 0xd8;
      b[2] = 0xff;
      return b;
    };
    const trop = await poster({ name: "photo.jpg", contenu: jpeg(10 * 1024 * 1024 + 1), mime: "image/jpeg" });
    expect(trop.status).toBe(400);
    expect(trop.json).toEqual({ error: "Fichier trop volumineux (10 Mo maximum)." });
    const limite = await poster({ name: "photo.jpg", contenu: jpeg(10 * 1024 * 1024), mime: "image/jpeg" });
    expect(limite.status).toBe(200);
    expect(limite.json.path).toMatch(/\.jpg$/);
  });
});
