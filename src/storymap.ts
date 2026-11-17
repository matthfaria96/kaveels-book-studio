import { tr, isEn } from "./i18n";
// Mapa da história: rede viva (estilo grafo do Obsidian) com capítulos, personagens, lugares, objetos e eventos.
// Sem IA o mapa sai das menções no texto (custo zero); com a IA, cada capítulo vira uma ficha curta (ledger) e o mapa ganha
// lugares, objetos, eventos e fatos — que também alimentam a busca de contradições.

export interface ChapLedger { i: number; title: string; summary: string; characters: string[]; places: string[]; objects: string[]; events: string[]; facts: string[]; time: string }
export interface Finding { title: string; chapters: number[]; kind: string; problem: string; fix: string; quote?: string; suggestion?: string; status?: "open" | "fixed" | "ignored" }
export interface Ending { title: string; summary: string; changes: string; tone: string }
export interface BookAnalysis { ledger: ChapLedger[]; ledgerAt?: number; contradictions?: Finding[]; endings?: Ending[]; improve?: Record<number, { findings: Finding[]; words: [string, string, string][]; imagery: string[]; at: number }> }

export type MGroup = "book" | "chapter" | "character" | "place" | "object" | "event";
/** Cores do mapa conforme o tema (claro ou escuro), lidas do fundo do app. */
function theme() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#14110f";
  const n = parseInt(bg.replace("#", "").padEnd(6, "0").slice(0, 6), 16), lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.5
    ? { colors: { chapter: "#b8862c", character: "#d6485a", place: "#1f93a6", object: "#5c9a37", event: "#a347c4", book: "#c8963e" }, hull: 0.09, link: "#9c8b76", ring: "#fffdfa", num: "#2a1d0e", box: "#2a2119", boxText: "#fffaf2", label: "#2a2119", label2: "#6f6152", halo: bg }
    : { colors: { chapter: "#c8963e", character: "#e06c75", place: "#56b6c2", object: "#98c379", event: "#c678dd", book: "#f0d9a8" }, hull: 0.07, link: "#8a7a66", ring: "#16120e", num: "#16120e", box: "#16120e", boxText: "#efe6d8", label: "#efe6d8", label2: "#a8998a", halo: bg };
}
export const MGROUPS: [MGroup, string, string][] = [
  ["chapter", "Capítulos", "#c8963e"], ["character", "Personagens", "#e06c75"], ["place", "Lugares", "#56b6c2"],
  ["object", "Objetos", "#98c379"], ["event", "Eventos", "#c678dd"],
];
export interface MNode { id: string; label: string; group: MGroup; sub?: string; chapters: number[]; note?: string; x: number; y: number; vx: number; vy: number; r: number }
export interface MLink { a: string; b: string; kind: "seq" | "in" | "with"; w: number }
export interface MGraph { nodes: MNode[]; links: MLink[] }

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/["“”'’]/g, "").replace(/\s+/g, " ").trim();
const firstName = (s: string) => s.replace(/["“”].*?["“”]/g, " ").trim().split(/\s+/)[0] || s;
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Grafo a partir das fichas (ledger) da IA. */
export function graphFromLedger(title: string, led: ChapLedger[], extra: { name: string; group: MGroup; note?: string }[] = [], all = false): MGraph {
  const nodes = new Map<string, MNode>(), links: MLink[] = [];
  const add = (id: string, label: string, group: MGroup, ch?: number, note?: string) => {
    let n = nodes.get(id);
    if (!n) { n = { id, label, group, chapters: [], note, x: 0, y: 0, vx: 0, vy: 0, r: 5 }; nodes.set(id, n); }
    if (ch !== undefined && !n.chapters.includes(ch)) n.chapters.push(ch);
    if (note && !n.note) n.note = note;
    return n;
  };
  add("book", title, "book");
  // nomes: junta "Melika" e "Melika Chernov" pelo primeiro nome quando só existe um com esse primeiro nome
  const canon = new Map<string, string>();
  const cleanC = (x: string) => x.replace(/\s*\([^)]*\)?/g, "").trim();
  led = led.map((c) => ({ ...c, characters: (c.characters || []).map(cleanC).filter(Boolean) }));
  const allChars = [...new Set(led.flatMap((c) => c.characters))];
  for (const c of [...allChars].sort((a, b) => b.length - a.length)) { const f = norm(firstName(c)); if (!canon.has(f)) canon.set(f, c); }
  const charKey = (c: string) => canon.get(norm(firstName(c))) || c;
  const keep = new Set<string>();
  for (const e of extra) keep.add(`${e.group}:${e.group === "character" ? norm(charKey(e.name)) : elNorm(e.name)}`);
  for (const e of extra) add(`${e.group}:${e.group === "character" ? norm(charKey(e.name)) : elNorm(e.name)}`, e.group === "character" ? charKey(e.name) : e.name, e.group, undefined, e.note);
  led.forEach((c, k) => {
    const cid = `ch:${c.i}`;
    add(cid, `${c.i + 1}. ${c.title.replace(/^chapter\s*\d+:?\s*/i, "")}`, "chapter", c.i, c.summary).sub = c.time;
    links.push({ a: k ? `ch:${led[k - 1].i}` : "book", b: cid, kind: "seq", w: 1 });
    const here: string[] = [];
    for (const [arr, g] of [[c.characters, "character"], [c.places, "place"], [c.objects, "object"], [c.events, "event"]] as [string[], MGroup][]) {
      for (const raw of arr || []) {
        const name = g === "character" ? charKey(raw) : g === "event" ? raw : raw.replace(/\s*\([^)]*\)?/g, "").trim(); if (!name || name.length > 60) continue;
        const id = `${g}:${g === "character" || g === "event" ? norm(name) : elNorm(name)}`; add(id, name, g, c.i); links.push({ a: cid, b: id, kind: "in", w: 1 }); if (g === "character") here.push(id);
      }
    }
    for (let x = 0; x < here.length; x++) for (let y = x + 1; y < here.length; y++) links.push({ a: here[x], b: here[y], kind: "with", w: 1 });
  });
  let ns = [...nodes.values()];
  // visão principal: só o que se repete (2+ capítulos) ou já está no Mundo; eventos ficam no painel do capítulo
  if (!all) ns = ns.filter((n) => n.group === "book" || n.group === "chapter" || n.group === "character" || keep.has(n.id) || ((n.group === "place" || n.group === "object") && n.chapters.length >= 2));
  const ok = new Set(ns.map((n) => n.id));
  return merge({ nodes: ns.filter((n) => n.group !== "character" || n.chapters.length || keep.has(n.id)), links: links.filter((l) => ok.has(l.a) && ok.has(l.b)) });
}
const elNorm = (x: string) => norm(x).replace(/^(the|a|an|o|os|as)\s+/, "").replace(/s\b/g, "");

/** Grafo sem IA: capítulos + nomes mencionados (fichas do Estúdio ou nomes que mais aparecem no livro). */
export function graphQuick(title: string, chapters: { title: string; text: string }[], names: { name: string; group: MGroup; note?: string }[]): MGraph {
  const led: ChapLedger[] = chapters.map((c, i) => {
    const has = (n: string) => { const k = firstName(n); return k.length > 2 && new RegExp(`\\b${reEsc(k)}\\b`).test(c.text); };
    const hasFull = (n: string) => new RegExp(`\\b${reEsc(n)}\\b`, "i").test(c.text);
    return { i, title: c.title, summary: c.text.replace(/\s+/g, " ").slice(0, 220) + "…", time: "",
      characters: names.filter((n) => n.group === "character" && has(n.name)).map((n) => n.name),
      places: names.filter((n) => n.group === "place" && hasFull(n.name)).map((n) => n.name),
      objects: names.filter((n) => n.group === "object" && hasFull(n.name)).map((n) => n.name),
      events: names.filter((n) => n.group === "event" && hasFull(n.name)).map((n) => n.name), facts: [] };
  });
  return graphFromLedger(title, led, names);
}

/** Soma ligações repetidas (peso) e remove pontos soltos sem capítulo. */
function merge(g: MGraph): MGraph {
  const m = new Map<string, MLink>();
  for (const l of g.links) { const [a, b] = l.a < l.b ? [l.a, l.b] : [l.b, l.a]; const k = `${a}|${b}|${l.kind}`; const o = m.get(k); if (o) o.w++; else m.set(k, { ...l, a, b }); }
  const links = [...m.values()].filter((l) => l.kind !== "with" || l.w >= 2); // "aparecem juntos" só a partir de 2 capítulos
  const used = new Set(links.flatMap((l) => [l.a, l.b]));
  return { nodes: g.nodes.filter((n) => n.group === "book" || used.has(n.id)), links };
}


