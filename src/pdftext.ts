// Converte o texto de um PDF de livro (itens do pdf.js) em texto corrido com parágrafos e capítulos.
// Usa a geometria da página: recuo de parágrafo, tamanho da fonte (títulos e letra capitular),
// cabeçalhos/rodapés repetidos e números de página. Sem DOM: roda no app e em testes no Node.

export interface PItem { str: string; x: number; y: number; w: number; size: number }
interface Line { text: string; x: number; y: number; size: number; right: number; page: number }

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] || 0; };
const HEAD_RE = /^(chapter|cap[ií]tulo|part|parte|prologue|epilogue|pr[oó]logo|ep[ií]logo|interlude)\b/i;

export function pdfItem(it: any): PItem | null {
  if (typeof it.str !== "string") return null;
  const t = it.transform || [1, 0, 0, 1, 0, 0];
  return { str: it.str, x: t[4], y: t[5], w: it.width || 0, size: Math.hypot(t[2], t[3]) || it.height || 0 };
}

function linesOf(items: PItem[], page: number): Line[] {
  const lines: Line[] = [];
  let cur: Line | null = null;
  for (const it of items) {
    if (!it.str) continue;
    const blank = !it.str.trim();
    if (cur && !blank && Math.abs(it.y - cur.y) > Math.max(2, Math.min(cur.size, it.size) * 0.45)) { lines.push(cur); cur = null; }
    if (!cur) { if (blank) continue; cur = { text: "", x: it.x, y: it.y, size: it.size, right: it.x, page }; }
    const gap = it.x - cur.right;
    if (cur.text && !blank && gap > it.size * 0.12 && !/\s$/.test(cur.text) && !/^\s/.test(it.str)) cur.text += " ";
    cur.text += it.str;
    if (!blank) cur.size = Math.max(cur.size, it.size);
    cur.right = Math.max(cur.right, it.x + it.w);
    cur.x = Math.min(cur.x, it.x);
  }
  if (cur) lines.push(cur);
  return lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, " ").trim() })).filter((l) => l.text);
}

export function pdfToText(pages: PItem[][]): string {
  const pl = pages.map((p, i) => linesOf(p, i));
  // cabeçalhos/rodapés: linhas curtas que se repetem em muitas páginas (ignorando números)
  const key = (t: string) => t.replace(/\d+/g, "#").toLowerCase();
  const freq = new Map<string, number>();
  for (const p of pl) for (const k of new Set(p.filter((l) => l.text.length < 60).map((l) => key(l.text)))) freq.set(k, (freq.get(k) || 0) + 1);
  const rep = new Set([...freq].filter(([, n]) => n > Math.max(3, pages.length * 0.12)).map(([k]) => k));
  // camada de texto duplicada (PDFs de gráfica): a mesma linha aparece de novo pouco depois → fica só a primeira
  const seen = new Map<string, number>();
  const all = pl.flat().filter((l, i) => {
    if (/^[\divxlc]{1,5}$/i.test(l.text) || rep.has(key(l.text))) return false;
    const k = l.text.toLowerCase().replace(/[^a-z0-9à-ÿ]/g, "");
    if (k.length < 18) return true;
    const last = seen.get(k);
    seen.set(k, i);
    return last === undefined || i - last > 600;
  });
  const body = median(all.filter((l) => l.text.length > 30).map((l) => l.size)) || 11;
  const bodyLines = all.filter((l) => Math.abs(l.size - body) < body * 0.15);
  // margem esquerda e largura típicas por página (páginas pares/ímpares têm margens diferentes)
  const left = new Map<number, number>(), right = new Map<number, number>();
  for (const [pg, ls] of groupBy(bodyLines, (l) => l.page)) {
    left.set(pg, median(ls.map((l) => l.x).sort((a, b) => a - b).slice(0, Math.max(1, Math.ceil(ls.length * 0.6)))));
    right.set(pg, Math.max(...ls.map((l) => l.right)));
  }
  const paras: string[] = [];
  let buf = "";
  let prev: Line | null = null;
  let chapterN = 0;
  let pendingCap = "";
  const push = () => { if (buf.trim()) paras.push(buf.trim()); buf = ""; };
  for (const l of all) {
    const big = l.size > body * 1.35;
    // letra capitular: uma letra enorme sozinha → início de capítulo
    if (big && /^[“"‘']?[A-Za-z]$/.test(l.text)) {
      push();
      if (!HEAD_RE.test(paras[paras.length - 1] || "") && !/^#/.test(paras[paras.length - 1] || "")) paras.push(`Chapter ${++chapterN}`);
      else if (/^chapter/i.test(paras[paras.length - 1] || "")) chapterN++;
      pendingCap = l.text; prev = null; continue;
    }
    if (big && l.text.length < 60) { // título
      push();
      const h = l.text.replace(/\s+/g, " ");
      if (HEAD_RE.test(h) || /^\d{1,3}$/.test(h)) { paras.push(/^\d/.test(h) ? `Chapter ${h}` : h.charAt(0) + h.slice(1).toLowerCase()); if (/^chapter/i.test(h)) chapterN++; }
      else paras.push(h);
      prev = null; continue;
    }
    const lx = left.get(l.page) ?? l.x, rx = right.get(l.page) ?? l.right;
    const indented = l.x > lx + body * 0.8;
    const prevShort = prev ? prev.right < (right.get(prev.page) ?? prev.right) - body * 2.5 : false;
    const centered = l.x > lx + (rx - lx) * 0.2 && l.right < rx - (rx - lx) * 0.2;
    if (pendingCap) { push(); buf = pendingCap + l.text; pendingCap = ""; prev = l; continue; }
    if (!prev || indented || prevShort || centered || /^(\*\s*){3}$/.test(l.text)) push();
    if (buf && buf.endsWith("-") && /^[a-z]/.test(l.text)) buf = buf.slice(0, -1) + l.text;
    else buf += (buf ? " " : "") + l.text;
    if (centered || /^(\*\s*){3}$/.test(l.text)) { push(); prev = null; } else prev = l;
  }
  push();
  // camada de texto duplicada (alguns PDFs de gráfica): tira parágrafos repetidos próximos
  const recent: string[] = [];
  const out = paras.filter((p) => { const k = p.replace(/\s+/g, ""); if (k.length > 25 && recent.includes(k)) return false; recent.push(k); if (recent.length > 80) recent.shift(); return true; });
  // renumera "Chapter N" ignorando aberturas curtas (dedicatória, sinopse da contracapa)
  const words = (i: number) => { let n = 0; for (let j = i + 1; j < out.length && !/^Chapter \d+$/.test(out[j]) && !HEAD_RE.test(out[j]); j++) n += out[j].split(/\s+/).length; return n; };
  let num = 0;
  const final = out.flatMap((p, i) => /^Chapter \d+$/.test(p) ? (words(i) < 400 ? [] : [`Chapter ${++num}`]) : [p]);
  return final.join("\n\n").replace(/\n\n\*\s*\*\s*\*\n\n/g, "\n\n***\n\n");
}

function groupBy<T, K>(a: T[], f: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of a) { const k = f(x); const l = m.get(k); if (l) l.push(x); else m.set(k, [x]); }
  return m;
}
