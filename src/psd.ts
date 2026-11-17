// PSD editável da capa completa: uma camada por elemento (arte, título, autor, sinopse…).
// Os textos vão como camadas de texto de verdade (editáveis no Photoshop/Photopea) e também já desenhados,
// para abrir certinho em editores que não refazem texto (PhotoCraft, GIMP).
import { writePsd, type Layer } from "ag-psd";
import { drawWrap, kdpDims, LAYERS, type TextRec, type WrapDesign } from "./wrap";

type Img = ImageBitmap | HTMLImageElement | null;
const PS_FONT: Record<string, string> = { serif: "Georgia-Bold", didot: "Didot-Bold", impact: "Impact", copper: "Copperplate-Bold", sans: "AvenirNextCondensed-Bold" };
const rgb = (hex: string) => { const n = parseInt((hex || "#ffffff").replace("#", "").padEnd(6, "0").slice(0, 6), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; };

export function wrapPsd(d: WrapDesign, art: { front: Img; wrap: Img; back?: Img }, dpi: number, names: (pt: string) => string): Uint8Array {
  const m = kdpDims(d.trim, d.pages, d.paper);
  const W = Math.round(m.W * dpi), H = Math.round(m.H * dpi);
  const mk = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
  const recs: TextRec[] = [];
  const full = mk(); drawWrap(full.getContext("2d")!, d, art, dpi, false, undefined, recs);
  const children: Layer[] = [];
  for (const [k, label] of LAYERS) {
    const c = mk(); drawWrap(c.getContext("2d")!, d, art, dpi, false, k);
    const r = recs.find((x) => x.k === k);
    if (!r && k !== "art" && k !== "spine" && k !== "barcode") continue;
    const L: Layer = { name: names(label), canvas: c, left: 0, top: 0 };
    if (r) L.text = {
      text: r.text, transform: [1, 0, 0, 1, r.x, r.y],
      style: { font: { name: k === "back" || k === "bio" ? "Georgia" : PS_FONT[d.font] || "Georgia-Bold" }, fontSize: r.size, fillColor: rgb(r.color), leading: r.lead, autoLeading: false },
      paragraphStyle: { justification: r.align },
    };
    children.push(L);
  }
  // camada de guias (escondida): corte, lombada e área segura
  const g = mk(), x = g.getContext("2d")!; const P = (i: number) => i * dpi; const backW = P(0.125 + m.trimW), spineW = P(m.spine);
  x.lineWidth = Math.max(2, P(0.01)); x.strokeStyle = "#ff5050"; x.strokeRect(P(0.125), P(0.125), W - P(0.25), H - P(0.25));
  x.strokeStyle = "#50c8ff"; x.beginPath(); x.moveTo(backW, 0); x.lineTo(backW, H); x.moveTo(backW + spineW, 0); x.lineTo(backW + spineW, H); x.stroke();
  children.push({ name: names("Guias (esconder antes de exportar)"), canvas: g, left: 0, top: 0, hidden: true });
  const buf = writePsd({ width: W, height: H, canvas: full, children }, { generateThumbnail: false });
  return new Uint8Array(buf);
}

export function b64(u: Uint8Array) { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }
