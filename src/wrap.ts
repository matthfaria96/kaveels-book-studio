// Capa completa da KDP (paperback): verso + lombada + frente com sangria, nas medidas oficiais.
// Lombada = páginas × espessura do papel; sangria de 0,125" em volta; área segura de 0,125" dentro do corte.

export const TRIMS: Record<string, [number, number]> = { "5x8": [5, 8], "5.25x8": [5.25, 8], "5.5x8.5": [5.5, 8.5], "6x9": [6, 9] };
export const PAPER: Record<string, number> = { white: 0.002252, cream: 0.0025 };
export const BLEED = 0.125;

export interface WrapDims { trimW: number; trimH: number; spine: number; W: number; H: number; spineText: boolean }
export function kdpDims(trim: string, pages: number, paper: string): WrapDims {
  const [tw, th] = TRIMS[trim] || TRIMS["6x9"];
  const spine = Math.max(24, pages) * (PAPER[paper] || PAPER.cream);
  return { trimW: tw, trimH: th, spine, W: tw * 2 + spine + BLEED * 2, H: th + BLEED * 2, spineText: pages >= 79 };
}

export interface WrapDesign {
  trim: string; paper: string; pages: number;
  title: string; subtitle: string; author: string; series: string; tagline: string; back: string; bio: string;
  font: string; titleColor: string; accent: string; textColor: string; spineColor: string;
  titlePos: "top" | "bottom"; titleSize: number; darkBack: number;
}
export const FONTS: Record<string, string> = {
  serif: "Georgia, 'Times New Roman', serif", didot: "Didot, 'Bodoni 72', 'Bodoni MT', Georgia, serif", impact: "Impact, 'Haettenschweiler', 'Arial Black', sans-serif",
  copper: "Copperplate, 'Copperplate Gothic Bold', 'Trajan Pro', Georgia, serif", sans: "'Avenir Next Condensed', 'Futura', 'Arial Narrow', Arial, sans-serif",
};

type Img = ImageBitmap | HTMLImageElement | null;

function cover(ctx: CanvasRenderingContext2D, img: Img, x: number, y: number, w: number, h: number, focusX = 0.5) {
  if (!img) return;
  const iw = img.width, ih = img.height, s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (iw - sw) * focusX, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n+/)) {
    let line = "";
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line, "");
  }
  return out.slice(0, -1);
}

/** Texto ajustado à largura (diminui a fonte até caber, quebra em até 3 linhas). */
function fitTitle(ctx: CanvasRenderingContext2D, text: string, font: string, maxW: number, size: number) {
  for (let s = size; s > size * 0.35; s *= 0.94) {
    ctx.font = `700 ${s}px ${font}`;
    const lines = wrapLines(ctx, text.toUpperCase(), maxW).filter(Boolean);
    if (lines.length <= 3 && lines.every((l) => ctx.measureText(l).width <= maxW)) return { lines, size: s };
  }
  ctx.font = `700 ${size * 0.35}px ${font}`;
  return { lines: wrapLines(ctx, text.toUpperCase(), maxW).filter(Boolean), size: size * 0.35 };
}

function spaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number) {
  const chars = [...text];
  const w = chars.reduce((n, c) => n + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
  let x = cx - w / 2;
  ctx.textAlign = "left";
  for (const c of chars) { ctx.fillText(c, x, y); x += ctx.measureText(c).width + spacing; }
  ctx.textAlign = "center";
}

/** Lombada sólida: cor escura com volume (mais clara no centro), sombra nas dobras e filete de destaque. */
function drawSpine(ctx: CanvasRenderingContext2D, x: number, w: number, H: number, d: WrapDesign, P: (i: number) => number) {
  const base = d.spineColor || "#0b0a0c";
  ctx.fillStyle = base; ctx.fillRect(x - P(0.04), 0, w + P(0.08), H); // passa um pouco das dobras: a KDP tolera ±1/16"
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, "rgba(0,0,0,.55)"); g.addColorStop(0.18, "rgba(255,255,255,.04)"); g.addColorStop(0.5, "rgba(255,255,255,.08)"); g.addColorStop(0.82, "rgba(255,255,255,.04)"); g.addColorStop(1, "rgba(0,0,0,.55)");
  ctx.fillStyle = g; ctx.fillRect(x, 0, w, H);
  // sombra suave sobre as artes, para a dobra não parecer um corte seco
  const sh = P(0.12);
  let s = ctx.createLinearGradient(x - sh, 0, x, 0); s.addColorStop(0, "rgba(0,0,0,0)"); s.addColorStop(1, "rgba(0,0,0,.6)"); ctx.fillStyle = s; ctx.fillRect(x - sh, 0, sh, H);
  s = ctx.createLinearGradient(x + w, 0, x + w + sh, 0); s.addColorStop(0, "rgba(0,0,0,.6)"); s.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = s; ctx.fillRect(x + w, 0, sh, H);
}
/** Desenha a capa inteira. dpi define a escala (300 para impressão, menor para a prévia). */
export interface TextRec { k: string; text: string; x: number; y: number; size: number; color: string; align: "left" | "center"; lead: number }
/** Camadas separadas (para o PSD editável). */
export const LAYERS: [string, string][] = [["art", "Arte"], ["spine", "Lombada (texto)"], ["series", "Série"], ["title", "Título"], ["subtitle", "Subtítulo"], ["author", "Autor"], ["tagline", "Chamada do verso"], ["back", "Sinopse"], ["bio", "Bio"], ["barcode", "Código de barras (KDP)"]];
export function drawWrap(ctx: CanvasRenderingContext2D, d: WrapDesign, art: { front: Img; wrap: Img; back?: Img }, dpi: number, guides: boolean, only?: string, rec?: TextRec[]) {
  const on = (k: string) => !only || only === k;
  const put = (k: string, text: string, x: number, y: number, size: number, color: string, align: "left" | "center", lead = size * 1.2) => { if (rec && on(k) && text) rec.push({ k, text, x, y, size, color, align, lead }); };
  const m = kdpDims(d.trim, d.pages, d.paper);
  const P = (inch: number) => inch * dpi;
  const W = P(m.W), H = P(m.H);
  const backW = P(BLEED + m.trimW), spineX = backW, spineW = P(m.spine), frontX = spineX + spineW, frontW = W - frontX;
  const font = FONTS[d.font] || FONTS.serif;
  ctx.save();
  if (on("art")) { ctx.fillStyle = d.spineColor || "#111"; ctx.fillRect(0, 0, W, H); }

  // fundo: arte panorâmica na capa inteira, ou a arte da frente + verso escurecido
  if (!on("art")) { /* só texto */ } else if (art.wrap) {
    cover(ctx, art.wrap, 0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, frontX, 0);
    g.addColorStop(0, `rgba(0,0,0,${d.darkBack})`); g.addColorStop(0.85, `rgba(0,0,0,${d.darkBack * 0.8})`); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, frontX, H);
  } else if (art.front || art.back) {
    // verso: arte própria (cena diferente da frente); sem ela, a frente desfocada e escura como provisório
    if (art.back) {
      cover(ctx, art.back, 0, 0, backW, H, 0.5);
      const g = ctx.createLinearGradient(0, 0, 0, H); // escurece mais em cima, onde fica a sinopse
      g.addColorStop(0, `rgba(0,0,0,${Math.min(0.92, d.darkBack + 0.2)})`); g.addColorStop(0.62, `rgba(0,0,0,${d.darkBack})`); g.addColorStop(1, `rgba(0,0,0,${d.darkBack * 0.35})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, backW, H);
    } else if (art.front) {
      ctx.save(); ctx.filter = `blur(${P(0.12)}px) brightness(${1 - d.darkBack})`;
      cover(ctx, art.front, -P(0.3), -P(0.3), backW + P(0.6), H + P(0.6), 0.3);
      ctx.restore();
    }
    if (art.front) cover(ctx, art.front, frontX, 0, frontW, H, 0.5);
    drawSpine(ctx, spineX, spineW, H, d, P);
  }

  // ---------- frente ----------
  const fx = frontX + frontW / 2 - P(BLEED) / 2, safeW = P(m.trimW - 0.6);
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,.75)"; ctx.shadowBlur = P(0.06);
  const vis = ctx.globalAlpha; const show = (k: string) => { ctx.globalAlpha = on(k) ? vis : 0; };
  show("series");
  if (d.series) { put("series", d.series.toUpperCase(), fx, P(BLEED + 0.55), P(0.2), d.accent, "center"); ctx.font = `700 ${P(0.2)}px ${font}`; ctx.fillStyle = d.accent; spaced(ctx, d.series.toUpperCase(), fx, P(BLEED + 0.55), P(0.05)); }
  const t = fitTitle(ctx, d.title || "Untitled", font, safeW, P(0.95 * d.titleSize));
  const lh = t.size * 1.02, block = lh * t.lines.length;
  let ty = d.titlePos === "top" ? P(BLEED + 0.9) + t.size * 0.85 : P(BLEED + m.trimH - 1.15) - block + t.size * 0.85;
  show("title"); put("title", t.lines.join("\r"), fx, ty, t.size, d.titleColor, "center", lh);
  ctx.font = `700 ${t.size}px ${font}`; ctx.fillStyle = d.titleColor;
  ctx.lineWidth = t.size * 0.035; ctx.strokeStyle = "rgba(0,0,0,.6)";
  for (const l of t.lines) { ctx.strokeText(l, fx, ty); ctx.fillText(l, fx, ty); ty += lh; }
  show("subtitle"); if (d.subtitle) put("subtitle", d.subtitle, fx, ty - lh + t.size * 0.25 + P(0.3), P(0.2), d.textColor, "center");
  if (d.subtitle) { ctx.font = `italic ${P(0.2)}px ${font}`; ctx.fillStyle = d.textColor; ctx.fillText(d.subtitle, fx, ty - lh + t.size * 0.25 + P(0.3)); }
  show("author"); put("author", (d.author || "").toUpperCase(), fx, P(BLEED + m.trimH - 0.45), P(0.3), d.textColor, "center");
  ctx.font = `600 ${P(0.3)}px ${font}`; ctx.fillStyle = d.textColor;
  spaced(ctx, (d.author || "").toUpperCase(), fx, P(BLEED + m.trimH - 0.45), P(0.04));

  // ---------- lombada ----------
  show("spine");
  if (m.spineText) {
    ctx.save(); ctx.translate(spineX + spineW / 2, P(BLEED)); ctx.rotate(Math.PI / 2);
    const avail = P(m.trimH - 0.8), sz = Math.min(spineW * 0.55, P(0.32));
    ctx.font = `700 ${sz}px ${font}`; ctx.fillStyle = d.titleColor; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    const tt = (d.title || "").toUpperCase(); const tw = Math.min(ctx.measureText(tt).width, avail * 0.62);
    ctx.fillText(tt, P(0.55), 0, avail * 0.62);
    ctx.fillStyle = d.accent; const sep = P(0.55) + tw + P(0.22); ctx.beginPath(); ctx.arc(sep, 0, Math.max(2, sz * 0.12), 0, Math.PI * 2); ctx.fill(); // ponto de destaque
    ctx.font = `600 ${sz * 0.72}px ${font}`; ctx.fillStyle = d.textColor; ctx.textAlign = "right";
    ctx.fillText((d.author || "").toUpperCase(), P(m.trimH - 0.5), 0, avail * 0.34);
    ctx.restore();
  }

  // ---------- verso ----------
  ctx.shadowBlur = P(0.03);
  const bx = P(BLEED + 0.55), bw = P(m.trimW - 1.05);
  let by = P(BLEED + 0.85);
  ctx.textAlign = "left";
  show("tagline");
  if (d.tagline) {
    { const tmp: string[] = []; ctx.font = `700 ${P(0.24)}px ${font}`; for (const l of wrapLines(ctx, d.tagline, bw)) tmp.push(l); put("tagline", tmp.join("\r"), bx, by, P(0.24), d.accent, "left", P(0.32)); }
    ctx.font = `700 ${P(0.24)}px ${font}`; ctx.fillStyle = d.accent;
    for (const l of wrapLines(ctx, d.tagline, bw)) { ctx.fillText(l, bx, by); by += P(0.32); }
    by += P(0.15);
  }
  show("back");
  ctx.font = `${P(0.145)}px ${FONTS.serif}`; ctx.fillStyle = d.textColor;
  const maxY = P(BLEED + m.trimH - 1.75);
  { const bl: string[] = []; const by0 = by; for (const l of wrapLines(ctx, d.back, bw)) { if (by > maxY) break; bl.push(l); if (l) ctx.fillText(l, bx, by); by += l ? P(0.215) : P(0.12); } put("back", bl.join("\r"), bx, by0, P(0.145), d.textColor, "left", P(0.215)); }
  show("bio");
  if (d.bio && by < maxY - P(0.5)) {
    by += P(0.1); ctx.font = `italic ${P(0.125)}px ${FONTS.serif}`; ctx.globalAlpha = on("bio") ? 0.85 : 0;
    const bl: string[] = []; const by0 = by; for (const l of wrapLines(ctx, d.bio, bw)) { if (by > maxY) break; bl.push(l); ctx.fillText(l, bx, by); by += P(0.18); }
    put("bio", bl.join("\r"), bx, by0, P(0.125), d.textColor, "left", P(0.18));
    ctx.globalAlpha = 1;
  }
  // área do código de barras (a KDP imprime o código aqui): 2" × 1.2", 0,25" das bordas de corte
  ctx.shadowBlur = 0; show("barcode");
  ctx.fillStyle = "#fff"; ctx.fillRect(P(BLEED + m.trimW - 0.25 - 2), P(BLEED + m.trimH - 0.25 - 1.2), P(2), P(1.2));
  if (guides) { ctx.fillStyle = "#999"; ctx.font = `${P(0.11)}px sans-serif`; ctx.textAlign = "center"; ctx.fillText("barcode (KDP)", P(BLEED + m.trimW - 1.25), P(BLEED + m.trimH - 0.8)); }

  // ---------- guias (só na prévia) ----------
  if (guides) {
    ctx.setLineDash([P(0.06), P(0.05)]); ctx.lineWidth = Math.max(1, P(0.008));
    ctx.strokeStyle = "rgba(255,80,80,.9)"; ctx.strokeRect(P(BLEED), P(BLEED), W - P(BLEED * 2), H - P(BLEED * 2)); // corte
    ctx.strokeStyle = "rgba(80,200,255,.9)"; ctx.beginPath(); ctx.moveTo(spineX, 0); ctx.lineTo(spineX, H); ctx.moveTo(frontX, 0); ctx.lineTo(frontX, H); ctx.stroke(); // lombada
    ctx.strokeStyle = "rgba(120,255,140,.6)"; ctx.strokeRect(P(BLEED * 2), P(BLEED * 2), backW - P(BLEED * 3), H - P(BLEED * 4)); ctx.strokeRect(frontX + P(BLEED), P(BLEED * 2), frontW - P(BLEED * 3), H - P(BLEED * 4)); // área segura
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = vis; ctx.restore();
  return { W, H, frontX, frontW };
}
