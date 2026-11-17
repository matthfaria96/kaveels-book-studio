// PDF do livro: miolo para impressão (KDP paperback, no tamanho do corte, com margem interna) ou PDF simples para leitura.
import { jsPDF } from "jspdf";
import { TRIMS } from "./wrap";

export interface PdfBook { title: string; author: string; subtitle?: string; chapters: { title: string; html: string }[] }
type Block = { t: "p" | "break" | "h"; text: string; first?: boolean };

// fontes padrão do PDF usam WinAnsi: troca o que não existe nela
const WIN = /[^\x20-\x7E\xA0-\xFF‘’“”—–…•€™‚„†‡‰Š‹ŒŽšœžŸ]/g;
const clean = (s: string) => s.replace(/ /g, " ").replace(/[‐‑‒]/g, "-").replace(/⁂|✦|❖/g, "*").replace(WIN, "").replace(/\s+/g, " ").trim();

function blocks(html: string): Block[] {
  const d = document.createElement("div"); d.innerHTML = html.replace(/<br\s*\/?>/gi, "\u2028");
  const out: Block[] = []; let after = true;
  const push = (t: Block["t"], text: string): void => { if (t === "p" && text.includes("\u2028")) { text.split("\u2028").forEach((x) => push("p", x)); return; } if (t === "p") { const c = clean(text); if (!c) return; if (/^(\*\s*){3}$|^#+$/.test(c)) { out.push({ t: "break", text: "" }); after = true; return; } out.push({ t, text: c, first: after }); after = false; } else { out.push({ t, text: clean(text) }); after = true; } };
  const walk = (n: Element) => { for (const c of Array.from(n.children)) { const tag = c.tagName; if (tag === "HR") push("break", ""); else if (/^H[1-6]$/.test(tag)) push("p", (c.textContent || "")); else if (tag === "P" || tag === "LI" || tag === "BLOCKQUOTE") push("p", (c.textContent || "")); else if (c.children.length) walk(c); else push("p", (c.textContent || "")); } };
  walk(d);
  if (!out.length && (d.textContent || "").trim()) (d.textContent || "").split(/\n{2,}/).forEach((t) => push("p", t));
  return out;
}

/** print = miolo KDP (corte + margem interna), senão A5 para leitura. Devolve o PDF em base64 e o nº de páginas. */
export function makePdf(b: PdfBook, o: { print: boolean; trim?: string; fontSize?: number }) {
  const [tw, th] = o.print ? TRIMS[o.trim || "6x9"] || TRIMS["6x9"] : [5.83, 8.27];
  const W = tw * 72, H = th * 72;
  const doc = new jsPDF({ unit: "pt", format: [W, H], compress: true });
  const fs = o.fontSize || (tw <= 5.25 ? 10.5 : 11), lh = fs * 1.42, indent = fs * 1.5;
  // margens KDP: interna cresce com o nº de páginas (estimado); externa 0,5"
  const estPages = Math.max(24, Math.round(b.chapters.reduce((n, c) => n + (c.html.match(/\S+/g) || []).length, 0) / (tw * th * 6.2)));
  const gutter = !o.print ? 54 : (estPages <= 150 ? 0.375 : estPages <= 300 ? 0.5 : estPages <= 500 ? 0.625 : 0.75) * 72 + 18;
  const outer = o.print ? 0.55 * 72 : 54, top = 0.7 * 72, bottom = 0.75 * 72;
  let page = 1, y = top;
  const left = () => (!o.print ? 54 : page % 2 === 1 ? gutter : outer);
  const width = () => W - gutter - outer;
  const footers: number[] = [];
  const newPage = (noNum = false) => { doc.addPage([W, H]); page++; y = top; if (!noNum) footers.push(page); };
  const toRecto = () => { if (o.print && page % 2 === 0) { doc.addPage([W, H]); page++; } };

  doc.setFont("times", "normal");
  // folha de rosto
  doc.setFontSize(26); doc.setFont("times", "bold");
  const tl = doc.splitTextToSize(clean(b.title).toUpperCase(), W - 2 * outer);
  doc.text(tl, W / 2, H * 0.36, { align: "center" });
  if (b.subtitle) { doc.setFont("times", "italic"); doc.setFontSize(14); doc.text(clean(b.subtitle), W / 2, H * 0.36 + tl.length * 30 + 6, { align: "center" }); }
  doc.setFont("times", "normal"); doc.setFontSize(14); doc.text(clean(b.author).toUpperCase(), W / 2, H * 0.62, { align: "center", charSpace: 1.5 });
  // direitos autorais (verso)
  doc.addPage([W, H]); page++;
  doc.setFontSize(8.5); doc.text([`Copyright © ${new Date().getFullYear()} ${clean(b.author)}`, "All rights reserved.", "", "This is a work of fiction. Names, characters, places and incidents", "are products of the author's imagination or are used fictitiously."], outer, H - bottom - 50);

  const line = (words: string[], x: number, w: number, justify: boolean) => {
    if (!justify || words.length < 2) { doc.text(words.join(" "), x, y); return; }
    const tot = words.reduce((n, s) => n + doc.getTextWidth(s), 0), gap = (w - tot) / (words.length - 1);
    let cx = x; for (const s of words) { doc.text(s, cx, y); cx += doc.getTextWidth(s) + gap; }
  };
  for (const [ci, ch] of b.chapters.entries()) {
    newPage(true); if (o.print) { toRecto(); }
    y = H * 0.28;
    const m = ch.title.match(/^chapter\s*(\d+)\s*:?\s*(.*)$/i);
    doc.setFont("times", "normal"); doc.setFontSize(11); doc.text(m ? `CHAPTER ${m[1]}` : `${ci + 1}`, left() + width() / 2, y, { align: "center", charSpace: 2 });
    y += 26; doc.setFont("times", "bold"); doc.setFontSize(19);
    const ht = doc.splitTextToSize(clean(m ? m[2] || ch.title : ch.title), width() - 20);
    doc.text(ht, left() + width() / 2, y, { align: "center" }); y += ht.length * 24 + 26;
    doc.setFont("times", "normal"); doc.setFontSize(fs);
    for (const bl of blocks(ch.html)) {
      if (bl.t === "break") { if (y + lh * 2 > H - bottom) { newPage(); } else { y += lh * 0.4; doc.text("*   *   *", left() + width() / 2, y, { align: "center" }); y += lh * 1.2; } continue; }
      const ws = bl.text.split(" "); let cur: string[] = []; let first = true;
      const flush = (last: boolean) => {
        if (y > H - bottom) newPage();
        const ind = first && !bl.first ? indent : 0;
        line(cur, left() + ind, width() - ind, !last); y += lh; cur = []; first = false;
      };
      for (const w of ws) {
        const ind = first && !bl.first ? indent : 0;
        const test = [...cur, w].join(" ");
        if (cur.length && doc.getTextWidth(test) > width() - ind) flush(false);
        cur.push(w);
      }
      if (cur.length) flush(true);
    }
  }
  // números de página (rodapé central), menos aberturas de capítulo e páginas iniciais
  const total = doc.getNumberOfPages();
  doc.setFont("times", "normal"); doc.setFontSize(9);
  for (const pg of footers) { if (pg > total) continue; doc.setPage(pg); doc.text(String(pg), W / 2, H - bottom / 2, { align: "center" }); }
  const b64 = doc.output("datauristring").split(",")[1];
  return { b64, pages: total };
}
