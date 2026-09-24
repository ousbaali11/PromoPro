import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import type { EnteteDocument } from "./entete";

/**
 * Petit moteur de mise en page pour les documents PDF (pdf-lib).
 * Gère un curseur vertical, les sauts de page, les tableaux et l'en-tête.
 * Police standard Helvetica (encodage WinAnsi : accents français OK).
 *
 * L'en-tête, le pied de page et les métadonnées portent le nom du promoteur
 * émetteur (`EnteteDocument`, voir entete.ts) et son logo s'il en a déposé un
 * — jamais le nom de la plateforme : chaque promoteur signe ses propres
 * documents.
 */

export const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 50;

export const COLORS = {
  navy: rgb(0.07, 0.16, 0.25),
  navyLight: rgb(0.21, 0.33, 0.48),
  gold: rgb(0.69, 0.55, 0.34),
  grey: rgb(0.45, 0.45, 0.45),
  lightGrey: rgb(0.93, 0.94, 0.96),
  black: rgb(0.1, 0.1, 0.1),
  white: rgb(1, 1, 1),
};

/** Retire les caractères hors WinAnsi (non encodables par Helvetica). */
export function safeText(input: string | null | undefined) {
  if (!input) return "";
  return String(input)
    .normalize("NFC")
    .replace(/→/g, "->")
    .replace(/[^\x20-\x7E\xA0-\xFF€‘’“”–—…Œœ\n]/g, "");
}

export function fmtMoney(amount: number, devise = "MAD") {
  // Intl (fr-FR) sépare les milliers par une espace fine insécable (U+202F),
  // hors encodage WinAnsi : on la remplace par une espace classique.
  const n = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount).replace(/[  ]/g, " ");
  return `${n} ${devise}`;
}

export function fmtDate(date: Date | number | string | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(date));
}

type TextOptions = {
  size?: number;
  bold?: boolean;
  color?: RGB;
  x?: number;
  align?: "left" | "right" | "center";
  maxWidth?: number;
};

export class PdfWriter {
  private constructor(
    readonly doc: PDFDocument,
    private page: PDFPage,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
    private readonly headerTitle: string,
    private readonly entete: EnteteDocument,
    private readonly logo: PDFImage | null,
  ) {
    this.y = A4.height - MARGIN;
    this.drawHeader();
  }

  y: number;
  readonly contentWidth = A4.width - 2 * MARGIN;
  readonly left = MARGIN;

  static async create(headerTitle: string, entete: EnteteDocument) {
    const doc = await PDFDocument.create();
    doc.setTitle(`${headerTitle} — ${entete.nom}`);
    doc.setAuthor(entete.nom);
    doc.setCreator(entete.nom);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    let logo: PDFImage | null = null;
    if (entete.logo) {
      // Un logo illisible ne doit jamais empêcher la génération du document : on l'ignore
      try {
        logo = entete.logo.format === "png" ? await doc.embedPng(entete.logo.bytes) : await doc.embedJpg(entete.logo.bytes);
      } catch {
        logo = null;
      }
    }
    const page = doc.addPage([A4.width, A4.height]);
    return new PdfWriter(doc, page, font, bold, headerTitle, entete, logo);
  }

  private fontFor(isBold?: boolean) {
    return isBold ? this.bold : this.font;
  }

  private drawHeader() {
    const top = A4.height - MARGIN + 10;
    this.page.drawRectangle({ x: 0, y: A4.height - 6, width: A4.width, height: 6, color: COLORS.navy });
    let x = this.left;
    if (this.logo) {
      // Logo à gauche, hauteur fixe, largeur bornée ; le nom suit
      const h = 30;
      const w = Math.min(120, (this.logo.width / this.logo.height) * h);
      this.page.drawImage(this.logo, { x, y: top - 14, width: w, height: h });
      x += w + 10;
    }
    this.page.drawText(safeText(this.entete.nom), { x, y: top, size: 16, font: this.bold, color: COLORS.navy });
    if (this.entete.sousTitre) {
      this.page.drawText(safeText(this.entete.sousTitre), { x, y: top - 13, size: 8.5, font: this.font, color: COLORS.grey });
    }
    const t = safeText(this.headerTitle);
    const w = this.bold.widthOfTextAtSize(t, 11);
    this.page.drawText(t, { x: A4.width - MARGIN - w, y: top, size: 11, font: this.bold, color: COLORS.gold });
    this.page.drawLine({
      start: { x: this.left, y: top - 22 },
      end: { x: A4.width - MARGIN, y: top - 22 },
      thickness: 0.8,
      color: COLORS.gold,
    });
    this.y = top - 40;
  }

