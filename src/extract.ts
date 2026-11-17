// Leitura de PDF/DOCX/TXT no próprio app (funciona igual no macOS e no Windows).
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
// @ts-ignore — mammoth não tem tipos
import mammoth from "mammoth/mammoth.browser";
import { convertFileSrc } from "@tauri-apps/api/core";
import { pdfItem, pdfToText, type PItem } from "./pdftext";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function fileBytes(path: string): Promise<ArrayBuffer> {
  const r = await fetch(convertFileSrc(path));
  if (!r.ok) throw new Error("não consegui ler o arquivo");
  return r.arrayBuffer();
}

const pdfCache = new Map<string, Promise<pdfjs.PDFDocumentProxy>>();
export function openPdf(path: string) {
  if (!pdfCache.has(path)) pdfCache.set(path, fileBytes(path).then((data) => pdfjs.getDocument({ data }).promise));
  return pdfCache.get(path)!;
}

export interface Extracted { text: string; pages: number; thumb?: string; html?: string; title?: string }

/** Texto corrido de um PDF, reconstruindo parágrafos e tirando cabeçalhos/números de página. */
export async function extractPdf(path: string, onProgress?: (p: number) => void): Promise<Extracted> {
  const doc = await openPdf(path);
  const pages: PItem[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push((tc.items as any[]).map(pdfItem).filter((x): x is PItem => !!x));
    if (onProgress && i % 10 === 0) onProgress(i / doc.numPages);
  }
  const text = pdfToText(pages);
  const thumb = await renderThumb(doc, doc.numPages <= 2 ? 1400 : 500);
  return { text, pages: doc.numPages, thumb };
}

export async function renderThumb(doc: pdfjs.PDFDocumentProxy, width: number, pageNo = 1): Promise<string> {
  const page = await doc.getPage(pageNo);
  const v = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: width / v.width });
  const c = document.createElement("canvas");
  c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
  return c.toDataURL("image/png");
}

export async function extractDocx(path: string): Promise<Extracted> {
  const arrayBuffer = await fileBytes(path);
  const [raw, html] = await Promise.all([mammoth.extractRawText({ arrayBuffer }), mammoth.convertToHtml({ arrayBuffer })]);
  const text = (raw.value as string).replace(/\n{3,}/g, "\n\n").trim();
  return { text, html: html.value, pages: Math.max(1, Math.round(text.split(/\s+/).length / 300)) };
}

export async function extractAny(path: string, ext: string, onProgress?: (p: number) => void): Promise<Extracted> {
  if (ext === "pdf") return extractPdf(path, onProgress);
  if (ext === "docx") return extractDocx(path);
  if (["txt", "md", "markdown"].includes(ext)) {
    const text = new TextDecoder().decode(await fileBytes(path));
    return { text, pages: Math.max(1, Math.round(text.split(/\s+/).length / 300)) };
  }
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return { text: "", pages: 1, thumb: convertFileSrc(path) };
  throw new Error(`formato .${ext} não suportado (use PDF, DOCX, TXT ou imagem)`);
}

/** Dados do autor encontrados nas páginas iniciais (copyright, e-mail, site, editores). */
export function findAuthorInfo(text: string) {
  const head = text.slice(0, 6000);
  const email = head.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
  const copy = head.match(/Copyright\s*©?\s*(\d{4})?\s*(?:by\s+)?([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,3})/);
  const site = head.match(/\b(?:www\.)?[A-Za-z0-9-]+\.(?:com|net|org|co\.za|com\.br)\b/)?.[0];
  const editors = head.match(/Edited by ([^\n.]+)/)?.[1];
  return { email, year: copy?.[1], name: copy?.[2], site: site && !email?.includes(site) ? site : undefined, editors };
}
