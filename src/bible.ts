// "Bíblia do autor": compila personagens, estrutura dos livros e técnicas narrativas a partir do acervo,
// e faz busca (BM25) de trechos parecidos para dar exemplos reais de estilo à IA.
import { splitChapters, type Profile } from "./style";

export interface Character { name: string; count: number; books: string[]; facts: string[]; links: [string, number][]; first: string; summary?: string }
export interface ChapterInfo { book: string; title: string; words: number; pov: string; summary: string; opening: string; ending: string; hook: boolean; aiSummary?: string }
export interface Bible { characters: Character[]; chapters: ChapterInfo[]; techniques: string[]; techniquesEn?: string[]; updated: number }

const sentences = (t: string) => t.replace(/\s+/g, " ").match(/[^.!?…]+[.!?…]+["”’]?/g) || [];
const DESC = /\b(was a|was an|is a|had (long|short|black|brown|blonde|dark|bright|green|blue|hazel)|eyes|hair|wore|years? old|girlfriend|boyfriend|wife|husband|mother|father|sister|brother|best friend|tall|short|beautiful|handsome|skinny|worked as|job|student|lecturer|doctor|police)\b/i;

export function compileBible(books: { title: string; text: string }[], profile: Profile): Bible {
  const names = profile.names.slice(0, 24).map((n) => n[0]);
  const chars: Character[] = names.map((name) => ({ name, count: 0, books: [], facts: [], links: [], first: "" }));
  const co = new Map<string, Map<string, number>>();
  const chapters: ChapterInfo[] = [];
  for (const b of books) {
    for (const ch of splitChapters(b.text)) {
      if (ch.title === "Opening") continue;
      const ss = sentences(ch.text);
      const counts = names.map((n) => (ch.text.match(new RegExp(`\\b${n}\\b`, "g")) || []).length);
      const present = names.filter((_, i) => counts[i] > 0);
      for (const a of present) for (const c of present) if (a !== c) { const m = co.get(a) || new Map(); m.set(c, (m.get(c) || 0) + 1); co.set(a, m); }
      for (const s of ss) {
        for (const c of chars) {
          if (!s.includes(c.name)) continue;
          if (!c.first) c.first = s.trim();
          if (c.facts.length < 8 && DESC.test(s) && s.length < 260 && !c.facts.includes(s.trim())) c.facts.push(s.trim());
        }
      }
      chars.forEach((c, i) => { c.count += counts[i]; if (counts[i] && !c.books.includes(b.title)) c.books.push(b.title); });
      // resumo extrativo: frases com mais palavras-chave do capítulo
      const freq = new Map<string, number>();
      for (const w of ch.text.toLowerCase().match(/[a-z’']{4,}/g) || []) freq.set(w, (freq.get(w) || 0) + 1);
      const score = (s: string) => (s.toLowerCase().match(/[a-z’']{4,}/g) || []).reduce((n, w) => n + Math.log(1 + (freq.get(w) || 0)), 0) / Math.sqrt(s.length + 20);
      const best = ss.map((s, i) => ({ s: s.trim(), i, v: score(s) })).filter((x) => x.s.length > 40 && x.s.length < 300).sort((a, b) => b.v - a.v).slice(0, 3).sort((a, b) => a.i - b.i);
      const paras = ch.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      const last = paras[paras.length - 1] || "";
      const pov = names[counts.indexOf(Math.max(...counts))] || "";
      chapters.push({
        book: b.title, title: ch.title, words: ch.text.split(/\s+/).length, pov,
        summary: best.map((x) => x.s).join(" "), opening: (ss[0] || "").trim(), ending: last.slice(-240),
        hook: /[?!…]["”]?$/.test(last) || last.split(/\s+/).length < 14,
      });
    }
  }
  for (const c of chars) c.links = [...(co.get(c.name) || new Map())].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const n = chapters.length || 1;
  const dlgOpen = chapters.filter((c) => /^[“"]/.test(c.opening)).length;
  const thoughtOpen = chapters.filter((c) => /\bthought\b/.test(c.opening)).length;
  const hooks = chapters.filter((c) => c.hook).length;
  const all = books.map((b) => b.text).join("\n");
  const thoughts = (all.match(/,?\s(she|he|I) thought\b/gi) || []).length;
  const breaks = (all.match(/^\s*(\*\s*){3}\s*$/gm) || []).length;
  const techniques = [
    `${Math.round((dlgOpen / n) * 100)}% dos capítulos abrem com diálogo; ${Math.round((thoughtOpen / n) * 100)}% abrem com um pensamento do personagem.`,
    `${Math.round((hooks / n) * 100)}% dos capítulos terminam com gancho (pergunta, exclamação ou frase curta de impacto).`,
    `Pensamentos diretos dos personagens (“…, she thought”): ${thoughts} vezes — revelam o que eles nunca diriam em voz alta.`,
    `Quebras de cena (***) dentro dos capítulos: ${breaks}. Capítulos alternam o foco entre personagens (POV variado).`,
    `Muitos personagens com relações entrelaçadas (amizade, romance, ciúme) construídas antes do perigo; ninguém está a salvo.`,
  ];
  const pc = (x: number) => Math.round((x / n) * 100);
  const techniquesEn = [
    `${pc(dlgOpen)}% of chapters open with dialogue; ${pc(thoughtOpen)}% open with a character's thought.`,
    `${pc(hooks)}% of chapters end on a hook (question, exclamation or a short punchy line).`,
    `Direct character thoughts (“…, she thought”): ${thoughts} times — revealing what they would never say aloud.`,
    `Scene breaks (***) inside chapters: ${breaks}. Chapters shift focus between characters (varied POV).`,
    `Many characters with intertwined relationships (friendship, romance, jealousy) built before the danger; nobody is safe.`,
  ];
  return { characters: chars.filter((c) => c.count > 0), chapters, techniques, techniquesEn, updated: Date.now() };
}

// ---------- busca de trechos (BM25) ----------
interface Chunk { src: string; text: string; tf: Map<string, number>; len: number }
let index: { chunks: Chunk[]; df: Map<string, number>; avg: number; key: string } | null = null;
const toks = (t: string) => t.toLowerCase().match(/[a-zà-ÿ’']{3,}/g) || [];

export function buildIndex(sources: { title: string; text: string }[]) {
  const key = sources.map((s) => s.title + s.text.length).join("|");
  if (index?.key === key) return;
  const chunks: Chunk[] = [];
  for (const s of sources) {
    const paras = s.text.split(/\n{2,}/);
    let buf = "";
    for (const p of paras) {
      buf += p + "\n\n";
      if (buf.split(/\s+/).length > 220) { chunks.push(mk(s.title, buf)); buf = ""; }
    }
    if (buf.trim()) chunks.push(mk(s.title, buf));
  }
  const df = new Map<string, number>();
  for (const c of chunks) for (const w of c.tf.keys()) df.set(w, (df.get(w) || 0) + 1);
  index = { chunks, df, avg: chunks.reduce((n, c) => n + c.len, 0) / (chunks.length || 1), key };
}
function mk(src: string, text: string): Chunk {
  const tf = new Map<string, number>();
  const t = toks(text);
  for (const w of t) tf.set(w, (tf.get(w) || 0) + 1);
  return { src, text: text.trim(), tf, len: t.length };
}

/** Trechos mais parecidos com a consulta (variando de livro). */
export function retrieve(query: string, k = 3, maxChars = 1400): { src: string; text: string }[] {
  if (!index) return [];
  const q = [...new Set(toks(query))];
  const N = index.chunks.length;
  const scored = index.chunks.map((c) => {
    let s = 0;
    for (const w of q) {
      const f = c.tf.get(w); if (!f) continue;
      const idf = Math.log(1 + (N - (index!.df.get(w) || 0) + 0.5) / ((index!.df.get(w) || 0) + 0.5));
      s += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * c.len / index!.avg));
    }
    const dlg = (c.text.match(/[“"]/g) || []).length > 4 ? 0.5 : 0; // prefere trechos com diálogo e narração
    return { c, s: s + dlg };
  }).sort((a, b) => b.s - a.s);
  const out: { src: string; text: string }[] = [];
  const per = new Map<string, number>();
  for (const { c } of scored) {
    if ((per.get(c.src) || 0) >= Math.ceil(k / 2)) continue;
    per.set(c.src, (per.get(c.src) || 0) + 1);
    out.push({ src: c.src, text: c.text.slice(0, maxChars) });
    if (out.length >= k) break;
  }
  return out;
}

/** Texto compacto da bíblia para o prompt (cabe no contexto de um modelo local). */
export function bibleText(b: Bible | null, focus: string, maxChars = 3500): string {
  if (!b) return "";
  const f = focus.toLowerCase();
  const score = (c: Character) => (f.includes(c.name.toLowerCase()) ? 1e6 : 0) + c.count;
  const chars = [...b.characters].sort((a, c) => score(c) - score(a));
  const sheet = chars.slice(0, 8).map((c) => `- ${c.name} (${c.books.join(", ")}): ${c.summary || c.facts.slice(0, 2).join(" ")} Relações: ${c.links.map((l) => l[0]).join(", ")}`).join("\n");
  return `## Narrative techniques of the author\n${(b.techniquesEn || b.techniques).map((t) => "- " + t).join("\n")}\n\n## Characters from previous books (reference only — create NEW characters unless asked)\n${sheet}`.slice(0, maxChars);
}