  private drawFooters() {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      const txt = `Page ${i + 1} / ${pages.length}`;
      const w = this.font.widthOfTextAtSize(txt, 8);
      p.drawText(txt, { x: A4.width - MARGIN - w, y: 28, size: 8, font: this.font, color: COLORS.grey });
      p.drawText(safeText(`${this.entete.nom} · document généré automatiquement`), {
        x: this.left,
        y: 28,
        size: 8,
        font: this.font,
        color: COLORS.grey,
      });
    });
  }

  ensureSpace(height: number) {
    if (this.y - height < MARGIN + 30) {
      this.page = this.doc.addPage([A4.width, A4.height]);
      this.drawHeader();
    }
  }

  gap(h = 8) {
    this.y -= h;
  }

  /** Découpe un texte en lignes tenant dans maxWidth. */
  private wrap(text: string, size: number, isBold: boolean | undefined, maxWidth: number) {
    const f = this.fontFor(isBold);
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (f.widthOfTextAtSize(candidate, size) <= maxWidth) {
          current = candidate;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      }
      lines.push(current);
    }
    return lines;
  }

  text(raw: string, opts: TextOptions = {}) {
    const size = opts.size ?? 10;
    const lineHeight = size * 1.4;
    const x = opts.x ?? this.left;
    const maxWidth = opts.maxWidth ?? A4.width - MARGIN - x;
    const f = this.fontFor(opts.bold);
    const lines = this.wrap(safeText(raw), size, opts.bold, maxWidth);
    for (const line of lines) {
      this.ensureSpace(lineHeight);
      let lx = x;
      if (opts.align === "right") lx = x + maxWidth - f.widthOfTextAtSize(line, size);
      if (opts.align === "center") lx = x + (maxWidth - f.widthOfTextAtSize(line, size)) / 2;
      this.page.drawText(line, { x: lx, y: this.y - size, size, font: f, color: opts.color ?? COLORS.black });
      this.y -= lineHeight;
    }
  }

  title(raw: string) {
    this.gap(4);
    this.text(raw, { size: 18, bold: true, color: COLORS.navy });
    this.gap(6);
  }

  section(raw: string) {
    this.ensureSpace(30);
    this.gap(10);
    this.page.drawRectangle({
      x: this.left,
      y: this.y - 16,
      width: this.contentWidth,
      height: 18,
      color: COLORS.lightGrey,
    });
    this.page.drawText(safeText(raw).toUpperCase(), {
      x: this.left + 8,
      y: this.y - 12,
      size: 9.5,
      font: this.bold,
      color: COLORS.navy,
    });
    this.y -= 26;
  }

  /** Lignes "Libellé : valeur" sur deux colonnes. */
  fields(items: Array<[string, string | null | undefined]>, columns: 1 | 2 = 2) {
    const colWidth = this.contentWidth / columns;
    for (let i = 0; i < items.length; i += columns) {
      this.ensureSpace(28);
      const rowTop = this.y;
      let maxDrop = 0;
      for (let c = 0; c < columns; c++) {
        const item = items[i + c];
        if (!item) continue;
        const x = this.left + c * colWidth;
        this.y = rowTop;
        this.page.drawText(safeText(item[0]), { x, y: this.y - 8, size: 7.5, font: this.font, color: COLORS.grey });
        this.y -= 12;
        this.text(item[1] || "—", { x, size: 10, maxWidth: colWidth - 10 });
        maxDrop = Math.max(maxDrop, rowTop - this.y);
      }
      this.y = rowTop - maxDrop - 4;
    }
  }

  table(headers: string[], rows: string[][], widths: number[], opts: { alignRight?: number[] } = {}) {
    const size = 9;
    const rowH = 18;
    const totalW = widths.reduce((a, b) => a + b, 0);
    const scale = this.contentWidth / totalW;
    const cols = widths.map((w) => w * scale);
    const alignRight = new Set(opts.alignRight ?? []);

    const drawRow = (cells: string[], isHeader: boolean, zebra: boolean) => {
      this.ensureSpace(rowH + 2);
      if (isHeader) {
        this.page.drawRectangle({ x: this.left, y: this.y - rowH, width: this.contentWidth, height: rowH, color: COLORS.navy });
      } else if (zebra) {
        this.page.drawRectangle({ x: this.left, y: this.y - rowH, width: this.contentWidth, height: rowH, color: COLORS.lightGrey });
      }
      let x = this.left;
      cells.forEach((cell, i) => {
        const f = isHeader ? this.bold : this.font;
        const txt = safeText(cell);
        const w = f.widthOfTextAtSize(txt, size);
        const cx = alignRight.has(i) && !isHeader ? x + cols[i] - 6 - w : x + 6;
        this.page.drawText(txt, {
          x: cx,
          y: this.y - rowH + 5.5,
          size,
          font: f,
          color: isHeader ? COLORS.white : COLORS.black,
        });
        x += cols[i];
      });
      this.y -= rowH;
    };

    drawRow(headers, true, false);
    rows.forEach((r, i) => drawRow(r, false, i % 2 === 1));
    this.page.drawLine({
      start: { x: this.left, y: this.y },
      end: { x: this.left + this.contentWidth, y: this.y },
      thickness: 0.5,
      color: COLORS.navyLight,
    });
    this.gap(6);
  }

  /** Deux cadres de signature côte à côte. */
  signatures(leftLabel: string, rightLabel: string, note?: string) {
    const h = 90;
    this.ensureSpace(h + 30);
    this.gap(14);
    const w = this.contentWidth / 2 - 10;
    [leftLabel, rightLabel].forEach((label, i) => {
      const x = this.left + i * (w + 20);
      this.page.drawRectangle({
        x,
        y: this.y - h,
        width: w,
        height: h,
        borderColor: COLORS.navyLight,
        borderWidth: 0.8,
      });
      this.page.drawText(safeText(label), { x: x + 8, y: this.y - 14, size: 9, font: this.bold, color: COLORS.navy });
      if (note) {
        this.page.drawText(safeText(note), { x: x + 8, y: this.y - 26, size: 7.5, font: this.font, color: COLORS.grey });
      }
    });
    this.y -= h + 6;
  }

  async toBuffer(): Promise<Buffer> {
    this.drawFooters();
    const bytes = await this.doc.save();
    return Buffer.from(bytes);
  }
}