// ---------- leitura das respostas da IA ----------
export function parseJson<T>(s: string): T | null {
  const m = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/); if (!m) return null;
  try { return JSON.parse(m[0]); } catch { try { return JSON.parse(m[0].replace(/,\s*([}\]])/g, "$1")); } catch { return null; } }
}
/** Blocos "### Título" + "Campo: valor". */
export function parseBlocks(text: string): Record<string, string>[] {
  const out: Record<string, string>[] = []; let cur: Record<string, string> | null = null, last = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\*\*/g, "").trimEnd(); if (!line.trim()) continue;
    const h = line.match(/^#{2,4}\s*(?:\d+[.)]\s*)?(.+)$/); if (h) { cur = { title: h[1].trim() }; out.push(cur); last = ""; continue; }
    if (!cur) continue;
    const m = line.match(/^\s*[-*•]?\s*([A-Za-z /]{2,24}):\s*(.*)$/);
    if (m) { last = m[1].toLowerCase().trim(); cur[last] = m[2].trim(); } else if (last) cur[last] += " " + line.trim();
  }
  return out;
}

// ---------- desenho (canvas) ----------
export interface MapCtl { stop(): void; select(id: string | null): void; search(q: string): MNode | null; setHidden(h: Set<string>): void; fit(): void }
export function mountMap(host: HTMLElement, g: MGraph, onSelect: (n: MNode | null) => void): MapCtl {
  host.innerHTML = `<canvas></canvas><div class="gr-tip"></div><div class="gr-zoom"><button data-gz="1" title="Zoom +">+</button><button data-gz="-1" title="Zoom −">−</button><button data-gz="0" title="Ver tudo">◎</button></div>`;
  const cv = host.querySelector("canvas")!, tip = host.querySelector<HTMLElement>(".gr-tip")!, ctx = cv.getContext("2d")!;
  const color: Record<string, string> = Object.fromEntries(MGROUPS.map(([k, , c]) => [k, c])); color.book = "#f0d9a8";
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const adj = new Map<string, { o: string; l: MLink }[]>();
  for (const l of g.links) { (adj.get(l.a) ?? adj.set(l.a, []).get(l.a)!).push({ o: l.b, l }); (adj.get(l.b) ?? adj.set(l.b, []).get(l.b)!).push({ o: l.a, l }); }
  let hidden = new Set<string>();
  const vis = (n: MNode) => !hidden.has(n.group);
  const visL = (l: MLink) => vis(byId.get(l.a)!) && vis(byId.get(l.b)!);
  // capítulos numa espiral (a história "anda"), os outros grupos em volta
  const nCh = g.nodes.filter((n) => n.group === "chapter").length;
  const anchor: Record<string, [number, number]> = { book: [0, 0], chapter: [0, 0], character: [-360, -40], place: [360, -120], object: [320, 240], event: [-300, 280] };
  g.nodes.forEach((n, i) => {
    const d = adj.get(n.id)?.length ?? 0;
    n.r = n.group === "book" ? 15 : n.group === "chapter" ? 8 : 4 + Math.min(9, Math.sqrt(d) * 1.6);
    if (n.group === "chapter") { const k = n.chapters[0] ?? i, a = (k / Math.max(1, nCh)) * Math.PI * 2 - Math.PI / 2, R = 120 + nCh * 4; n.x = Math.cos(a) * R; n.y = Math.sin(a) * R; }
    else { const [ax, ay] = anchor[n.group] || [0, 0]; n.x = ax + Math.cos(i * 2.4) * (40 + (i % 6) * 14); n.y = ay + Math.sin(i * 2.4) * (40 + (i % 6) * 14); }
    n.vx = n.vy = 0;
  });
  let W = 0, H = 0, dpr = 1, zoom = 1, ox = 0, oy = 0, alpha = 1, raf = 0, alive = true, dirty = true, userCam = false;
  let hover: MNode | null = null, sel: MNode | null = null, drag: MNode | null = null, moved = false, hl: Set<string> | null = null;
  let cam: { z: number; x: number; y: number; t0: number; from: [number, number, number] } | null = null;
  const t0 = performance.now(), ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const size = () => { dpr = devicePixelRatio || 1; W = host.clientWidth; H = host.clientHeight; cv.width = Math.max(1, W * dpr); cv.height = Math.max(1, H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px"; dirty = true; };
  function tick() {
    const ns = g.nodes.filter(vis);
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
      const a = ns[i], b = ns[j]; let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
      if (!(d2 >= 1)) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
      const f = Math.min(14, (a.r + b.r) * 300 / d2), d = Math.sqrt(d2); dx = dx / d * f; dy = dy / d * f; a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
    }
    for (const l of g.links) {
      if (!visL(l)) continue;
      const a = byId.get(l.a)!, b = byId.get(l.b)!, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const rest = l.kind === "seq" ? 70 : l.kind === "with" ? 120 : 150, k = l.kind === "seq" ? 0.05 : l.kind === "with" ? 0.002 * Math.min(4, l.w) : 0.006;
      const f = (d - rest) * k, fx = dx / d * f, fy = dy / d * f; a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
    for (const n of ns) {
      if (n === drag || n.group === "book") { n.vx = n.vy = 0; if (n.group === "book" && n !== drag) { n.x *= 0.8; n.y *= 0.8; } continue; }
      const [ax, ay] = n.group === "chapter" ? [0, 0] : anchor[n.group] || [0, 0];
      n.vx += (ax - n.x) * 0.003; n.vy += (ay - n.y) * 0.003;
      n.vx *= 0.8; n.vy *= 0.8; n.x += n.vx * alpha; n.y += n.vy * alpha;
    }
  }
  function bounds() { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const n of g.nodes) if (vis(n)) { x0 = Math.min(x0, n.x - n.r); x1 = Math.max(x1, n.x + n.r); y0 = Math.min(y0, n.y - n.r); y1 = Math.max(y1, n.y + n.r); } return { x0, x1, y0, y1 }; }
  function fitAll(instant = false) {
    const b = bounds(); if (W <= 0 || !(b.x1 > b.x0)) return;
    const z = Math.max(0.15, Math.min(1.6, W / (b.x1 - b.x0 + 140), H / (b.y1 - b.y0 + 100)));
    if (instant) { zoom = z; ox = -(b.x0 + b.x1) / 2 * z; oy = -(b.y0 + b.y1) / 2 * z; } else cam = { z, x: -(b.x0 + b.x1) / 2 * z, y: -(b.y0 + b.y1) / 2 * z, t0: performance.now(), from: [zoom, ox, oy] };
    userCam = false; dirty = true;
  }
  function focus(): Set<string> | null {
    if (hl) return hl; const f = hover ?? sel; if (!f) return null;
    const s = new Set([f.id]); for (const { o, l } of adj.get(f.id) ?? []) if (visL(l)) s.add(o); return s;
  }
  function hull(pts: [number, number][]) {
    if (pts.length < 3) return pts; pts = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo: [number, number][] = [], up: [number, number][] = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of [...pts].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function draw(now: number) {
    const T = theme(); Object.assign(color, T.colors);
    const age = now - t0, grow = (n: MNode) => ease((age - (n.group === "book" ? 0 : n.group === "chapter" ? 100 + (n.chapters[0] ?? 0) * 40 : 500)) / 600);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); ctx.translate(W / 2 + ox, H / 2 + oy); ctx.scale(zoom, zoom);
    const fs = focus(), lit = (n: MNode) => !fs || fs.has(n.id);
    for (const [k] of MGROUPS) {
      if (k === "chapter" || hidden.has(k)) continue;
      const h = hull(g.nodes.filter((n) => n.group === k && grow(n) > 0.5).map((n) => [n.x, n.y] as [number, number])); if (h.length < 3) continue;
      ctx.beginPath(); h.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
      ctx.globalAlpha = fs ? 0.03 : T.hull; ctx.lineJoin = "round"; ctx.lineWidth = 44 / Math.max(0.6, zoom); ctx.strokeStyle = ctx.fillStyle = color[k]; ctx.stroke(); ctx.fill();
    }
    const flow = sel ? (now / 40) % 20 : 0;
    for (const l of g.links) {
      if (!visL(l)) continue; const a = byId.get(l.a)!, b = byId.get(l.b)!, gr = Math.min(grow(a), grow(b)); if (gr <= 0) continue;
      const on = fs && fs.has(a.id) && fs.has(b.id), touch = sel && (a === sel || b === sel);
      ctx.globalAlpha = gr * (fs ? (on ? 0.85 : 0.04) : l.kind === "seq" ? 0.7 : l.kind === "with" ? 0.12 + Math.min(0.3, l.w * 0.04) : 0.18);
      ctx.strokeStyle = l.kind === "seq" ? color.chapter : on ? color[(a === (hover ?? sel) ? b : a).group] : T.link;
      ctx.lineWidth = (l.kind === "seq" ? 2.2 : on ? 1.6 : l.kind === "with" ? Math.min(3, 0.6 + l.w * 0.25) : 0.8) / zoom;
      ctx.setLineDash(touch && l.kind !== "seq" ? [10 / zoom, 6 / zoom] : l.kind === "with" && !on ? [2 / zoom, 4 / zoom] : []); ctx.lineDashOffset = touch ? -flow / zoom : 0;
      const dx = b.x - a.x, dy = b.y - a.y, bend = l.kind === "seq" ? 0 : 0.12;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); if (gr >= 1 && bend) ctx.quadraticCurveTo((a.x + b.x) / 2 - dy * bend, (a.y + b.y) / 2 + dx * bend, b.x, b.y); else ctx.lineTo(a.x + dx * gr, a.y + dy * gr); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const n of g.nodes) {
      if (!vis(n)) continue; const gr = grow(n); if (gr <= 0) continue;
      ctx.globalAlpha = lit(n) ? 1 : 0.12;
      const r = (n === hover || n === sel ? n.r + 2.5 : n.r) * (gr < 1 ? 0.3 + gr * 0.7 + Math.sin(gr * Math.PI) * 0.25 : 1);
      if (n === sel) { ctx.beginPath(); ctx.arc(n.x, n.y, r + 6 + Math.sin(now / 300) * 1.5, 0, Math.PI * 2); ctx.strokeStyle = color[n.group]; ctx.lineWidth = 2 / zoom; ctx.stroke(); }
      ctx.fillStyle = color[n.group]; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
      if (n.group === "chapter" || n.group === "book") { ctx.strokeStyle = T.ring; ctx.lineWidth = 2 / zoom; ctx.stroke(); }
      if (n.group === "chapter" && zoom > 0.45) { ctx.fillStyle = T.num; ctx.font = `700 ${8.5}px -apple-system, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String((n.chapters[0] ?? 0) + 1), n.x, n.y + 0.5); }
    }
    const boxes: number[][] = [], fn = hover ?? sel;
    const prio = (n: MNode) => (n === fn ? 0 : fs?.has(n.id) ? 1 : n.group === "book" ? 2 : n.group === "character" ? 3 - Math.min(1, n.chapters.length / 10) : n.group === "chapter" ? 4.5 : 3.9 - Math.min(0.8, n.chapters.length / 10));
    for (const n of [...g.nodes].filter(vis).sort((x, y) => prio(x) - prio(y))) {
      const gr = grow(n); if (gr < 0.6) continue; const p = prio(n);
      if (fs && !fs.has(n.id) && p > 2) continue; if (!fs && zoom < 0.6 && p > 4) continue;
      const fz = (n.group === "book" ? 13.5 : p <= 1 ? 12.5 : 11) / Math.max(0.7, Math.min(1.4, zoom));
      ctx.font = `${p <= 2 ? 650 : 500} ${fz}px -apple-system, BlinkMacSystemFont, sans-serif`;
      const label = n.label.length > 34 ? n.label.slice(0, 33) + "…" : n.label, w = ctx.measureText(label).width, x0 = n.x - w / 2 - 3, y0 = n.y + n.r + 3, box = [x0, y0, x0 + w + 6, y0 + fz + 4];
      if (p > 1 && boxes.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) continue; boxes.push(box);
      ctx.globalAlpha = (lit(n) ? 1 : 0.25) * ease((gr - 0.6) / 0.4);
      if (p <= 1) { ctx.fillStyle = T.box; ctx.globalAlpha *= 0.85; ctx.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]); ctx.globalAlpha /= 0.85; }
      ctx.fillStyle = p <= 1 ? T.boxText : p <= 3 ? T.label : T.label2; ctx.textAlign = "center"; ctx.textBaseline = "top"; if (p > 1) { ctx.strokeStyle = T.halo; ctx.lineWidth = 3 / zoom; ctx.lineJoin = "round"; ctx.strokeText(label, n.x, y0 + 1); } ctx.fillText(label, n.x, y0 + 1);
    }
    ctx.globalAlpha = 1;
  }
  function loop(now: number) {
    if (!alive) return;
    if (alpha > 0.015 || drag) { tick(); if (!drag) alpha *= 0.982; if (!userCam && !drag && !cam) { const b = bounds(); if (b.x1 > b.x0 && W > 0) { const z = Math.max(0.15, Math.min(1.6, W / (b.x1 - b.x0 + 140), H / (b.y1 - b.y0 + 100))); zoom += (z - zoom) * 0.08; ox += (-(b.x0 + b.x1) / 2 * zoom - ox) * 0.08; oy += (-(b.y0 + b.y1) / 2 * zoom - oy) * 0.08; } } dirty = true; if (alpha <= 0.015 && !userCam) fitAll(); }
    if (cam) { const k = ease((now - cam.t0) / 480); zoom = cam.from[0] + (cam.z - cam.from[0]) * k; ox = cam.from[1] + (cam.x - cam.from[1]) * k; oy = cam.from[2] + (cam.y - cam.from[2]) * k; if (k >= 1) cam = null; dirty = true; }
    if (now - t0 < 2200 || sel) dirty = true;
    if (dirty) { draw(now); dirty = false; }
    raf = requestAnimationFrame(loop);
  }
  const at = (ev: MouseEvent) => {
    const r = cv.getBoundingClientRect(), x = (ev.clientX - r.left - W / 2 - ox) / zoom, y = (ev.clientY - r.top - H / 2 - oy) / zoom;
    let best: MNode | null = null, bd = 1e9; for (const n of g.nodes) { if (!vis(n)) continue; const d = Math.hypot(n.x - x, n.y - y) - n.r; if (d < 8 / zoom && d < bd) { best = n; bd = d; } }
    return { x, y, n: best };
  };
  const flyTo = (n: MNode) => { const z = Math.max(zoom, 1.2); userCam = true; cam = { z, x: -n.x * z, y: -n.y * z, t0: performance.now(), from: [zoom, ox, oy] }; };
  let pan: { x: number; y: number } | null = null;
  cv.addEventListener("pointerdown", (ev) => { const p = at(ev); moved = false; cv.setPointerCapture(ev.pointerId); if (p.n) drag = p.n; else pan = { x: ev.clientX - ox, y: ev.clientY - oy }; });
  cv.addEventListener("pointermove", (ev) => {
    const p = at(ev);
    if (drag) { if (Math.hypot(p.x - drag.x, p.y - drag.y) > 2) { moved = true; alpha = Math.max(alpha, 0.25); } drag.x = p.x; drag.y = p.y; dirty = true; return; }
    if (pan) { ox = ev.clientX - pan.x; oy = ev.clientY - pan.y; userCam = true; moved = true; dirty = true; return; }
    if (p.n !== hover) { hover = p.n; dirty = true; }
    cv.style.cursor = p.n ? "pointer" : "grab";
    if (p.n) { const gname = tr(MGROUPS.find((x) => x[0] === p.n!.group)?.[1] || "Livro"); tip.textContent = `${p.n.label} · ${gname}${p.n.group !== "chapter" && p.n.group !== "book" ? ` · ${p.n.chapters.length} ${isEn() ? "ch." : "cap."}` : ""}`; const r = cv.getBoundingClientRect(); tip.style.left = `${Math.min(ev.clientX - r.left + 12, W - 240)}px`; tip.style.top = `${ev.clientY - r.top + 14}px`; tip.classList.add("on"); } else tip.classList.remove("on");
  });
  cv.addEventListener("pointerup", (ev) => { const p = at(ev); if (!moved) select(p.n?.id ?? null, false); drag = null; pan = null; });
  cv.addEventListener("pointerleave", () => { hover = null; tip.classList.remove("on"); dirty = true; });
  cv.addEventListener("wheel", (ev) => {
    ev.preventDefault(); const r = cv.getBoundingClientRect(), mx = ev.clientX - r.left - W / 2, my = ev.clientY - r.top - H / 2;
    const dy = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY, nz = Math.max(0.15, Math.min(3, zoom * Math.exp(-Math.max(-120, Math.min(120, dy)) * (ev.ctrlKey ? 0.01 : 0.0022))));
    ox = mx - (mx - ox) * nz / zoom; oy = my - (my - oy) * nz / zoom; zoom = nz; userCam = true; cam = null; dirty = true;
  }, { passive: false });
  host.querySelector(".gr-zoom")!.addEventListener("click", (ev) => { const b = (ev.target as HTMLElement).closest<HTMLElement>("[data-gz]"); if (!b) return; const k = +b.dataset.gz!; if (!k) return fitAll(); const nz = Math.max(0.15, Math.min(3, zoom * (k > 0 ? 1.25 : 0.8))); cam = { z: nz, x: ox * nz / zoom, y: oy * nz / zoom, t0: performance.now(), from: [zoom, ox, oy] }; userCam = true; });
  function select(id: string | null, fly = true) { sel = id ? byId.get(id) ?? null : null; hl = null; dirty = true; if (sel && fly) flyTo(sel); onSelect(sel); }
  const ro = new ResizeObserver(size); ro.observe(host); size();
  raf = requestAnimationFrame(loop);
  return {
    stop() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); },
    select,
    search(q) { const k = norm(q); if (!k) return null; const n = g.nodes.find((x) => vis(x) && norm(x.label).includes(k)) ?? g.nodes.find((x) => vis(x) && norm(x.note || "").includes(k)) ?? null; if (n) select(n.id); return n; },
    setHidden(h) { hidden = h; alpha = Math.max(alpha, 0.3); fitAll(); },
    fit: () => fitAll(),
  };
}
