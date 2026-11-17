import { setLang, tr, locale, isEn } from "./i18n";
import { ic } from "./icons";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { marked } from "marked";
import { extractAny, findAuthorInfo, openPdf, renderThumb } from "./extract";
import { analyze, checkStyle, describe, kdpOffline, outline, sceneScaffold, splitChapters, type Profile } from "./style";
import { cancelAI, localSystem, QUICK, runAI, systemPrompt, type Mode, type Msg } from "./ai";
import { bibleText, buildIndex, compileBible, retrieve, type Bible } from "./bible";
import { listen } from "@tauri-apps/api/event";
import { ARCH, archDefaults, archText, CRAFT_RULES, craftCheck } from "./craft";
import { makePdf } from "./pdf";
import { mountMap, graphFromLedger, graphQuick, parseJson, parseBlocks, MGROUPS, type MapCtl, type MGroup, type MNode, type ChapLedger, type BookAnalysis, type Finding } from "./storymap";
import { drawWrap, kdpDims, TRIMS, BLEED, type WrapDesign } from "./wrap";

// ---------- estado ----------
interface Item { id: string; title: string; kind: "livro" | "capa" | "notas" | "outro" | "referencia"; ext: string; path: string; size: number; pages: number; words: number; thumb?: string; html?: string; added: number; bookId?: string; front?: string; cover?: string; ratio?: number; thumbFit?: "front" | "full"; thumbPos?: number; preview?: string }
interface Chapter { id: string; title: string; plan?: string; html: string; done?: boolean }
interface Act { id: string; icon: string; title: string; detail: string; state: "run" | "done" | "err"; live: string; t: number; ai?: string }
interface Cast { id: string; name: string; role: string; age: string; appearance: string; personality: string; arc: string; links: string; gender?: string; height?: string; build?: string; occupation?: string; mbti?: string; mbtiWhy?: string; goal?: string; fear?: string; speech?: string }
interface World { id: string; kind: string; name: string; desc: string; details: string; links: string }
interface BookStyle { base: "author" | "refs" | "both"; books: string[] | null; refs: string[] | null; genres: string; tone: string; pov: string; tense: string; audience: string; comps: string; notes: string; coverStyle: string; coverRef: "author" | "free" }
interface Project { coverPrompt?: string; style?: BookStyle; outlineAI?: number; arch?: Record<string, string>; world?: World[]; wrap?: WrapDesign; wrapArt?: string; wrapFinal?: string; coverFull?: string; textsAI?: boolean; backArt?: string; coverV?: number; arts?: { path: string; kind: string; at: number; prompt?: string }[]; status?: "approved" | "rejected"; trashed?: number; ebookCover?: string; cast?: Cast[]; id: string; title: string; subtitle: string; premise: string; genre: string; names: string; nChapters: number; pages?: number; chapters: Chapter[]; chat: Msg[]; cover?: string; kdp: { description: string; keywords: string[]; categories: string[]; series: string; price: string; lang: string }; updated: number }

const S = {
  lib: [] as Item[], author: {} as any, profile: null as Profile | null, projects: [] as Project[],
  settings: { mode: "offline" as Mode, useRefs: false, models: { claude: "", openai: "", gemini: "", local: "" }, img: { provider: "openai", model: "" }, readPos: {} as Record<string, number>, readFont: 19, readTheme: "sepia" } as any,
  view: "acervo", openId: "", readTab: "texto", projId: "", chap: 0, busy: "", aiText: "", aiProj: "", imgPicker: false, styleTab: "", cfgTab: "", models: { openai: [] as string[], gemini: [] as string[] },
  claude: null as any, keys: {} as any, check: null as any,
  bible: null as Bible | null, local: { models: [] as any[], ram: 0 }, dl: {} as Record<string, { done: number; total: number }>, picker: false, aiStatus: "", writing: "", ptab: "write", stopGen: false, pipe: "", castOpen: "", worldOpen: "", libInfo: false, mapId: "", mapTab: "resumo", anChap: -1, elGroup: "", anRun: "", imgLocal: { ok: false, total: 0, got: 0, dl: false, err: "" } as any, imgHow: false, trashView: false, artsOpen: false, artDlg: null as any, kdpEdit: null as any, mapHidden: [] as string[], mapSel: null as MNode | null, elAll: {} as Record<string, boolean>, mapAll: false, analysis: {} as Record<string, BookAnalysis>, keyInfo: false, planAll: false, notesAll: false, secs: {} as Record<string, boolean>, chOpen: "" as string | undefined, edit: null as null | { kind: string; id: string; draft: any; dirty: boolean; isNew?: boolean }, usage: { lastAt: 0, inTok: 0, outTok: 0, calls: 0 } as any, chview: "lista", acts: [] as Act[],
};
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const uid = () => Math.random().toString(36).slice(2, 10);
const words = (t: string) => (t.match(/\S+/g) || []).length;
/** HTML do capítulo → texto com parágrafos (para continuar de onde parou). */
const htmlText = (h: string) => strip(h.replace(/<hr\s*\/?>/gi, "\n\n***\n\n").replace(/<\/p>|<br\s*\/?>/gi, "$&\n\n")).replace(/\n{3,}/g, "\n\n").trim();
const scrollPaper = () => { const w = $("#paperwrap"); if (w) w.scrollTop = w.scrollHeight; };
const strip = (h: string) => { const d = document.createElement("div"); d.innerHTML = h; return d.innerText; };
const save_ = (k: string, v: any) => invoke("store_set", { key: k, value: v });
const toast = (m: string, bad = false) => { const t = document.createElement("div"); t.className = "toast" + (bad ? " bad" : ""); t.textContent = m; $("#toasts").appendChild(t); setTimeout(() => t.remove(), 4200); };
const proj = () => S.projects.find((p) => p.id === S.projId && !p.trashed);
/** Livros do Estúdio fora da lixeira / que podem ser lidos (não rejeitados) / aprovados para o Acervo. */
const liveProjs = () => S.projects.filter((x) => !x.trashed);
const readProjs = () => liveProjs().filter((x) => x.status !== "rejected");
const statusTag = (x: Project) => x.status === "approved" ? `<span class="stag ok">${ic("check", 11)} ${L("No Acervo", "In Library")}</span>` : x.status === "rejected" ? `<span class="stag bad">${ic("x", 11)} ${L("Rejeitado", "Rejected")}</span>` : `<span class="stag">${L("Rascunho", "Draft")}</span>`;
let saveT: any;
const saveProjects = () => { clearTimeout(saveT); saveT = setTimeout(() => save_("projects", S.projects), 400); };
const corpusCache = new Map<string, string>();
async function textOf(id: string) { if (!corpusCache.has(id)) corpusCache.set(id, await invoke<string>("text_get", { id })); return corpusCache.get(id)!; }
async function corpus() { return (await Promise.all(S.lib.filter((i) => i.kind === "livro").map((i) => textOf(i.id)))).join("\n\n"); }

// ---------- importação ----------
function guessTitle(name: string) {
  const parts = name.replace(/[_]+/g, " ").split(/\s+/);
  const stop = /\d|^(draft2digital|hardcover|paperback|kdp|original|interior|layout|final|isbn|page\d*|cover|ebook)$/i;
  const out: string[] = [];
  for (const p of parts) { if (stop.test(p)) break; out.push(p); }
  return (out.join(" ") || name).trim();
}

async function importPaths(paths: string[], bookId?: string, force?: Item["kind"]) {
  for (const src of paths) {
    S.busy = `Importando ${src.split(/[\\/]/).pop()}…`; render();
    try {
      const f = await invoke<any>("import_file", { src });
      const ex = await extractAny(f.path, f.ext, (p) => { S.busy = `Lendo ${f.name}… ${Math.round(p * 100)}%`; const b = $("#busy"); if (b) b.textContent = S.busy; });
      const w = words(ex.text);
      let kind: Item["kind"] = force ? force : bookId ? "capa" : ["png", "jpg", "jpeg", "webp"].includes(f.ext) ? "capa" : ex.pages <= 2 && f.ext === "pdf" ? "capa" : f.ext === "docx" && w < 20000 ? "notas" : w > 15000 ? "livro" : "outro";
      let thumb = ex.thumb;
      if (thumb?.startsWith("data:")) thumb = convertFileSrc(await invoke<string>("save_b64", { name: `${f.id}.png`, b64: thumb }));
      if (ex.text) await invoke("text_set", { id: f.id, text: ex.text });
      corpusCache.set(f.id, ex.text);
      const title = guessTitle(f.name);
      // capa e livro com o mesmo título: o livro usa a capa como miniatura
      const item: Item = { bookId, id: f.id, title: bookId ? S.lib.find((b) => b.id === bookId)?.title || title : title, kind, ext: f.ext, path: f.path, size: f.size, pages: ex.pages, words: w, thumb, html: undefined, added: Date.now() };
      if (ex.html) await invoke("text_set", { id: f.id + "-html", text: ex.html });
      if (!item.thumb && ex.text) item.preview = ex.text.slice(0, 600);
      S.lib.push(item);
      if (kind === "notas") {
        S.author.notes = ((S.author.notes || "") + "\n\n" + ex.text).trim();
      }
      if (kind === "livro") {
        const info = findAuthorInfo(ex.text);
        S.author.name ||= info.name; S.author.email ||= info.email; S.author.site ||= info.site;
        S.author.books = [...new Set([...(S.author.books || []), title])];
      }
      toast(`“${title}” adicionado (${kind})`);
    } catch (e: any) { toast(`Erro: ${e?.message || e}`, true); }
  }
  linkCovers();
  await save_("library", S.lib); await save_("author", S.author);
  if (S.lib.some((i) => i.kind === "livro")) await runAnalysis(true);
  S.busy = ""; render();
}

function linkCovers() {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z]/g, "");
  const books = S.lib.filter((i) => i.kind === "livro");
  for (const c of S.lib.filter((i) => i.kind === "capa")) {
    if (c.bookId && !books.some((b) => b.id === c.bookId)) c.bookId = undefined;
    if (!c.bookId) c.bookId = books.find((b) => norm(b.title) === norm(c.title))?.id;
  }
  for (const b of books) b.cover = coverOf(b)?.thumb;
}
const coverOf = (b: Item) => S.lib.filter((i) => i.kind === "capa" && i.bookId === b.id).pop();

/** Como a miniatura mostra a capa: capa completa (verso+lombada+frente) mostra a frente; dá para ajustar. */
function thumbStyle(c: Item) {
  const wrap = (c.ratio || 0.66) > 1.05;
  const fit = c.thumbFit || (wrap ? "front" : "full");
  return fit === "front" ? `object-fit:cover;object-position:${c.thumbPos ?? (wrap ? 100 : 50)}% 50%` : "object-fit:contain";
}
function thumbRatios() {
  document.querySelectorAll<HTMLImageElement>("img[data-ratio-of]").forEach((img) => {
    const it = S.lib.find((x) => x.id === img.dataset.ratioOf);
    if (!it || it.ratio) return;
    const set = () => { if (!img.naturalWidth) return; it.ratio = img.naturalWidth / img.naturalHeight; img.setAttribute("style", thumbStyle(it)); save_("library", S.lib); };
    if (img.complete) set(); else img.onload = set;
  });
};

/** Imagem da capa inteira, sem cortes (PDF renderizado na resolução pedida). */
async function coverImage(c: Item, width: number): Promise<string> {
  if (c.ext !== "pdf") return convertFileSrc(c.path);
  return renderThumb(await openPdf(c.path), width);
}

function coverModal(c: Item) {
  const book = S.lib.find((b) => b.id === c.bookId);
  const m = document.createElement("div");
  m.className = "overlay"; m.id = "overlay";
  m.innerHTML = `<div class="picker coverview"><div class="phead"><div><h2>Capa · ${esc(book?.title || c.title)}</h2><p class="muted">${c.ext.toUpperCase()} original · ${(c.size / 1e6).toFixed(1).replace(".", ",")} MB${c.pages ? "" : ""}</p></div><button class="icon" data-act="overlay-x">${ic("x")}</button></div>
    <div class="cvwrap"><div class="cvimg"><div class="loading">Carregando em alta resolução…</div></div>
    <div class="cvside"><h3>Miniatura no acervo</h3><div class="thumb livro mini-prev"><img src="${esc(c.thumb || "")}" style="${thumbStyle(c)}" id="tprev"></div>
      <div class="seg"><button class="${(c.thumbFit || ((c.ratio || 0) > 1.05 ? "front" : "full")) === "front" ? "on" : ""}" data-act="thumb-fit" data-v="front" data-id="${c.id}">Frente</button><button class="${(c.thumbFit || ((c.ratio || 0) > 1.05 ? "front" : "full")) === "full" ? "on" : ""}" data-act="thumb-fit" data-v="full" data-id="${c.id}">Capa inteira</button></div>
      <label class="fld"><span>Posição (arraste para centralizar a frente)</span><input type="range" min="0" max="100" value="${c.thumbPos ?? ((c.ratio || 0) > 1.05 ? 100 : 50)}" data-thumb-pos="${c.id}"></label>
      <p class="muted">${(c.ratio || 0) > 1.05 ? "Detectado: capa completa (verso, lombada e frente)." : "Detectado: só a frente."}</p></div></div>
    <div class="row"><button class="btn primary" data-act="cover-png" data-id="${c.id}">${ic("download")} Exportar PNG (alta resolução)</button><button class="btn" data-act="cover-orig" data-id="${c.id}">${ic("download")} Exportar arquivo original (.${c.ext})</button>${book ? `<button class="btn" data-act="cover-for" data-id="${book.id}">Trocar capa</button>` : ""}</div></div>`;
  document.body.appendChild(m);
  coverImage(c, 2400).then((src) => { const box = m.querySelector(".cvimg"); if (box) box.innerHTML = `<img src="${src}">`; });
}

/** Recorte da capa da frente (as capas da KDP vêm com verso + lombada + frente). */
async function frontOf(c: Item): Promise<string> {
  if (c.front) return c.front;
  if (c.ext !== "pdf") return (c.front = c.path);
  const doc = await openPdf(c.path);
  const img = new Image();
  img.src = await renderThumb(doc, 2600);
  await img.decode();
  const { width: w, height: h } = img;
  const fw = Math.min(w, Math.round(h * 0.64));
  const cv = document.createElement("canvas");
  cv.width = fw; cv.height = h;
  cv.getContext("2d")!.drawImage(img, w - fw - (w > h ? Math.round(w * 0.012) : 0), 0, fw, h, 0, 0, fw, h);
  c.front = await invoke<string>("save_b64", { name: `front-${c.id}.png`, b64: cv.toDataURL("image/png") });
  await save_("library", S.lib);
  return c.front;
}

async function runAnalysis(silent = false) {
  const books = S.lib.filter((i) => i.kind === "livro");
  if (!books.length) return toast("Adicione pelo menos um livro ao acervo", true);
  S.busy = "Analisando o estilo do autor…"; render();
  await new Promise((r) => setTimeout(r, 30));
  S.profile = analyze(await Promise.all(books.map(async (b) => ({ title: b.title, text: await textOf(b.id) }))), [S.author.name || "", S.author.pen || ""]);
  await save_("profile", S.profile);
  S.busy = "Compilando a bíblia do autor (personagens, estrutura, técnicas)…"; render();
  await new Promise((r) => setTimeout(r, 30));
  S.bible = compileBible(await Promise.all(books.map(async (b) => ({ title: b.title, text: await textOf(b.id) }))), S.profile!);
  await save_("bible", S.bible);
  S.busy = ""; if (!silent) toast("Estilo analisado"); render();
}

// ---------- layout ----------
const NAV_GROUPS: [string, string[][]][] = [
  ["Conteúdo", [["acervo", "Acervo", ic("library")], ["autor", "Autor", ic("pen")], ["estilo", "Estilo", ic("fingerprint")], ["referencias", "Referências", ic("landmark")]]],
  ["Criar e publicar", [["leitor", "Leitor", ic("book")], ["mapa", "Mapa e análise", ic("globe")], ["estudio", "Estúdio", ic("feather")]]],
];
const navBtn = ([id, l, icn]: string[]) => `<button class="nav ${S.view === id ? "on" : ""}" data-act="view" data-v="${id}"><i>${icn}</i>${l}</button>`;

function render() {
  const app = $("#app");
  const scroll = $("#main")?.scrollTop || 0;
  app.innerHTML = `
  <aside class="side">
    <div class="brand"><div class="logo">K</div><div><b>Kaveel's</b><span>Book Studio</span></div></div>
    <nav>${NAV_GROUPS.map(([g, items]) => `<div class="navg"><label>${g}</label>${items.map(navBtn).join("")}</div>`).join("")}</nav>
    <div class="side-foot">
      <label>Motor de escrita</label>
      ${engineButton()}
      <label>${L("Imagens", "Images")}</label>
      ${imgChip()}
      ${navBtn(["config", "Configurações", ic("settings")])}
    </div>
  </aside>
  <main id="main" class="v-${S.view}">${S.busy && S.busy !== "ai" && S.view !== "estudio" ? `<div class="busy"><span id="busy">${esc(S.busy)}</span>${S.writing ? `<button class="btn sm" data-act="stop-gen">${ic("stop", 13)} Parar</button>` : ""}</div>` : ""}${VIEWS[S.view]()}</main>${S.picker ? picker() : ""}${S.imgPicker ? imgPicker() : ""}`;
  const m = $("#main"); if (m && S.view !== "leitor") m.scrollTop = scroll;
  after[S.view]?.();
}

const after: Record<string, () => void> = {};
after.acervo = thumbRatios;

// ---------- Acervo ----------
const KIND: any = { livro: "Livro", capa: "Capa", notas: "Notas / Bio", outro: "Outro" };
/** Explicação: capas grátis x chaves de API (ChatGPT / Gemini). Preços e limites conferidos em nov/2026. */
function keyGuide() {
  const it = (icn: string, t: string, d: string) => `<div class="lg"><span class="avatar wk">${ic(icn, 16)}</span><div><b>${t}</b><p>${d}</p></div></div>`;
  return `<div class="libinfo keyinfo"><button class="icon" data-act="key-info" title="${tr("Fechar")}">${ic("x")}</button>
    <h3>${L("Capas com IA: precisa pagar?", "AI covers: do you need to pay?")}</h3>
    <div class="lguide">
      ${it("sparkles", L("Grátis, sem chave", "Free, no key"), L("Os sites do ChatGPT (chatgpt.com) e do Gemini (gemini.google.com) geram algumas imagens por dia de graça. Clique em <b>Copiar prompt da capa</b>, cole lá, baixe a imagem e use <b>Enviar imagem</b>. Custo: zero.", "The ChatGPT (chatgpt.com) and Gemini (gemini.google.com) websites make a few images a day for free. Click <b>Copy cover prompt</b>, paste it there, download the image and use <b>Upload image</b>. Cost: zero."))}
      ${it("gemini", L("Chave do Gemini", "Gemini key"), L("Crie grátis em <b>aistudio.google.com</b> → Get API key. A chave grátis serve para texto, mas <b>gerar imagem pela API não tem cota grátis</b>: é preciso ativar o faturamento (Tier 1). Cerca de US$ 0,04–0,15 por imagem.", "Create one for free at <b>aistudio.google.com</b> → Get API key. The free key works for text, but <b>image generation through the API has no free quota</b>: you must enable billing (Tier 1). About US$0.04–0.15 per image."))}
      ${it("openai", L("Chave do ChatGPT (OpenAI)", "ChatGPT (OpenAI) key"), L("Crie em <b>platform.openai.com</b> → API keys e adicione crédito (pré-pago, a partir de US$ 5). Cada capa custa ~US$ 0,05–0,20 conforme a qualidade. A assinatura ChatGPT Plus <b>não</b> inclui crédito de API, e a OpenAI pode pedir verificação da organização para modelos de imagem.", "Create one at <b>platform.openai.com</b> → API keys and add credit (prepaid, from US$5). Each cover costs ~US$0.05–0.20 depending on quality. A ChatGPT Plus subscription does <b>not</b> include API credit, and OpenAI may ask you to verify your organization for image models."))}
      ${it("check", L("Sua chave fica aqui", "Your key stays here"), L("As chaves ficam só neste computador e são enviadas apenas para a própria OpenAI/Google. Uma capa completa (frente + arte panorâmica) usa 1–2 imagens.", "Keys stay on this computer only and are sent only to OpenAI/Google themselves. A full wrap cover (front + panoramic art) uses 1–2 images."))}
    </div><p class="muted lgfoot">${L("Preços e limites mudam com frequência — confira as páginas oficiais antes de ativar o faturamento. (Conferido em nov/2026.)", "Prices and limits change often — check the official pages before enabling billing. (Checked Nov 2026.)")}</p></div>`;
}
function libGuide() {
  const it = (icn: string, t: string, d: string) => `<div class="lg"><span class="avatar wk">${ic(icn, 16)}</span><div><b>${tr(t)}</b><p>${tr(d)}</p></div></div>`;
  return `<div class="lguide">
    ${it("book", "Livros do autor", "PDF ou Word dos livros já publicados. A IA estuda a voz, o ritmo, os diálogos e o tamanho dos capítulos — e mede quantas palavras cabem em cada página.")}
    ${it("image", "Capas", "Imagens das capas (JPG/PNG). Vincule cada uma ao seu livro: elas viram referência de estilo para as capas novas.")}
    ${it("feather", "Notas e bio", "Word ou TXT com a biografia, análises de estilo e anotações. Entram como contexto para a IA e para a página de autor.")}
    ${it("landmark", "E as Referências?", "Obras de outros autores (domínio público) ficam em Referências, não aqui. Em cada livro do Estúdio você escolhe se usa o autor, as referências ou os dois.")}
  </div><p class="muted lgfoot">${tr("Arraste os arquivos para esta tela ou clique em Adicionar arquivos. Tudo fica só no seu computador.")}</p>`;
}
function vAcervo() {
  const loose = S.lib.filter((i) => i.kind === "capa" && !i.bookId);
  const books = S.lib.filter((i) => i.kind === "livro");
  const groups = (["livro", "notas", "outro"] as const).map((k) => [k, S.lib.filter((i) => i.kind === k)] as const).filter(([, l]) => l.length);
  return `<header class="top"><div><h1>Acervo</h1><p>Seus livros, capas e anotações. Arraste arquivos PDF, Word (.docx), TXT ou imagens para cá.</p></div>
    <div class="row"><button class="btn ghost sm" data-act="lib-info">${ic("compass", 14)} ${L("Como funciona", "How it works")}</button><button class="btn primary" data-act="import">${ic("plus")} Adicionar arquivos</button></div></header>
  ${!S.lib.length ? `<div class="empty drop"><div class="big">${ic("library")}</div><h2>${tr("Comece subindo os livros do autor")}</h2><p>${tr("O Acervo é a base de tudo: é daqui que a IA aprende a voz, o ritmo, o tamanho dos capítulos e os temas do autor para escrever livros novos do mesmo jeito.")}</p>${libGuide()}<button class="btn primary" data-act="import">${ic("plus")} ${tr("Escolher arquivos")}</button></div>` : S.libInfo ? `<div class="libinfo">${libGuide()}<button class="icon" data-act="lib-info" title="${tr("Fechar")}">${ic("x")}</button></div>` : ""}
  ${approvedShelf()}
  ${groups.map(([k, list]) => `<h3 class="sec">${KIND[k]}s <span>${list.length}</span></h3><div class="lgrid">${list.map(card).join("")}</div>`).join("")}
  ${loose.length ? `<h3 class="sec">Capas sem livro <span>vincule cada capa a um livro</span></h3><div class="grid capa">${loose.map((c) => `<div class="card"><div class="thumb capa">${c.thumb ? `<img src="${esc(c.thumb)}">` : ""}</div><div class="meta">${esc(c.title)}</div>
    <div class="row"><select data-link-cover="${c.id}"><option value="">Vincular ao livro…</option>${books.map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join("")}</select><button class="icon" data-act="del-item" data-id="${c.id}">${ic("trash")}</button></div></div>`).join("")}</div>` : ""}`;
}
/** Cartão do Acervo: capa, título e ações ao passar o mouse; o resto num menu "⋯". */
function card(i: Item) {
  const cv = i.kind === "livro" ? coverOf(i) : undefined;
  const src = cv?.thumb || i.thumb;
  const inner = src ? `<img src="${esc(src)}" style="${thumbStyle(cv || i)}" data-ratio-of="${(cv || i).id}">`
    : `<div class="docprev"><span class="dext">${esc(i.ext.toUpperCase())}</span><b>${esc(i.title)}</b><p>${esc(i.preview || "")}</p></div>`;
  const coverBtn = i.kind === "livro" ? (cv ? `<button class="mitem" data-act="cover-view" data-id="${cv.id}">${ic("image", 15)}<span><b>${L("Ver / exportar capa", "View / export cover")}</b></span></button>` : `<button class="mitem" data-act="cover-for" data-id="${i.id}">${ic("image", 15)}<span><b>${L("Adicionar capa", "Add cover")}</b></span></button>`) : "";
  return `<div class="lcard">
    <div class="lcov ${i.kind}" data-act="read" data-id="${i.id}">${inner}<span class="lhover"><span class="btn sm primary">${ic("book", 14)} ${L("Ler", "Read")}</span></span></div>
    <div class="linfo"><textarea class="ttl" rows="2" data-edit-item="${i.id}" data-f="title" title="${esc(i.title)}">${esc(i.title)}</textarea>
      <details class="menu lmore"><summary class="icon" title="${L("Mais opções", "More options")}">⋯</summary><div class="mpanel right">${coverBtn}
        <label class="mitem lkind">${ic("tag", 15)}<span><b>${L("Tipo", "Type")}</b><select data-edit-item="${i.id}" data-f="kind">${Object.keys(KIND).filter((k) => k !== "capa").map((k) => `<option value="${k}" ${i.kind === k ? "selected" : ""}>${KIND[k]}</option>`).join("")}</select></span></label>
        <button class="mitem" data-act="reveal" data-path="${esc(i.path)}">${ic("folder", 15)}<span><b>${L("Mostrar arquivo", "Show file")}</b></span></button>
        <button class="mitem danger" data-act="del-item" data-id="${i.id}">${ic("trash", 15)}<span><b>${L("Remover do Acervo", "Remove from Library")}</b></span></button></div></details></div>
    <small class="lmeta">${i.pages} ${L("pág.", "pp.")} · ${i.words.toLocaleString(locale())} ${L("palavras", "words")}</small>
  </div>`;
}

// ---------- Leitor ----------
function vLeitor() {
  const item = S.lib.find((i) => i.id === S.openId);
  const p = S.projects.find((x) => x.id === S.openId);
  const cur: any = item || p;
  const groups: [string, any[]][] = [["Livros do autor", S.lib.filter((i) => i.kind === "livro")], ["Livros do Estúdio", readProjs()], ["Notas", S.lib.filter((i) => i.kind === "notas")], ["Referências", S.lib.filter((i) => i.kind === "referencia")]];
  const opt = (b: any) => { const w = b.chapters ? b.chapters.reduce((n: number, c: Chapter) => n + words(strip(c.html)), 0) : b.words; return `<button class="mitem ${b.id === S.openId ? "on" : ""}" data-act="open-book" data-id="${b.id}">${bookCov(b)}<span><b>${esc(b.title || "Sem título")}</b><small>${(w || 0).toLocaleString(locale())} ${tr("palavras")}</small></span></button>`; };
  const picker = `<details class="menu bookpick"><summary>${cur ? `${bookCov(cur, "sm")}<span class="bpt"><small>${L("Lendo", "Reading")}</small><b>${esc(cur.title || "Sem título")}</b></span>` : `${ic("book", 16)} <b>${tr("Escolher obra…")}</b>`}<span class="chev"></span></summary>
    <div class="mpanel">${groups.filter(([, l]) => l.length).map(([g, l]) => `<div class="mgroup"><label>${tr(g)}</label>${l.map(opt).join("")}</div>`).join("")}</div></details>`;
  const tools = `<div class="rtools">${picker}
    ${item?.ext === "pdf" ? `<div class="seg"><button class="${S.readTab === "texto" ? "on" : ""}" data-act="rtab" data-t="texto">Texto</button><button class="${S.readTab === "paginas" ? "on" : ""}" data-act="rtab" data-t="paginas">Páginas</button></div>` : ""}
    <div class="seg"><button data-act="font" data-d="-1">A−</button><button data-act="font" data-d="1">A+</button></div>
    <div class="seg">${["light", "sepia", "dark"].map((t) => `<button class="${S.settings.readTheme === t ? "on" : ""}" data-act="rtheme" data-t="${t}">${({ light: "Claro", sepia: "Sépia", dark: "Noite" } as any)[t]}</button>`).join("")}</div>
    ${p ? `<button class="btn sm" data-act="edit-chap" data-i="0">${ic("write", 14)} Editar no Estúdio</button>` : ""}
    ${item || p ? `<details class="menu expmenu"><summary class="btn sm primary">${ic("download", 14)} ${tr("Exportar")} <span class="chev"></span></summary><div class="mpanel right">
      <button class="mitem" data-act="export-pdf" data-v="print"><span class="mthumb">PDF</span><span><b>${tr("PDF para impressão (KDP paperback)")}</b><small>${tr("miolo no corte")} ${esc((p?.wrap?.trim || "6x9").replace("x", " × "))}" · ${tr("margem interna, nº de página, capítulos em página ímpar")}</small></span></button>
      <button class="mitem" data-act="export-pdf" data-v="read"><span class="mthumb">PDF</span><span><b>${tr("PDF para leitura")}</b><small>${tr("A5, para ler ou enviar a alguém")}</small></span></button>
      <button class="mitem" data-act="export-epub"><span class="mthumb">EPUB</span><span><b>${tr("EPUB (ebook Kindle)")}</b><small>${tr("o formato que a KDP aceita para ebook")}</small></span></button>
      <button class="mitem" data-act="export-txt"><span class="mthumb">TXT</span><span><b>${tr("Texto puro")}</b><small>${tr("para colar em qualquer lugar")}</small></span></button>${p && (p.cover || p.wrapArt) ? `<div class="msep">${L("Capa", "Cover")}</div>${coverExportItems(p)}` : ""}</div></details>` : ""}
    <span class="prog" id="prog"></span></div>`;
  if (!item && !p) { const all = [...S.lib.filter((i) => i.kind === "livro"), ...readProjs()]; return `${tools}<div class="rempty"><h2>${L("O que vamos ler?", "What shall we read?")}</h2><p class="muted">${L("Escolha um livro do autor ou um livro do Estúdio.", "Pick one of the author's books or a Studio book.")}</p><div class="rgrid">${all.map((b: any) => `<button class="rbook" data-act="open-book" data-id="${b.id}">${bookCov(b)}<b>${esc(b.title || L("Sem título", "Untitled"))}</b><small>${b.chapters ? L("Estúdio", "Studio") : L("Livro do autor", "Author's book")}</small></button>`).join("")}</div></div>`; }
  return `${tools}<div class="reader theme-${S.settings.readTheme}" id="reader" style="--rf:${S.settings.readFont}px"><div class="page" id="rpage"><div class="loading">${L("Carregando…", "Loading…")}</div></div></div>`;
}
after.leitor = async () => {
  const rp = $("#rpage"); if (!rp) return;
  const item = S.lib.find((i) => i.id === S.openId);
  const p = S.projects.find((x) => x.id === S.openId);
  const reader = $("#reader");
  const restore = () => { const pos = S.settings.readPos[S.openId] || 0; reader.scrollTop = pos * (reader.scrollHeight - reader.clientHeight); };
  let t: any;
  reader.onscroll = () => {
    const r = reader.scrollTop / Math.max(1, reader.scrollHeight - reader.clientHeight);
    $("#prog").textContent = Math.round(r * 100) + "%";
    clearTimeout(t); t = setTimeout(() => { S.settings.readPos[S.openId] = r; save_("settings", S.settings); }, 600);
  };
  if (p) {
    rp.innerHTML = `<div class="titlepage">${p.coverFull ? `<img class="fullcover" src="${convertFileSrc(p.coverFull)}" title="${L("Capa completa: verso · lombada · frente", "Full cover: back · spine · front")}">` : p.cover ? `<img src="${convertFileSrc(p.cover)}">` : ""}<h1>${esc(p.title)}</h1><p>${esc(S.author.name || "")}</p></div>` + p.chapters.map((c, i) => `<h2 class="ch">${esc(c.title)} <button class="icon edch" data-act="edit-chap" data-i="${i}" title="Editar no Estúdio">${ic("write", 14)}</button></h2>${c.html}`).join("");
    return restore();
  }
  if (!item) return;
  const cv = item.kind === "livro" ? coverOf(item) : undefined;
  const opening = async () => cv ? `<div class="titlepage"><img class="fullcover" data-act="cover-view" data-id="${cv.id}" title="Ver capa" src="${await coverImage(cv, 1600)}"></div>` : "";
  if (item.ext === "pdf" && S.readTab === "paginas") {
    rp.classList.add("pdf");
    const doc = await openPdf(item.path);
    const first = await doc.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    const w = Math.min(820, reader.clientWidth - 40);
    rp.innerHTML = (await opening()) + Array.from({ length: doc.numPages }, (_, i) => `<div class="pg" data-n="${i + 1}" style="width:${w}px;height:${(w * vp.height) / vp.width}px"></div>`).join("");
    const io = new IntersectionObserver((ents) => ents.forEach(async (e) => {
      const el = e.target as HTMLElement;
      if (!e.isIntersecting || el.dataset.done) return;
      el.dataset.done = "1";
      const img = new Image(); img.src = await renderThumb(doc, w * devicePixelRatio, +el.dataset.n!); img.style.width = "100%"; el.appendChild(img);
    }), { root: reader, rootMargin: "800px" });
    rp.querySelectorAll(".pg").forEach((el) => io.observe(el));
    return restore();
  }
  if (item.kind === "capa") { rp.innerHTML = `<img class="coverbig" src="${esc(item.thumb || "")}">`; return; }
  let html = item.ext === "docx" ? await invoke<string>("text_get", { id: item.id + "-html" }) : "";
  if (!html) {
    const txt = await textOf(item.id);
    html = splitChapters(txt).map((c) => `<h2 class="ch">${esc(c.title)}</h2>` + c.text.split(/\n{2,}/).filter((x) => x.trim()).map((x) => `<p>${esc(x)}</p>`).join("")).join("");
  }
  rp.innerHTML = (await opening()) + html;
  restore();
};

/** Obra aberta no leitor como capítulos HTML (livro do acervo ou projeto). */
async function readerBook(): Promise<{ title: string; chapters: { title: string; html: string }[]; cover: string | null }> {
  const p = S.projects.find((x) => x.id === S.openId);
  if (p) return { title: p.title || "Livro", chapters: p.chapters.map((c) => ({ title: c.title, html: c.html })), cover: p.ebookCover || p.cover || null };
  const item = S.lib.find((i) => i.id === S.openId)!;
  const txt = await textOf(item.id);
  const chapters = splitChapters(txt).map((c) => ({ title: c.title === "Opening" ? item.title : c.title, html: c.text.split(/\n{2,}/).filter((x) => x.trim()).map((x) => x.trim() === "***" ? "<hr>" : `<p>${esc(x)}</p>`).join("") }));
  const cv = coverOf(item);
  return { title: item.title, chapters, cover: cv ? await frontOf(cv) : null }; // no EPUB vai a frente da capa (padrão de ebook)
}

// ---------- Autor ----------
function vAutor() {
  const a = S.author, e = S.edit;
  const PROF: [string, string, string][] = [["name", "Nome do autor", "Kaveel Lilmohun"], ["pen", "Nome artístico (capa)", ""], ["genres", "Gêneros", "Horror psicológico, suspense"], ["country", "País / cidade", ""], ["email", "E-mail", ""], ["site", "Site / redes", ""]];
  const books = S.lib.filter((i) => i.kind === "livro");
  const words = (t: string) => (t.match(/\S+/g) || []).length;
  const profB = e?.kind === "a-profile" ? `<div class="cgrid">${PROF.map(([k, l, ph]) => `<label class="fld"><span>${tr(l)}</span><input data-ed="${k}" value="${esc(e.draft[k] || "")}" placeholder="${esc(ph)}"></label>`).join("")}</div>${editBar()}`
    : `<div class="acctools">${editBtn("a-profile")}<button class="btn sm" data-act="author-fill">${ic("library", 14)} ${tr("Preencher pelo acervo")}</button></div><dl class="facts">${PROF.map(([k, l]) => `<div><dt>${tr(l)}</dt><dd>${esc(a[k] || "—")}</dd></div>`).join("")}</dl>`;
  const bioB = e?.kind === "a-bio" ? `<label class="fld"><span>${tr("Bio (curta, para a Amazon)")} · <span id="biowc">${words(e.draft.bio || "")}</span> ${tr("palavras")}</span><textarea rows="8" data-ed="bio">${esc(e.draft.bio || "")}</textarea></label>${editBar()}`
    : `<div class="acctools">${editBtn("a-bio")}${S.settings.mode !== "offline" ? `<button class="btn sm" data-act="author-bio-ai" ${S.writing ? "disabled" : ""}>${S.writing === "bio" ? `<span class="spin"></span> ${tr("Escrevendo a bio…")}` : `${ic("sparkles", 14)} ${tr(a.bio ? "Reescrever bio com IA" : "Escrever bio com IA")}`}</button>` : ""}<span class="grow"></span><span class="muted">${words(a.bio || "")} ${tr("palavras")} · ${tr("ideal 120–180")}</span></div>
      <div class="prose2 one"><section><p>${a.bio ? esc(a.bio) : `<span class="muted">${tr("Sem bio ainda.")}</span>`}</p></section></div>`;
  const notesB = e?.kind === "a-notes" ? `<label class="fld"><span>${tr("Notas editoriais sobre o estilo (vindas do Word ou escritas por você)")}</span><textarea rows="18" data-ed="notes">${esc(e.draft.notes || "")}</textarea></label>${editBar()}`
    : `<div class="acctools">${editBtn("a-notes")}<span class="grow"></span><span class="muted">${words(a.notes || "")} ${tr("palavras")} · ${tr("a IA lê estas notas em todo pedido")}</span></div>
      <div class="prose2 one clamp ${S.notesAll ? "all" : ""}"><section><p>${a.notes ? esc(a.notes) : `<span class="muted">${tr("Sem notas ainda. Importe um Word com a análise de estilo no Acervo ou escreva aqui.")}</span>`}</p></section></div>
      ${(a.notes || "").length > 900 ? `<button class="btn sm ghost" data-act="notes-all">${tr(S.notesAll ? "Mostrar menos" : "Mostrar tudo")}</button>` : ""}`;
  const booksB = `<div class="chkgrid">${books.map((b) => { const cv = coverOf(b); return `<div class="bookrow"><div class="bthumb">${cv?.thumb ? `<img src="${esc(cv.thumb)}">` : ic("book", 18)}</div><div><b>${esc(b.title)}</b><small>${b.pages} ${tr("páginas")} · ${b.words.toLocaleString(locale())} ${tr("palavras")}</small></div></div>`; }).join("")}</div>
      ${books.length ? "" : `<p class="muted">${tr("Nenhum livro no Acervo ainda.")}</p>`}<div class="acctools" style="margin-top:10px"><button class="btn sm" data-act="view" data-v="acervo">${ic("library", 14)} ${tr("Abrir o Acervo")}</button></div>`;
  const name = a.pen || a.name || tr("Autor sem nome");
  return `<header class="top"><div><h1>${tr("Autor")}</h1><p>${tr("Quem escreve. Esses dados alimentam a IA, a página do livro e a bio da Amazon (Author Central).")}</p></div></header>
  <div class="ahero"><span class="avatar big" style="--h:${hue(name)}">${esc(initials(name) || "?")}</span><div><h2>${esc(name)}</h2><p class="muted">${esc([a.pen && a.name && a.pen !== a.name ? a.name : "", a.genres, a.country].filter(Boolean).join(" · ") || tr("Preencha o perfil abaixo"))}</p></div>
    <div class="astats"><div><b>${books.length}</b><small>${tr("livros")}</small></div><div><b>${books.reduce((n, b) => n + b.words, 0).toLocaleString(locale())}</b><small>${tr("palavras")}</small></div><div><b>${S.projects.length}</b><small>${tr("projetos")}</small></div></div></div>
  <div class="acc">
    ${accSec("a-profile", "pen", tr("Perfil"), esc([a.name, a.genres].filter(Boolean).join(" · ") || "—"), profB)}
    ${accSec("a-bio", "feather", tr("Bio para a Amazon"), a.bio ? `${words(a.bio)} ${tr("palavras")}` : tr("sem bio ainda"), bioB)}
    ${accSec("a-notes", "fingerprint", tr("Notas de estilo"), a.notes ? `${words(a.notes)} ${tr("palavras")}` : tr("sem notas ainda"), notesB)}
    ${accSec("a-books", "library", tr("Livros publicados"), `${books.length} ${tr("no Acervo")}`, booksB)}
  </div>`;
}

// ---------- Estilo ----------
function vEstilo() {
  const p = S.profile;
  const head = `<header class="top"><div><h1>Estilo do autor</h1><p>Medido direto nos livros do acervo — funciona sem IA e é a base para tudo que for gerado.</p></div><button class="btn primary" data-act="analyze">↻ Analisar acervo</button></header>`;
  if (!p) return head + `<div class="empty"><div class="big">${ic("fingerprint")}</div><p>Adicione livros ao acervo e clique em Analisar.</p></div>`;
  const stat = (v: any, l: string) => `<div class="mstat"><b>${v}</b><span>${l}</span></div>`;
  const bars = (list: [string, number][]) => { const max = Math.max(1, ...list.map((x) => x[1])); return list.map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><i style="width:${(v / max) * 100}%"></i><em>${v}</em></div>`).join(""); };
  const tab = S.styleTab || "retrato";
  const TABS: [string, string, string][] = [["retrato", L("Retrato", "Portrait"), "fingerprint"], ["palavras", L("Palavras", "Words"), "feather"], ["personagens", L("Personagens", "Characters"), "fingerprint"], ["estrutura", L("Estrutura", "Structure"), "blocks"], ["checar", L("Checar texto", "Check a text"), "check"]];
  const body = tab === "palavras" ? `<div class="cols">${`<section class="panel"><h3>Palavras-assinatura</h3><div class="chips">${p.topWords.slice(0, 30).map(([w, n]) => `<span class="chip">${esc(w)} <small>${n}</small></span>`).join("")}</div>
    <h3>Expressões que se repetem</h3><div class="chips">${p.phrases.map(([w, n]) => `<span class="chip">“${esc(w)}” <small>${n}</small></span>`).join("")}</div></section>`}<section class="panel"><h3>Verbos de fala</h3>${bars(p.tags)}<h3>Pontuação / mil palavras</h3>${bars(Object.entries(p.punct))}</section></div>`
    : tab === "personagens" ? `<section class="panel"><h3>Personagens recorrentes</h3><div class="chips">${p.names.map(([w, n]) => `<span class="chip">${esc(w)} <small>${n}</small></span>`).join("")}</div></section>${S.bible ? `<section class="panel"><div class="row" style="justify-content:space-between;margin:0"><h3>Bíblia do autor · personagens</h3><button class="btn sm" data-act="deepen">${ic("sparkles")} Aprofundar com IA</button></div>
    <div class="chargrid">${S.bible.characters.slice(0, 12).map((c) => `<div class="charc"><b>${esc(c.name)}</b><small>${c.count} menções · ${esc(c.books.join(", "))}</small><p>${esc(c.summary || c.facts.slice(0, 2).join(" ") || c.first)}</p><small>Ligações: ${esc(c.links.map((l) => l[0]).join(", "))}</small></div>`).join("")}</div></section>` : ""}`
    : tab === "estrutura" ? `${S.bible ? `<section class="panel"><h3>Estrutura dos livros (${S.bible.chapters.length} capítulos)</h3><div class="chaps">${S.bible.chapters.map((c) => `<details><summary><b>${esc(c.book)}</b> · ${esc(c.title)} <small>${c.words} pal · foco: ${esc(c.pov)}${c.hook ? " · gancho" : ""}</small></summary><p>${esc(c.aiSummary || c.summary)}</p></details>`).join("")}</div></section>` : ""}<section class="panel"><h3>Por livro</h3><table><tr><th>Livro</th><th>Palavras</th><th>Palavras/frase</th><th>Diálogo</th></tr>${p.perBook.map((b) => `<tr><td>${esc(b.title)}</td><td>${b.words.toLocaleString(locale())}</td><td>${b.avgSentence}</td><td>${b.dialoguePct}%</td></tr>`).join("")}</table></section><section class="panel"><h3>Aberturas de capítulo do autor</h3><ul class="quotes">${p.openings.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></section>`
    : tab === "checar" ? `<section class="panel"><h3>Checar um texto contra o estilo</h3><textarea id="chk" rows="6" placeholder="Cole um trecho novo aqui…"></textarea><button class="btn" data-act="check">Comparar</button>${S.check ? `<div class="check"><b>${S.check.score}/100</b><ul>${S.check.tips.map((t: string) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}</section>`
    : `<div class="cols"><section class="panel"><h3>Retrato do estilo</h3><pre class="desc">${esc(describe(p, isEn()))}</pre></section><section class="panel"><h3>Temas (ocorrências / 10 mil palavras)</h3>${bars(p.themes)}</section></div>${S.bible ? `<section class="panel"><h3>Técnicas narrativas</h3><ul>${(!isEn() ? S.bible.techniques : S.bible.techniquesEn || S.bible.techniques).map((t) => `<li>${esc(tr(t))}</li>`).join("")}</ul></section>` : ""}`;
  return head + `<div class="mstats sstats">${stat(p.words.toLocaleString(locale()), "palavras analisadas")}${stat(p.avgSentence, "palavras por frase")}${stat(p.dialoguePct + "%", "parágrafos com diálogo")}${stat(p.avgChapterWords.toLocaleString(locale()), "palavras por capítulo")}${stat(p.richness + "%", "riqueza de vocabulário")}${stat(p.firstPersonPct > 55 ? "1ª pessoa" : "3ª pessoa", "ponto de vista")}</div>
  <div class="seg ptabs stabs">${TABS.map(([k, l, i]) => `<button class="${tab === k ? "on" : ""}" data-act="style-tab" data-t="${k}">${ic(i, 14)} ${l}</button>`).join("")}</div>
  <div class="sbody">${body}</div>`;
}

// ---------- Estúdio ----------
const secOpen = (k: string) => (S.secs ||= {})[k] !== false;
function accSec(k: string, icon: string, title: string, sub: string, body: string, edit = false) {
  const open = secOpen(k) || S.edit?.kind === k;
  return `<div class="accitem ${open ? "open" : ""} ${S.edit?.kind === k ? "isedit" : ""}"><button class="acchead" data-act="sec-toggle" data-k="${k}"><span class="avatar wk">${ic(icon, 16)}</span><span class="mtx"><b>${title}</b><small>${sub}</small></span>${chev}</button>${open ? `<div class="accbody">${body}</div>` : ""}</div>`;
  void edit;
}
const editBtn = (kind: string, id = "") => `<button class="btn sm primary" data-act="edit-start" data-kind="${kind}" data-id="${id}">${ic("pen", 14)} ${tr("Editar")}</button>`;
function ideaAcc(p: Project, mismatch: any, offlinePlan: boolean) {
  const e = S.edit;
  const arch = { ...archDefaults(), ...(p.arch || {}) };
  const story = e?.kind === "idea" ? `<div class="cgrid"><label class="fld"><span>${tr("Subtítulo (opcional)")}</span><input data-ed="subtitle" value="${esc(e.draft.subtitle || "")}"></label><label class="fld"><span>${tr("Gênero")}</span><input data-ed="genre" value="${esc(e.draft.genre || "")}"></label></div>
      <label class="fld"><span>${tr("Premissa e ideias")}</span><textarea data-ed="premise" rows="12">${esc(e.draft.premise || "")}</textarea></label>${editBar()}`
    : `<div class="acctools">${editBtn("idea")}</div><dl class="facts"><div><dt>${tr("Gênero")}</dt><dd>${esc(p.genre || "—")}</dd></div><div><dt>${tr("Subtítulo")}</dt><dd>${esc(p.subtitle || "—")}</dd></div></dl>
      <div class="prose2 one"><section><h4>${tr("Premissa e ideias")}</h4><p>${esc(p.premise || "—")}</p></section></div>`;
  const size = e?.kind === "size" ? `<div class="cgrid"><label class="fld"><span>${tr("Tamanho em páginas")}</span><input type="number" min="20" max="600" data-ed="pages" value="${e.draft.pages}"></label></div>${editBar()}`
    : `<div class="acctools">${editBtn("size")}</div><dl class="facts big"><div><dt>${tr("Páginas")}</dt><dd>${p.pages || 180}</dd></div><div><dt>${tr("Capítulos")}</dt><dd>${p.nChapters}</dd></div><div><dt>${tr("Palavras")}</dt><dd>≈ ${totalWords(p).toLocaleString(locale())}</dd></div><div><dt>${tr("Por capítulo")}</dt><dd>~${perChapter(p).toLocaleString(locale())}</dd></div></dl>
      <p class="muted">${esc(tr(engineLimits(S.settings.mode, p.pages || 180)))}</p>
      ${mismatch || offlinePlan ? `<p class="hint warn">${ic("compass", 14)} <span><span>${mismatch ? `O roteiro atual tem ${p.chapters.length} capítulos, mas para ${p.pages} páginas são ${p.nChapters}.` : "O roteiro atual é só o modelo sem IA."}</span> <span>“Gerar livro completo” refaz o roteiro com a IA (o texto já escrito fica).</span></span></p>` : ""}`;
  const archB = e?.kind === "arch" ? `<div class="archgrid">${ARCH.map((a) => `<label class="fld"><span>${tr(a.label)}</span><select data-ed="${a.key}">${a.options.map(([v, l]) => `<option value="${v}" ${e.draft[a.key] === v ? "selected" : ""}>${tr(l)}</option>`).join("")}</select></label>`).join("")}</div>${editBar()}`
    : `<div class="acctools">${editBtn("arch")}</div><dl class="facts">${ARCH.map((a) => `<div><dt>${tr(a.label)}</dt><dd>${tr(a.options.find((o) => o[0] === arch[a.key])?.[1] || "—")}</dd></div>`).join("")}</dl>`;
  const st = styleOf(p), { books: ub, refs: ur } = styleSources(st);
  const lab = (l: [string, string, string][], v: string) => tr(l.find((x) => x[0] === v)?.[1] || "—");
  const styleB = e?.kind === "style" ? (() => { const d = e.draft as BookStyle; const ab = authorBooks(), rw = refWorks();
      const chk = (k: "books" | "refs", list: Item[]) => list.length ? `<div class="chkgrid">${list.map((b) => `<label class="chkc"><input type="checkbox" data-edl="${k}" value="${b.id}" ${!d[k] || d[k]!.includes(b.id) ? "checked" : ""}><span>${esc(b.title)}</span><small>${b.words.toLocaleString(locale())} ${tr("palavras")}</small></label>`).join("")}</div>` : `<p class="muted">${tr(k === "books" ? "Nenhum livro do autor no Acervo ainda." : "Nenhuma obra de referência ainda — adicione em Referências.")}</p>`;
      const sel = (k: keyof BookStyle, l: [string, string, string][]) => `<select data-ed="${k}">${l.map(([v, t]) => `<option value="${v}" ${d[k] === v ? "selected" : ""}>${tr(t)}</option>`).join("")}</select>`;
      return `<div class="fld"><span>${tr("Base da escrita")}</span><div class="toggles">${BASES.map(([v, t, sub]) => `<button class="tog ${d.base === v ? "on" : ""}" data-act="style-base" data-v="${v}">${tr(t)} <small>${tr(sub)}</small></button>`).join("")}</div></div>
        ${d.base !== "refs" ? `<div class="fld"><span>${tr("Livros do autor usados como referência")}</span>${chk("books", ab)}</div>` : ""}
        ${d.base !== "author" ? `<div class="fld"><span>${tr("Obras de referência usadas")}</span>${chk("refs", rw)}</div>` : ""}
        <div class="cgrid"><label class="fld"><span>${tr("Gêneros")}</span><input data-ed="genres" value="${esc(d.genres)}" placeholder="horror, mystery, supernatural thriller"></label>
          <label class="fld"><span>${tr("Tom e clima")}</span><input data-ed="tone" value="${esc(d.tone)}" placeholder="dark, tense, melancholic, with dry humour"></label>
          <label class="fld"><span>${tr("Comparável a")}</span><input data-ed="comps" value="${esc(d.comps)}" placeholder="Stephen King's It meets Night Circus"></label>
          <label class="fld"><span>${tr("Narrador")}</span>${sel("pov", POVS)}</label><label class="fld"><span>${tr("Tempo verbal")}</span>${sel("tense", TENSES)}</label><label class="fld"><span>${tr("Público")}</span>${sel("audience", AUDS)}</label></div>
        <label class="fld"><span>${tr("Observações de estilo")}</span><textarea rows="3" data-ed="notes" placeholder="Short chapters ending on hooks; South African setting and slang; no gore on the page…">${esc(d.notes)}</textarea></label>
        <div class="cgrid"><label class="fld"><span>${tr("Estilo artístico da capa")}</span><input data-ed="coverStyle" value="${esc(d.coverStyle)}" placeholder="dark painterly, vintage circus poster, photographic…"></label>
          <label class="fld"><span>${tr("Capas do acervo como referência")}</span><select data-ed="coverRef"><option value="author" ${d.coverRef === "author" ? "selected" : ""}>${tr("Sim — mesmo estilo das capas do autor")}</option><option value="free" ${d.coverRef === "free" ? "selected" : ""}>${tr("Não — estilo livre")}</option></select></label></div>${editBar()}`; })()
    : `<div class="acctools">${editBtn("style")}</div><dl class="facts">
      <div><dt>${tr("Base da escrita")}</dt><dd>${tr(BASES.find((b) => b[0] === st.base)![1])}</dd></div>
      ${st.base !== "refs" ? `<div><dt>${tr("Livros do autor")}</dt><dd>${ub.length ? esc(ub.map((b) => b.title).join(", ")) : tr("nenhum")}</dd></div>` : ""}
      ${st.base !== "author" ? `<div><dt>${tr("Obras de referência")}</dt><dd>${ur.length ? esc(ur.map((b) => b.title).join(", ")) : tr("nenhuma")}</dd></div>` : ""}
      <div><dt>${tr("Gêneros")}</dt><dd>${esc(st.genres || p.genre || "—")}</dd></div><div><dt>${tr("Tom e clima")}</dt><dd>${esc(st.tone || "—")}</dd></div>
      <div><dt>${tr("Narrador")}</dt><dd>${lab(POVS, st.pov)}</dd></div><div><dt>${tr("Tempo verbal")}</dt><dd>${lab(TENSES, st.tense)}</dd></div><div><dt>${tr("Público")}</dt><dd>${lab(AUDS, st.audience)}</dd></div>
      <div><dt>${tr("Comparável a")}</dt><dd>${esc(st.comps || "—")}</dd></div><div><dt>${tr("Estilo artístico da capa")}</dt><dd>${esc(st.coverStyle || "—")} · ${tr(st.coverRef === "author" ? "como as capas do autor" : "estilo livre")}</dd></div></dl>
      ${st.notes ? `<div class="prose2 one"><section><h4>${tr("Observações de estilo")}</h4><p>${esc(st.notes)}</p></section></div>` : ""}
      ${st.base !== "refs" && !ub.length ? `<p class="hint warn">${ic("library", 14)} <span>${tr("Nenhum livro do autor selecionado — a IA não terá a voz do autor como base.")}</span></p>` : ""}${st.base !== "author" && !ur.length ? `<p class="hint warn">${ic("landmark", 14)} <span>${tr("Nenhuma obra de referência selecionada.")}</span></p>` : ""}`;
  const planned = p.chapters.filter((c) => c.plan && c.plan.length > 20).length;
  const outlineB = `<p class="muted" style="margin-top:0">${planned ? `${planned} ${tr("de")} ${p.nChapters} ${tr("capítulos planejados.")}` : tr("Ainda sem roteiro.")} ${tr("“Gerar livro completo” cria o que falta e continua de onde parou.")}</p>
      <div class="acctools"><button class="btn sm" data-act="ai-outline" ${S.writing ? "disabled" : ""}>${ic("sparkles", 14)} ${tr("Refazer fichas + roteiro com IA")}</button><button class="btn sm" data-act="outline">${ic("compass", 14)} ${tr("Roteiro modelo (sem IA)")}</button></div>`;
  const busyCover = S.writing === "cover";
  const fullB = p.coverFull ? `<div class="cvfull"><div class="cvfullhead"><b>${L("Capa completa", "Full cover")}</b><small class="muted">${L("verso (sinopse) · lombada (título e autor) · frente", "back (blurb) · spine (title and author) · front")}</small>
      <span class="grow"></span><button class="btn sm" data-act="cover-back" ${S.writing ? "disabled" : ""}>${ic("image", 14)} ${p.backArt ? L("Nova arte do verso", "New back art") : L("Gerar arte do verso", "Generate back art")}</button><button class="btn sm" data-act="wrap-open">${ic("write", 14)} ${L("Editar textos e layout", "Edit text and layout")}</button>
      <details class="menu expmenu"><summary class="btn sm primary">${ic("download", 14)} ${L("Exportar capa", "Export cover")} <span class="chev"></span></summary><div class="mpanel right">${coverExportItems(p)}</div></details></div>
      <img src="${convertFileSrc(p.coverFull)}" data-act="wrap-open" title="${L("Clique para editar", "Click to edit")}"></div>` : p.cover || p.wrapArt ? `<div class="cvfull pending"><span class="spin"></span> ${L("Montando a capa completa (verso, lombada e frente)…", "Building the full cover (back, spine and front)…")}</div>` : "";
  const coverB = `<div class="coverrow"><div class="cvthumb">${p.ebookCover || p.cover ? `<img src="${convertFileSrc(p.ebookCover || p.cover!)}">` : busyCover ? `<span class="spin"></span>` : `<span class="muted">${tr("Sem capa")}</span>`}</div>
    <div class="cvside">
      ${coverWays(p, busyCover)}
      ${p.coverPrompt ? `<div class="cprompt"><small>${L("Prompt copiado — cole no chatgpt.com ou gemini.google.com, baixe a imagem e clique em Enviar imagem:", "Prompt copied — paste it at chatgpt.com or gemini.google.com, download the image and click Upload image:")}</small><p>${esc(p.coverPrompt)}</p><button class="btn sm ghost" data-act="cover-prompt-copy">${ic("clipboard", 13)} ${L("Copiar de novo", "Copy again")}</button></div>` : ""}
      ${S.keyInfo ? keyGuide() : ""}
      </div></div>${fullB}${artsGallery(p)}`;
  return `<div class="castwrap"><div class="acc">
    ${accSec("cover", "image", tr("Capa"), p.cover ? tr("pronta") + (p.wrapArt ? " · " + tr("arte da capa completa pronta") : "") : tr("sem capa ainda"), coverB)}
    ${accSec("idea", "feather", tr("História"), esc([p.genre, p.premise.replace(/\s+/g, " ").slice(0, 110)].filter(Boolean).join(" · ") || "—"), story)}
    ${accSec("style", "fingerprint", tr("Estilo e referências"), esc([tr(BASES.find((b) => b[0] === st.base)![1]), st.genres || p.genre, st.tone].filter(Boolean).join(" · ")), styleB)}
    ${accSec("size", "book", tr("Tamanho do livro"), `${p.pages || 180} ${tr("páginas")} · ${p.nChapters} ${tr("capítulos")} · ≈ ${totalWords(p).toLocaleString(locale())} ${tr("palavras")}`, size)}
    ${accSec("arch", "compass", tr("Arquitetura narrativa"), tr("baseada nas pesquisas StoryScope e sepia: o que separa ficção humana de ficção de IA"), archB)}
    ${accSec("outline", "blocks", tr("Roteiro"), planned ? `${planned}/${p.nChapters} ${tr("capítulos planejados")}` : tr("Ainda sem roteiro."), outlineB)}
  </div></div>`;
}
function chapEditor(p: Project, ch: Chapter) {
  const i = p.chapters.indexOf(ch), t = strip(ch.html).trim(), w = words(t), target = perChapter(p), pct = Math.min(100, Math.round((w / target) * 100));
  const live = S.writing === ch.id, editing = S.edit?.kind === "text" && S.edit.id === ch.id, planEd = S.edit?.kind === "chap" && S.edit.id === ch.id;
  const st = live ? ["live", L("escrevendo…", "writing…")] : ch.done || pct >= 80 ? ["ok", L("escrito", "written")] : w > 50 ? ["part", L("pela metade", "half done")] : ["", L("ainda não escrito", "not written yet")];
  const m = ch.title.match(/^chapter\s*(\d+)\s*:?\s*(.*)$/i), name = m ? m[2] || ch.title : ch.title;
  const aiLabel = st[0] === "ok" ? "Reescrever com IA" : w > 50 ? "Continuar com IA" : "Escrever com IA";
  return `<div class="editor">
    <div class="chhead"><span class="avatar num st-${st[0]}">${i + 1}</span><div class="chmeta"><small>${tr("Capítulo")} ${i + 1} ${tr("de")} ${p.chapters.length}</small><h2>${esc(name)}</h2>
        <div class="chprog"><i class="cbar"><b style="width:${pct}%"></b></i><span>${w.toLocaleString(locale())} / ~${target.toLocaleString(locale())} ${tr("palavras")}</span><i class="chip st-${st[0]}">${live ? `<span class="spin"></span> ` : ""}${st[1]}</i></div></div>
      <div class="chbtns">${editing ? "" : `<button class="btn sm" data-act="text-edit" ${live ? "disabled" : ""}>${ic("pen", 14)} ${tr("Editar texto")}</button><button class="btn sm primary" data-act="write-chap" ${S.writing ? "disabled" : ""}>${ic("sparkles", 14)} ${tr(aiLabel)}</button>`}
        <details class="menu"><summary class="icon" title="${tr("Mais")}">⋯</summary><div class="mpanel right">
          <button class="mitem" data-act="check-chap"><span class="mthumb">${ic("fingerprint", 15)}</span><span><b>${tr("Checar estilo e “soa humano”")}</b><small>${tr("sem IA, custo zero")}</small></span></button>
          <button class="mitem" data-act="scaffold"><span class="mthumb">${ic("blocks", 15)}</span><span><b>${tr("Rascunho guiado sem IA")}</b><small>${tr("estrutura com trechos do acervo")}</small></span></button>
          <button class="mitem" data-act="chap-up" ${i ? "" : "disabled"}><span class="mthumb">↑</span><span><b>${tr("Mover para cima")}</b></span></button>
          <button class="mitem danger" data-act="chap-del"><span class="mthumb">${ic("trash", 15)}</span><span><b>${tr("Apagar capítulo")}</b></span></button></div></details></div></div>
    <div class="paperwrap" id="paperwrap">
      <div class="plancard ${planEd ? "isedit" : ""}">${planEd ? `<label class="fld"><span>${tr("Título")}</span><input class="cname" data-ed="title" value="${esc(S.edit!.draft.title)}"></label><label class="fld"><span>${tr("Do que se trata")}</span><textarea rows="4" data-ed="plan">${esc(S.edit!.draft.plan || "")}</textarea></label>${editBar()}`
        : `<div class="pch"><b>${ic("compass", 14)} ${tr("Do que se trata")}</b><button class="btn sm ghost" data-act="edit-start" data-kind="chap" data-id="${ch.id}" ${live ? "disabled" : ""}>${ic("pen", 13)} ${tr("Editar")}</button></div><p class="${S.planAll ? "" : "clamp3"}" data-act="plan-all">${esc(ch.plan || "—")}</p>`}</div>
      ${editing ? `<div class="edbar"><button class="icon" data-cmd="bold" title="${tr("Negrito")}"><b>B</b></button><button class="icon" data-cmd="italic" title="${tr("Itálico")}"><i>I</i></button><button class="icon" data-act="scene-break" title="${tr("Quebra de cena")}">⁂</button><span class="muted">${ic("pen", 13)} ${tr("Editando o texto — só salva ao clicar em Salvar (⌘S)")}</span><button class="btn sm" data-act="edit-cancel">${tr("Cancelar")}</button><button class="btn sm primary" data-act="edit-save">${ic("check", 14)} ${tr("Salvar")}</button></div>` : ""}
      <article class="paper ${editing ? "editing" : ""} ${live ? "live" : ""}"><div class="pchap">${tr("Capítulo")} ${i + 1}</div><h1>${esc(name)}</h1>
        <div class="page-edit" id="ed" contenteditable="${editing}" spellcheck="${editing}">${ch.html || (live ? "" : `<p class="ph">${tr("Este capítulo ainda não foi escrito. Clique em “Escrever com IA” ou em “Editar texto” para escrever à mão.")}</p>`)}</div>
        ${t ? `<div class="pend">⁂</div>` : ""}</article></div></div>`;
}
function chapItem(p: Project, c: Chapter, i: number) {
  const t = strip(c.html).trim(), w = words(t), target = perChapter(p), pct = Math.min(100, Math.round((w / target) * 100));
  const live = S.writing === c.id, open = S.chOpen === c.id || live || S.edit?.id === c.id;
  const st = live ? ["live", L("escrevendo…", "writing…")] : c.done || pct >= 80 ? ["ok", L("escrito", "written")] : w > 50 ? ["part", L("pela metade", "half done")] : ["", L("planejado", "planned")];
  const title = c.title.replace(/^chapter\s*\d+:?\s*/i, "") || c.title;
  let body = "";
  if (open) body = S.edit?.id === c.id
    ? `<div class="accbody editing"><label class="fld"><span>${tr("Título")}</span><input class="cname" data-ed="title" value="${esc(S.edit.draft.title)}"></label><label class="fld"><span>${tr("Do que se trata")}</span><textarea rows="4" data-ed="plan">${esc(S.edit.draft.plan || "")}</textarea></label>${editBar()}</div>`
    : `<div class="accbody"><div class="acctools"><button class="btn sm primary" data-act="open-chap" data-i="${i}">${ic("book", 14)} ${tr("Abrir no editor")}</button>
        <button class="btn sm" data-act="write-chap-i" data-i="${i}" ${S.writing ? "disabled" : ""}>${ic("sparkles", 14)} ${tr(st[0] === "ok" ? "Reescrever com IA" : w > 50 ? "Continuar com IA" : "Escrever com IA")}</button>
        <button class="btn sm" data-act="edit-start" data-kind="chap" data-id="${c.id}">${ic("pen", 14)} ${tr("Editar plano")}</button><span class="grow"></span><span class="muted">${w.toLocaleString(locale())} / ~${target.toLocaleString(locale())} ${tr("palavras")}</span></div>
      <div class="prose2 one"><section><h4>${tr("Do que se trata")}</h4><p>${esc(c.plan || "—")}</p></section></div>
      ${t ? `<div class="chtext" data-act="open-chap" data-i="${i}">${esc(t.slice(0, 900))}${t.length > 900 ? "…" : ""}</div>` : ""}</div>`;
  return `<div class="accitem ${open ? "open" : ""} ${live ? "live" : ""} ${S.edit?.id === c.id ? "isedit" : ""}"><button class="acchead" data-act="ch-open" data-id="${c.id}"><span class="avatar num st-${st[0]}">${i + 1}</span>
    <span class="mtx"><b>${esc(title)}</b><small>${esc((c.plan || "").slice(0, 140) || "—")}</small></span>
    <span class="chips"><i class="cbar"><b style="width:${pct}%"></b></i><i class="chip st-${st[0]}">${live ? `<span class="spin"></span> ` : ""}${st[1]}</i></span>${chev}</button>${body}</div>`;
}
function vEstudio() {
  const p = proj();
  const plMin = S.settings.plistMin !== false;
  const list = plMin ? `<div class="plist mini"><button class="icon plt" data-act="plist-toggle" title="${L("Mostrar lista de livros", "Show book list")}">${ic("chevron", 14)}</button><button class="pnew" data-act="new-proj" title="${L("Novo livro", "New book")}">${ic("plus", 18)}</button>${liveProjs().map((x) => `<button class="pcov ${x.id === S.projId && !S.trashView ? "on" : ""} ${x.status === "rejected" ? "rej" : ""}" data-act="sel-proj" data-id="${x.id}" title="${esc(x.title || L("Sem título", "Untitled"))}">${bookCov(x)}</button>`).join("")}<span class="grow"></span><button class="icon ptr" data-act="plist-toggle" title="${L("Lixeira e lista completa", "Trash and full list")}">${ic("trash", 15)}</button></div>` : `<div class="plist"><button class="icon plt open" data-act="plist-toggle" title="${L("Recolher lista", "Collapse list")}">${ic("chevron", 14)}</button><button class="btn primary w ${!S.projId ? "on" : ""}" data-act="new-proj">${ic("plus")} Novo livro</button>${liveProjs().map((x) => `<button class="pitem ${x.id === S.projId && !S.trashView ? "on" : ""} ${x.status === "rejected" ? "rej" : ""}" data-act="sel-proj" data-id="${x.id}"><b>${esc(x.title || "Sem título")}</b><span>${x.chapters.length} cap · ${x.chapters.reduce((n, c) => n + words(strip(c.html)), 0).toLocaleString(locale())} palavras</span>${statusTag(x)}</button>`).join("")}
    <button class="pitem trashbtn ${S.trashView ? "on" : ""}" data-act="trash-view">${ic("trash", 14)} ${L("Lixeira", "Trash")} <small>${S.projects.length - liveProjs().length}</small></button></div>`;
  if (S.trashView) return `<div class="studio">${list}<div class="wizwrap"><div class="landing">${trashPanel()}</div></div></div>`;
  if (!p) return `<div class="studio">${list}<div class="wizwrap"><div class="landing">${history()}${vNovo()}</div></div></div>`;
  const ch = p.chapters[S.chap];
  const total = projWords(p), target = totalWords(p);
  const done = p.chapters.filter((c) => strip(c.html).trim().length > 200).length;
  const aiOn = engineReady();
  const started = total > 0;
  const pubOn = S.ptab === "publish" && p.status === "approved";
  const tab = S.ptab === "read" || (S.ptab === "publish" && !pubOn) ? "write" : S.ptab;
  const mismatch = p.chapters.length && p.chapters.length !== p.nChapters;
  const offlinePlan = p.chapters.length > 0 && p.chapters.every((c) => !c.plan || /^(Ordinary world|Mundo normal|Bonds|Laços|The crack)/.test(c.plan));
  const main = S.writing
    ? `<button class="btn readbtn" data-act="stop-gen" title="${L("Parar", "Stop")}">${ic("stop", 15)} <span>${L("Parar", "Stop")}</span></button>`
    : started && done >= p.chapters.length ? "" : `<button class="btn primary readbtn" data-act="gen-book" title="${started ? L("Continuar escrevendo", "Continue writing") : L("Gerar livro completo", "Generate full book")}">${ic("sparkles", 15)} <span>${started ? L("Continuar", "Continue") : L("Gerar livro", "Generate book")}</span></button>`;
  const ideaTab = ideaAcc(p, mismatch, offlinePlan);
  const stages = [["cast", L("Personagens", "Characters"), "fingerprint"], ["world", L("Lugares e objetos", "Places & objects"), "landmark"], ["outline", L("Roteiro", "Outline"), "compass"], ["cover", L("Capa", "Cover"), "image"], ["write", L("Capítulos", "Chapters"), "write"]];
  const si = stages.findIndex((x) => x[0] === S.pipe);
  const stageCard = S.pipe && S.pipe !== "write" ? `<div class="stagecard"><div class="stages">${stages.map(([k, l, i], n) => `<div class="stg ${n < si ? "ok" : n === si ? "cur" : ""}"><span class="sdot">${n < si ? ic("check", 14) : n === si ? `<span class="spin"></span>` : ic(i, 14)}</span>${l}</div>`).join(`<i class="sline"></i>`)}</div>
    <p>${S.pipe === "cast" ? L("Criando o elenco: nomes, aparência, personalidade, MBTI, segredos e relações…", "Building the cast: names, looks, personality, MBTI, secrets and relationships…") : S.pipe === "world" ? L("Criando os lugares, objetos e eventos da história…", "Building the story's places, objects and events…") : S.pipe === "outline" ? L("Planejando a história capítulo por capítulo — eles vão aparecer aqui.", "Planning the story chapter by chapter — they will appear here.") : L("Gerando a capa…", "Generating the cover…")}</p>
    ${S.pipe === "cast" && castOf(p).length ? `<div class="chips">${castOf(p).map((c) => `<span class="chip">${esc(c.name)}${c.mbti ? ` <small>${esc(c.mbti)}</small>` : ""}</span>`).join("")}</div>` : ""}</div>` : "";
  const overview = `<div class="castwrap">${stageCard}${p.chapters.length ? `<div class="row acctop"><p class="muted" style="flex:1;margin:0">${tr("Clique num capítulo para ver do que se trata e o texto. Use o Editor para escrever à mão.")}</p>${S.writing || done >= p.chapters.length ? "" : `<button class="btn primary" data-act="gen-book">${ic("sparkles")} ${tr(done ? "Continuar escrevendo" : "Escrever todos")}</button>`}</div><div class="acc">${p.chapters.map((c, i) => chapItem(p, c, i)).join("")}</div>`
      : stageCard ? "" : `<div class="empty"><div class="big">${ic("write")}</div><p>${tr("Sem capítulos ainda. Clique em “Gerar livro completo”.")}</p></div>`}</div>`;
  const chapTab = S.chview === "lista" ? overview : `<div class="chwrap">
      <div class="chlist">${p.chapters.map((c, i) => { const w = words(strip(c.html)); const pct = Math.min(100, Math.round((w / perChapter(p)) * 100)); return `<button class="${i === S.chap ? "on" : ""} ${S.writing === c.id ? "live" : ""}" data-act="sel-chap" data-i="${i}" title="${esc(c.plan || "")}"><span class="ct">${esc(c.title)}</span><i class="cbar"><b style="width:${pct}%"></b></i></button>`; }).join("")}<button class="add" data-act="add-chap">${ic("plus")} Capítulo</button></div>
      ${ch ? chapEditor(p, ch) : `<div class="empty"><p>${tr("Sem capítulos ainda. Clique em “Gerar livro completo”.")}</p></div>`}
    </div>`;
  return `<div class="studio chat-${S.settings.chatSize === "min" ? "min" : "normal"} ${plMin ? "pl-min" : ""}">${list}
  <div class="pedit ${pubOn ? "mode-amz" : ""}">
    ${pubOn ? `<div class="phead2 amzhead"><div class="ptitle"><div class="amzt">${ic("rocket", 18)} <span>${L("Modo Amazon KDP", "Amazon KDP mode")}</span></div><h2>${esc(p.title)}</h2><small class="muted">${L("A Amazon não deixa apps publicarem por você: confira os dados, baixe os arquivos prontos e suba em kdp.amazon.com.", "Amazon doesn't let apps publish for you: check the details, download the ready files and upload them at kdp.amazon.com.")}</small></div></div>` : `<div class="phead3">
      <div class="ptitle"><input class="big-title" data-proj="title" value="${esc(p.title)}" placeholder="${L("Título do livro", "Book title")}">
        <div class="pmeta"><span class="pring" title="${target ? Math.min(100, Math.round((total / target) * 100)) : 0}%"><i style="width:${target ? Math.min(100, Math.round((total / target) * 100)) : 0}%"></i></span><span>${done}/${p.nChapters || p.chapters.length} ${L("cap.", "ch.")}</span><span>${total.toLocaleString(locale())} ${L("palavras", "words")}</span><span>~${Math.round(total / wpp())}/${p.pages || 180} ${L("pág.", "pp.")}</span>${S.busy && S.busy !== "ai" ? `<span class="nowline"><span class="spin"></span><span id="busy">${esc(tr(S.busy))}</span></span>` : ""}</div></div>
      <div class="pacts">${statusMenu(p)}${main}<button class="btn readbtn" data-act="read-proj" title="${tr("Ler tudo o que já foi produzido")}">${ic("book", 15)} <span>${L("Ler", "Read")}</span></button><button class="icon" data-act="del-proj" title="${L("Mover para a lixeira", "Move to Trash")}">${ic("trash")}</button></div>
    </div>`}
    ${!aiOn && !pubOn ? `<p class="hint warn" style="margin:0 22px 8px">${ic("cpu", 14)} O motor <b>Básico</b> não escreve o texto. Escolha Local ou Claude no chat ao lado.</p>` : ""}
    ${pubOn ? "" : `<div class="tabrow"><div class="seg ptabs">${([["idea", L("Ideia e tamanho", "Idea and length"), "compass", ""], ["cast", L("Personagens", "Characters"), "fingerprint", String(castOf(p).filter((x) => x.name).length)], ["world", L("Lugares, objetos e eventos", "Places, objects & events"), "landmark", String(worldOf(p).length)], ["write", L("Capítulos", "Chapters"), "write", String(p.chapters.length)]] as string[][]).map(([k, l, i, n]) => `<button class="${tab === k && !pubOn ? "on" : ""}" data-act="ptab" data-t="${k}" title="${esc(l)}">${ic(i, 15)}<span class="tl">${l}</span>${n ? `<em class="tc">${n}</em>` : ""}</button>`).join("")}</div>${tab === "write" && p.chapters.length ? `<div class="seg chv">${[["lista", "Visão geral"], ["editor", "Editor"]].map(([k, l]) => `<button class="${S.chview === k ? "on" : ""}" data-act="chview" data-v="${k}">${l}</button>`).join("")}</div>` : ""}</div>`}
    ${pubOn ? `<div class="pubwrap">${kdpPanel(p)}</div>` : tab === "cast" ? castEditor(p) : tab === "world" ? worldEditor(p) : tab === "idea" ? ideaTab : chapTab}
    ${pubBar(p, pubOn)}
  </div>
  ${vChat(p)}</div>`;
}

function trashPanel() {
  const t = S.projects.filter((x) => x.trashed).sort((a, b) => b.trashed! - a.trashed!);
  return `<section class="hist trash"><div class="row"><h2 style="flex:1">${ic("trash", 18)} ${L("Lixeira", "Trash")} <span>${t.length}</span></h2>${t.length ? `<button class="btn sm ghost danger" data-act="trash-empty">${L("Esvaziar lixeira", "Empty trash")}</button>` : ""}<button class="btn sm" data-act="trash-view">${L("Voltar", "Back")}</button></div>
    <p class="muted">${L("Livros apagados ficam aqui até você excluir de vez. Restaurar devolve o livro ao Estúdio com tudo (capítulos, capa, personagens, mundo).", "Deleted books stay here until you delete them for good. Restore brings the book back to the Studio with everything (chapters, cover, characters, world).")}</p>
    ${t.length ? `<div class="tlist">${t.map((x) => `<div class="titem"><div class="tthumb">${x.ebookCover || x.cover ? `<img src="${convertFileSrc(x.ebookCover || x.cover!)}">` : ic("feather", 18)}</div>
      <div class="ttx"><b>${esc(x.title || "Sem título")}</b><small class="muted">${x.chapters.length} cap · ${projWords(x).toLocaleString(locale())} ${L("palavras", "words")} · ${L("apagado em", "deleted")} ${new Date(x.trashed!).toLocaleString(locale())}</small></div>
      <button class="btn sm" data-act="trash-restore" data-id="${x.id}">${ic("undo", 14)} ${L("Restaurar", "Restore")}</button><button class="btn sm ghost danger" data-act="trash-kill" data-id="${x.id}">${ic("x", 14)} ${L("Excluir definitivamente", "Delete forever")}</button></div>`).join("")}</div>`
      : `<div class="empty"><p>${L("A lixeira está vazia.", "The trash is empty.")}</p></div>`}</section>`;
}
/** Livros aprovados no Estúdio, mostrados no Acervo. */
function approvedShelf() {
  const a = liveProjs().filter((x) => x.status === "approved");
  if (!a.length) return "";
  return `<h3 class="sec">${L("Aprovados do Estúdio", "Approved from the Studio")} <span>${a.length}</span></h3><div class="lgrid">${a.map((x) => `<div class="lcard">
    <div class="lcov livro" data-act="read-proj" data-id="${x.id}">${x.ebookCover || x.cover ? `<img src="${convertFileSrc(x.ebookCover || x.cover!)}">` : `<div class="docprev"><span class="dext">${ic("feather", 12)}</span><b>${esc(x.title || "")}</b></div>`}<span class="lbadge">${ic("check", 11)} ${L("Estúdio", "Studio")}</span><span class="lhover"><span class="btn sm primary">${ic("book", 14)} ${L("Ler", "Read")}</span></span></div>
    <div class="linfo"><div class="ttl static">${esc(x.title || L("Sem título", "Untitled"))}</div><button class="icon" title="${L("Abrir no Estúdio", "Open in Studio")}" data-act="sel-proj" data-id="${x.id}">${ic("write", 15)}</button></div>
    <small class="lmeta">${x.chapters.length} ${L("cap.", "ch.")} · ${projWords(x).toLocaleString(locale())} ${L("palavras", "words")}</small></div>`).join("")}</div>`;
}
const projWords = (x: Project) => x.chapters.reduce((n, c) => n + words(strip(c.html)), 0);
function history() {
  if (!liveProjs().length) return "";
  return `<section class="hist"><h2>Seus livros criados <span>${liveProjs().length}</span></h2><div class="grid livro">${liveProjs().map((x) => {
    const first = strip(x.chapters.find((c) => strip(c.html).trim().length > 40)?.html || "") || x.premise;
    const done = x.chapters.filter((c) => strip(c.html).trim().length > 200).length;
    return `<div class="card"><div class="thumb livro" data-act="sel-proj" data-id="${x.id}">${x.ebookCover || x.cover ? `<img src="${convertFileSrc(x.ebookCover || x.cover!)}">` : `<div class="docprev"><span class="dext">${ic("feather", 12)}</span><b>${esc(x.title || "Sem título")}</b><p>${esc(first.slice(0, 500))}</p></div>`}</div>
      <div class="ttl static">${esc(x.title || "Sem título")} ${statusTag(x)}</div>
      <div class="meta">${done}/${x.chapters.length} cap · ${projWords(x).toLocaleString(locale())} palavras · ${new Date(x.updated).toLocaleDateString(locale())}</div>
      <div class="row"><button class="btn sm" data-act="sel-proj" data-id="${x.id}">${ic("write", 14)} Editar</button><button class="icon" title="Ler" data-act="read-proj" data-id="${x.id}">${ic("book")}</button><button class="icon" title="Personagens" data-act="sel-proj" data-t="cast" data-id="${x.id}">${ic("fingerprint")}</button><button class="icon" title="Apagar projeto" data-act="del-proj" data-id="${x.id}">${ic("trash")}</button></div></div>`;
  }).join("")}</div></section>`;
}

/** Ficha dos personagens do livro novo: alimenta a IA e o esboço. */
const newCast = (name = ""): Cast => ({ id: uid(), name, role: "", age: "", appearance: "", personality: "", arc: "", links: "" });
function castOf(p: Project): Cast[] {
  if (!p.cast) p.cast = p.names.split(",").map((n) => n.trim()).filter(Boolean).map((name) => newCast(name));
  return p.cast;
}
const MBTI: Record<string, string> = {
  INTJ: "The Architect — strategic, independent, always has a plan", INTP: "The Logician — analytical, curious, lives in their head", ENTJ: "The Commander — bold, decisive, born leader", ENTP: "The Debater — witty, provocative, loves ideas and arguments",
  INFJ: "The Advocate — idealistic, insightful, private and intense", INFP: "The Mediator — sensitive, imaginative, guided by values", ENFJ: "The Protagonist — charismatic, protective, inspires others", ENFP: "The Campaigner — enthusiastic, spontaneous, warm",
  ISTJ: "The Logistician — dutiful, reliable, follows the rules", ISFJ: "The Defender — loyal, caring, quietly protective", ESTJ: "The Executive — organized, direct, takes charge", ESFJ: "The Consul — sociable, attentive, needs harmony",
  ISTP: "The Virtuoso — practical, calm under pressure, a loner", ISFP: "The Adventurer — gentle, artistic, lives in the moment", ESTP: "The Entrepreneur — daring, energetic, acts before thinking", ESFP: "The Entertainer — fun, impulsive, loves attention",
};
const CAST_FIELDS: [keyof Cast, string, string][] = [["role", "Role", "role in the story"], ["age", "Age", ""], ["gender", "Gender", ""], ["height", "Height", "e.g. 1.68 m / 5'6\""], ["build", "Build", "body type"], ["occupation", "Occupation", ""],
  ["appearance", "Appearance", "face, hair, eyes, style, distinctive marks"], ["personality", "Personality", "temperament, habits, contradictions"], ["mbti", "MBTI", "four-letter type, e.g. INFJ"], ["mbtiWhy", "Why this type", "how the type shows in their behaviour"],
  ["goal", "Goal", "what they want"], ["fear", "Fear", "what they dread most"], ["arc", "Secret / arc", "what they hide, how they change"], ["speech", "Speech", "how they talk: slang, rhythm, catchphrases"], ["links", "Relationships", "with the other characters"]];
function castText(p: Project) {
  const c = castOf(p).filter((x) => x.name.trim());
  if (!c.length) return p.names ? `Characters: ${p.names}` : "";
  return "Cast of this book (stay consistent with these sheets):\n" + c.map((x) => `- ${x.name}: ` + CAST_FIELDS.filter(([k]) => x[k]).map(([k, l]) => `${l.toLowerCase()}: ${x[k]}`).join("; ")).join("\n");
}
/** Lê blocos "### Nome" + "Campo: valor" (Claude e modelos locais seguem bem esse formato). */
function parseCast(text: string) {
  const lab: Record<string, keyof Cast> = { name: "name", role: "role", age: "age", gender: "gender", sex: "gender", height: "height", build: "build", body: "build", "body type": "build", occupation: "occupation", job: "occupation",
    appearance: "appearance", looks: "appearance", personality: "personality", mbti: "mbti", "personality type": "mbti", "mbti type": "mbti", "why this type": "mbtiWhy", why: "mbtiWhy", "mbti explanation": "mbtiWhy",
    goal: "goal", want: "goal", wants: "goal", fear: "fear", fears: "fear", "secret / arc": "arc", "secret/arc": "arc", secret: "arc", arc: "arc", speech: "speech", voice: "speech", relationships: "links", relationship: "links" };
  const out: Partial<Cast>[] = [];
  let cur: Partial<Cast> | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\*\*|__/g, "").trim();
    if (!line || /^[-=*_]{3,}$/.test(line)) continue;
    const h = line.match(/^#{1,4}\s*(?:\d+[.)]\s*)?(.+)$/);
    if (h) { cur = { name: h[1].replace(/\s*[—–-]\s*.*$/, "").trim() }; out.push(cur); continue; }
    const m = line.match(/^[-*•]?\s*([A-Za-z /]{2,24}?)\s*:\s*(.+)$/);
    if (!m) continue;
    const k = lab[m[1].toLowerCase().trim()];
    if (!k) continue;
    if (k === "name") { cur = { name: m[2].trim() }; out.push(cur); continue; }
    if (!cur) continue;
    if (k === "mbti") { const t = m[2].toUpperCase().match(/\b[EI][NS][TF][JP]\b/); if (t) { cur.mbti = t[0]; const rest = m[2].replace(/^.*?\b[EIei][NSns][TFtf][JPjp]\b(-[AT])?\s*[—–:\-]?\s*/, "").trim(); if (rest && !cur.mbtiWhy) cur.mbtiWhy = rest; } continue; }
    (cur as any)[k] = m[2].trim();
  }
  return out.filter((c) => c.name && c.name.length < 50 && Object.keys(c).length >= 4);
}
function mergeCast(p: Project, list: Partial<Cast>[], overwrite = false) {
  const cur = castOf(p);
  for (const o of list) {
    const lo = o.name!.toLowerCase();
    let x = cur.find((c) => c.name.toLowerCase() === lo) || cur.find((c) => c.name && (lo.startsWith(c.name.toLowerCase() + " ") || c.name.toLowerCase().startsWith(lo + " ")));
    if (x && x.name.length < o.name!.length) x.name = o.name!;
    if (!x) { x = newCast(o.name); cur.push(x); }
    for (const [k] of CAST_FIELDS) if (o[k] && (overwrite || !x[k])) (x as any)[k] = o[k];
  }
  p.names = cur.map((c) => c.name).filter(Boolean).join(", ");
}
const CAST_FORMAT = `For each character output a block exactly like this (English, no other text):
### Full Name
Role: ...
Age: ...
Gender: ...
Height: ... (metric and feet/inches)
Build: ...
Occupation: ...
Appearance: face, hair, eyes, style, one distinctive detail
Personality: 2-3 sentences, with contradictions and habits
MBTI: XXXX
Why this type: 1-2 sentences on how this type shows in their behaviour
Goal: ...
Fear: ...
Secret / arc: what they hide and how they change
Speech: how they talk (rhythm, slang, catchphrases)
Relationships: with the other characters`;
/** Quantas vezes cada nome aparece no texto já escrito (primeiro nome, sem apelido entre aspas). */
function mentionCounter(p: Project) {
  const txt = p.chapters.map((c) => strip(c.html)).join("\n");
  return (name: string) => { const k = name.replace(/["“”].*?["“”]/g, " ").trim().split(/\s+/)[0]; if (!k || !txt) return 0; return (txt.match(new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) || []).length; };
}
const initials = (n: string) => n.replace(/["“”].*?["“”]/g, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
const hue = (n: string) => [...n].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
const showAge = (a?: string) => a ? (/^\d+$/.test(a.trim()) ? a.trim() + "y" : a) : "";
const chev = `<span class="chev"></span>`;
/** Edição explícita: nada é salvo até clicar em Salvar; sair sem salvar descarta. */
function leaveEdit() {
  const e = S.edit; if (!e) return true;
  if (e.dirty && !confirm(tr("Descartar as alterações não salvas?"))) return false;
  if (e.isNew) { const p = proj(); if (p) { if (e.kind === "cast") p.cast = castOf(p).filter((c) => c.id !== e.id); else p.world = worldOf(p).filter((w) => w.id !== e.id); saveProjects(); } }
  S.edit = null; return true;
}
const editBar = () => `<div class="editbar"><span class="muted">${ic("pen", 13)} ${tr("Editando — só salva ao clicar em Salvar (⌘S)")}</span><button class="btn" data-act="edit-cancel">${tr("Cancelar")}</button><button class="btn primary" data-act="edit-save">${ic("check", 15)} ${tr("Salvar")}</button></div>`;
function castBody(p: Project, x: Cast) {
  const F = (k: keyof Cast) => CAST_FIELDS.find((f) => f[0] === k)!;
  const short: (keyof Cast)[] = ["role", "age", "gender", "height", "build", "occupation"];
  const long: (keyof Cast)[] = ["appearance", "personality", "goal", "fear", "arc", "speech", "links"];
  if (S.edit?.id === x.id) {
    const d = S.edit.draft as Cast;
    const inp = (k: keyof Cast) => `<label class="fld"><span>${tr(F(k)[1])}</span><input data-ed="${k}" value="${esc(d[k] || "")}" placeholder="${esc(F(k)[2])}"></label>`;
    const area = (k: keyof Cast, rows = 3) => `<label class="fld"><span>${tr(F(k)[1])}</span><textarea rows="${rows}" data-ed="${k}" placeholder="${esc(F(k)[2])}">${esc(d[k] || "")}</textarea></label>`;
    return `<div class="accbody editing"><label class="fld"><span>${tr("Nome")}</span><input class="cname" data-ed="name" value="${esc(d.name)}" placeholder="${tr("Nome")}"></label>
      <div class="cgrid">${short.map(inp).join("")}</div>
      <div class="mbtibox"><label class="fld"><span>${tr("Tipo de personalidade (MBTI)")}</span><select data-ed="mbti"><option value="">—</option>${Object.keys(MBTI).map((t) => `<option ${d.mbti === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <div class="mbtidesc">${d.mbti && MBTI[d.mbti] ? `<b>${esc(MBTI[d.mbti])}</b>` : `<span class="muted">${tr("Escolha um tipo ou deixe a IA definir")}</span>`}</div>${area("mbtiWhy", 2)}</div>
      <div class="dgrid">${long.map((k) => area(k)).join("")}</div>${editBar()}</div>`;
  }
  const empty = CAST_FIELDS.filter(([k]) => !x[k]).length;
  const facts = short.filter((k) => x[k]);
  return `<div class="accbody"><div class="acctools"><button class="btn sm primary" data-act="edit-start" data-kind="cast" data-id="${x.id}">${ic("pen", 14)} ${tr("Editar")}</button>
      ${S.settings.mode !== "offline" && empty ? `<button class="btn sm" data-act="cast-fill" data-id="${x.id}" ${S.writing ? "disabled" : ""}>${ic("sparkles", 14)} ${tr("Preencher")} ${empty} ${tr(empty === 1 ? "campo vazio com IA" : "campos vazios com IA")}</button>` : ""}
      <span class="grow"></span><button class="icon" data-act="cast-del" data-id="${x.id}" title="${tr("Remover")}">${ic("trash")}</button></div>
    ${facts.length ? `<dl class="facts">${facts.map((k) => `<div><dt>${tr(F(k)[1])}</dt><dd>${esc(x[k] || "")}</dd></div>`).join("")}</dl>` : ""}
    ${x.mbti ? `<div class="mbtiread"><span class="mbti">${esc(x.mbti)}</span><div><b>${esc(MBTI[x.mbti] || "")}</b>${x.mbtiWhy ? `<p>${esc(x.mbtiWhy)}</p>` : ""}</div></div>` : ""}
    <div class="prose2">${long.filter((k) => x[k]).map((k) => `<section><h4>${tr(F(k)[1])}</h4><p>${esc(x[k] || "")}</p></section>`).join("")}</div>
    ${!facts.length && !long.some((k) => x[k]) ? `<p class="muted">${tr("Ficha vazia — clique em Editar ou preencha com IA.")}</p>` : ""}</div>`;
}
function castEditor(p: Project) {
  const c = castOf(p), count = mentionCounter(p), hasText = p.chapters.some((ch) => strip(ch.html).trim().length > 50);
  return `<div class="castwrap"><div class="row acctop"><p class="muted" style="flex:1;margin:0">${tr("Clique num personagem para abrir a ficha. As fichas entram no roteiro, nos capítulos e no chat.")}</p>
    <button class="btn" data-act="cast-add">${ic("plus")} ${tr("Personagem")}</button>${S.settings.mode !== "offline" ? `<button class="btn primary" data-act="cast-ai" ${S.writing ? "disabled" : ""}>${ic("sparkles")} ${tr(c.length ? "Completar elenco com IA" : "Criar elenco com IA")}</button>` : ""}</div>
    ${c.length ? `<div class="acc">${c.map((x) => { const open = x.id === S.castOpen, n = count(x.name), filled = CAST_FIELDS.filter(([k]) => x[k]).length;
      return `<div class="accitem ${open ? "open" : ""} ${S.edit?.id === x.id ? "isedit" : ""}"><button class="acchead" data-act="cast-open" data-id="${x.id}"><span class="avatar" style="--h:${hue(x.name)}">${esc(initials(x.name) || "?")}</span>
        <span class="mtx"><b>${esc(x.name || tr("Sem nome"))}</b><small>${esc([x.gender, showAge(x.age), x.role].filter(Boolean).join(" · ") || "—")}</small></span>
        <span class="chips">${x.mbti ? `<i class="mbti sm">${esc(x.mbti)}</i>` : ""}${hasText ? `<i class="chip">${n} ${tr(n === 1 ? "menção" : "menções")}</i>` : ""}<i class="chip ${filled < CAST_FIELDS.length ? "warn" : ""}" title="${tr("campos preenchidos")}">${filled}/${CAST_FIELDS.length}</i></span>${chev}</button>
        ${open ? castBody(p, x) : ""}</div>`; }).join("")}</div>`
      : `<div class="empty"><div class="big">${ic("fingerprint")}</div><p>${tr("Nenhum personagem ainda. Adicione ou peça para a IA criar a partir da premissa.")}</p></div>`}</div>`;
}

// ---------- mundo: lugares, objetos, organizações, regras… ----------
const WORLD_KINDS = ["Local", "Objeto", "Evento"];
type WG = "place" | "object" | "event" | "other";
const kindGroup = (k: string): WG => (k === "Local" ? "place" : k === "Objeto" || k === "Tecnologia" ? "object" : k === "Evento" || k === "Evento passado" ? "event" : "other");
const WGROUPS: [WG, string, string, string, string][] = [["place", "Lugares", "Places", "landmark", "Local"], ["object", "Objetos", "Objects", "tag", "Objeto"], ["event", "Eventos", "Events", "compass", "Evento"], ["other", "Outros", "Other", "globe", "Outro"]];
const WORLD_ICON: Record<string, string> = { "Local": "landmark", "Objeto": "tag", "Evento": "compass", "Organização": "blocks", "Regra / lore": "book", "Evento passado": "compass", "Criatura": "fingerprint", "Tecnologia": "cpu" };
const worldOf = (p: Project) => (p.world ||= []);
function worldText(p: Project, focus = "") {
  const w = worldOf(p).filter((x) => x.name.trim()); if (!w.length) return "";
  const f = focus.toLowerCase();
  const ranked = [...w].sort((a, b) => +f.includes(b.name.toLowerCase()) - +f.includes(a.name.toLowerCase()));
  return "World of this book (places, objects, rules — keep consistent):\n" + ranked.slice(0, 14).map((x) => `- [${x.kind}] ${x.name}: ${x.desc}${x.details ? " " + x.details.slice(0, 220) : ""}${x.links ? ` (linked: ${x.links})` : ""}`).join("\n");
}
function worldBody(x: World) {
  if (S.edit?.id === x.id) {
    const d = S.edit.draft as World;
    return `<div class="accbody editing"><div class="cgrid"><label class="fld"><span>${tr("Nome")}</span><input class="cname" data-ed="name" value="${esc(d.name)}"></label><label class="fld"><span>${tr("Tipo")}</span><select data-ed="kind">${[...new Set([...WORLD_KINDS, d.kind].filter(Boolean))].map((k) => `<option value="${esc(k)}" ${k === d.kind ? "selected" : ""}>${esc(({ Local: L("Lugar", "Place"), Objeto: L("Objeto", "Object"), Evento: L("Evento", "Event"), "Evento passado": L("Evento", "Event") } as Record<string, string>)[k] || tr(k))}</option>`).join("")}</select></label></div>
      <label class="fld"><span>${tr("Descrição")}</span><textarea rows="3" data-ed="desc" placeholder="What it is, what it looks/feels like">${esc(d.desc)}</textarea></label>
      <label class="fld"><span>${tr("Detalhes, regras e segredos")}</span><textarea rows="4" data-ed="details" placeholder="History, rules, what is hidden, how it matters to the plot">${esc(d.details)}</textarea></label>
      <label class="fld"><span>${tr("Ligado a (personagens, capítulos)")}</span><input data-ed="links" value="${esc(d.links)}"></label>${editBar()}</div>`;
  }
  const thin = !x.desc || !x.details;
  return `<div class="accbody"><div class="acctools"><button class="btn sm primary" data-act="edit-start" data-kind="world" data-id="${x.id}">${ic("pen", 14)} ${tr("Editar")}</button>
      ${S.settings.mode !== "offline" && thin ? `<button class="btn sm" data-act="world-fill" data-id="${x.id}" ${S.writing ? "disabled" : ""}>${ic("sparkles", 14)} ${tr("Completar com IA")}</button>` : ""}
      <span class="grow"></span><button class="icon" data-act="world-del" data-id="${x.id}" title="${tr("Remover")}">${ic("trash")}</button></div>
    <div class="prose2">${x.desc ? `<section><h4>${tr("Descrição")}</h4><p>${esc(x.desc)}</p></section>` : ""}${x.details ? `<section><h4>${tr("Detalhes, regras e segredos")}</h4><p>${esc(x.details)}</p></section>` : ""}${x.links ? `<section><h4>${tr("Ligado a (personagens, capítulos)")}</h4><p>${esc(x.links)}</p></section>` : ""}</div>
    ${!x.desc && !x.details ? `<p class="muted">${tr("Vazio — clique em Editar ou complete com IA.")}</p>` : ""}</div>`;
}
/** Lugares e objetos que a IA encontrou nos capítulos e ainda não estão no Mundo. */
function foundInText(p: Project, hasText: boolean) {
  if (!hasText) return "";
  const an = S.analysis[p.id];
  if (!an?.ledger.length) return S.settings.mode === "offline" ? "" : `<div class="foundbox"><span class="avatar wk">${ic("globe", 16)}</span><div><b>${L("Encontre o mundo que já está no texto", "Find the world already in the text")}</b><small class="muted">${L("A IA lê cada capítulo uma vez (barato) e lista os lugares, objetos e eventos — o mesmo mapa da tela Mapa e análise.", "The AI reads each chapter once (cheap) and lists the places, objects and events — the same map as the Map & analysis screen.")}</small></div><button class="btn sm" data-act="ledger-proj" ${S.writing ? "disabled" : ""}>${ic("sparkles", 14)} ${L("Mapear capítulos", "Map chapters")}</button></div>`;
  const miss = storyEls(p.id).filter((e) => e.group !== "event" && !inWorld(p, e.name));
  if (!miss.length) return "";
  return `<details class="foundbox mini"><summary><span class="avatar wk">${ic("globe", 14)}</span><b>${L(`${miss.length} itens dos capítulos fora do Mundo`, `${miss.length} items from the chapters aren't in the World`)}</b><small class="muted">${L("ver", "view")}</small><span class="grow"></span><button class="btn sm primary" data-act="el-world-all">${ic("plus", 13)} ${L("Adicionar todos", "Add all")}</button></summary>
    <div class="chipsw">${miss.slice(0, 14).map((e) => `<button class="chip" data-act="el-world" data-g="${e.group}" data-n="${esc(e.name)}" title="${L("Adicionar", "Add")}">${ic(e.group === "place" ? "landmark" : "tag", 11)} ${esc(e.name)} ${ic("plus", 10)}</button>`).join("")}${miss.length > 14 ? `<i class="chip">+${miss.length - 14}</i>` : ""}</div></details>`;
}
function worldEditor(p: Project) {
  const w = worldOf(p), count = mentionCounter(p), hasText = p.chapters.some((ch) => strip(ch.html).trim().length > 50);
  const thin = w.filter((x) => x.name && !x.desc).length, led = S.analysis[p.id]?.ledger || [];
  const newFound = led.length ? storyEls(p.id).filter((e) => (e.group === "place" || e.group === "object") && e.chapters.length >= 2 && !inWorld(p, e.name)).length : 0;
  const aiBtn = S.settings.mode === "offline" ? "" : `<button class="btn primary" data-act="world-ai" ${S.writing ? "disabled" : ""}>${S.writing === "world" ? `<span class="spin"></span>` : ic("sparkles")} ${!w.length ? (hasText ? L("Criar a partir dos capítulos", "Create from the chapters") : L("Criar com IA", "Create with AI")) : thin ? L(`Descrever ${thin} com IA`, `Describe ${thin} with AI`) : newFound ? L(`Atualizar com os capítulos (${newFound} novos)`, `Update from the chapters (${newFound} new)`) : L("Completar com IA", "Complete with AI")}</button>`;
  const item = (x: World) => { const open = x.id === S.worldOpen, n = count(x.name);
    return `<div class="accitem ${open ? "open" : ""} ${S.edit?.id === x.id ? "isedit" : ""}"><button class="acchead" data-act="world-open" data-id="${x.id}"><span class="avatar wk">${ic(WORLD_ICON[x.kind] || "globe", 16)}</span><span class="mtx"><b>${esc(x.name || tr("Sem nome"))}</b><small>${esc(x.desc || L("sem descrição ainda", "no description yet"))}</small></span>
      <span class="chips">${hasText ? `<i class="chip">${n} ${tr(n === 1 ? "menção" : "menções")}</i>` : ""}</span>${chev}</button>${open ? worldBody(x) : ""}</div>`; };
  const timeline = led.length ? `<details class="wtl"><summary>${ic("compass", 13)} ${L(`O que acontece em cada capítulo (${led.reduce((n, c) => n + (c.events?.length || 0), 0)} eventos)`, `What happens in each chapter (${led.reduce((n, c) => n + (c.events?.length || 0), 0)} events)`)}</summary>
      ${led.map((c) => `<div class="wtl-r"><button class="mnum" data-act="w-ch" data-i="${c.i}" title="${L("Abrir o capítulo", "Open the chapter")}">${c.i + 1}</button><ul>${(c.events || []).map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`).join("")}</details>` : "";
  const sections = WGROUPS.map(([g, pt, en, icn, kind]) => { const list = w.filter((x) => kindGroup(x.kind) === g); if (g === "other" && !list.length) return "";
    return `<section class="wsec"><div class="wsec-h">${ic(icn, 15)}<b>${L(pt, en)}</b><span class="muted">${list.length}</span><span class="grow"></span>${g !== "other" ? `<button class="btn sm ghost" data-act="world-add" data-k="${kind}">${ic("plus", 13)} ${g === "place" ? L("Lugar", "Place") : g === "object" ? L("Objeto", "Object") : L("Evento", "Event")}</button>` : ""}</div>
      ${list.length ? `<div class="acc">${list.map(item).join("")}</div>` : `<p class="muted wempty">${g === "place" ? L("Nenhum lugar ainda.", "No places yet.") : g === "object" ? L("Nenhum objeto ainda.", "No objects yet.") : L("Nenhum evento ainda — eventos do passado que marcam a história e as grandes viradas.", "No events yet — past events that shape the story and the big turning points.")}</p>`}
      ${g === "event" ? timeline : ""}</section>`; }).join("");
  return `<div class="castwrap"><div class="row acctop"><p class="muted" style="flex:1;margin:0">${L("Os lugares, objetos e eventos deste livro. A IA usa isso em todo capítulo para manter tudo coerente — e atualiza sozinha conforme os capítulos são escritos.", "This book's places, objects and events. The AI uses them in every chapter to keep everything consistent — and updates them as chapters are written.")}</p>${aiBtn}</div>
    ${foundInText(p, hasText)}<div class="wgrid">${sections}</div></div>`;
}
function parseWorld(text: string) {
  const out: Partial<World>[] = []; let cur: Partial<World> | null = null;
  const lab: Record<string, keyof World> = { type: "kind", kind: "kind", description: "desc", desc: "desc", details: "details", "details / secrets": "details", secrets: "details", rules: "details", linked: "links", links: "links", "linked to": "links" };
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\*\*|__/g, "").trim(); if (!line) continue;
    const h = line.match(/^#{1,4}\s*(?:\d+[.)]\s*)?(.+)$/); if (h) { cur = { name: h[1].trim() }; out.push(cur); continue; }
    const m = line.match(/^[-*•]?\s*([A-Za-z /]{2,20}?)\s*:\s*(.+)$/); if (!m || !cur) continue;
    const k = lab[m[1].toLowerCase().trim()]; if (k) (cur as any)[k] = m[2].trim();
  }
  const KMAP: Record<string, string> = { location: "Local", place: "Local", object: "Objeto", item: "Objeto", organization: "Organização", organisation: "Organização", group: "Organização", lore: "Regra / lore", rule: "Regra / lore", rules: "Regra / lore", event: "Evento", "past event": "Evento", "turning point": "Evento", creature: "Criatura", technology: "Objeto" };
  return out.filter((x) => x.name && x.desc).map((x) => ({ ...x, kind: KMAP[(x.kind || "").toLowerCase()] || x.kind || "Outro" }));
}
const WORLD_FORMAT = `For each element output a block exactly like this (English, no other text):
### Name
Type: Place / Object / Event
Description: for a place or object, what it looks, sounds and feels like so a reader can picture it; for an event, what happens (1-2 sentences)
Details: history, rules, what is hidden, how it matters to the plot (2-3 sentences)
Linked to: characters involved, and the chapter numbers if known`;

function fmtReset(ts?: number) { if (!ts) return ""; const m = Math.max(0, Math.round((ts * 1000 - Date.now()) / 60000)); return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${Math.round(m / 1440)}d`; }
function usageHtml() {
  const u = S.usage, w = u.limits?.unifiedWindows || {};
  const bar = (label: string, x: any) => x ? `<div class="ubar ${x.utilization > 0.85 ? "hot" : x.utilization > 0.6 ? "warm" : ""}"><span>${label}</span><i><b style="width:${Math.round(x.utilization * 100)}%"></b></i><em>${Math.round(x.utilization * 100)}%</em><small>${tr("zera em")} ${fmtReset(x.resetsAt)}</small></div>` : "";
  const ago = u.lastAt ? Math.round((Date.now() - u.lastAt) / 60000) : -1;
  return `${bar("5h", w.five_hour)}${bar(L("Semana", "Week"), w.seven_day)}${!w.five_hour ? `<div class="muted usm">${tr("Limites ainda não lidos — clique em atualizar")}</div>` : ""}
    <div class="usm muted">${u.calls ? `${L("Nesta sessão", "This session")}: ${u.calls} ${L("chamadas", "calls")} · ${Math.round(u.inTok / 1000)}k in · ${Math.round(u.outTok / 1000)}k out · ` : ""}${ago >= 0 ? `${L("atualizado há", "updated")} ${ago} min${isEn() ? " ago" : ""}` : ""}</div>`;
}
function claudeBar() {
  return `<div class="cbarbox"><div class="row"><span class="muted">${tr("Esforço")}</span><select class="engsel" data-effort>${EFFORTS.map(([v, l]) => `<option value="${v}" ${effortOf() === v ? "selected" : ""}>${tr(l)}${v === "medium" ? " ★" : ""}</option>`).join("")}</select>
    <button class="icon" data-act="usage-refresh" title="${tr("Atualizar limites")}">${S.usage.pinging ? `<span class="spin"></span>` : "↻"}</button></div><div id="usage">${usageHtml()}</div></div>`;
}
function paintUsage() { const el = document.getElementById("usage"); if (el) el.innerHTML = usageHtml(); const b = document.querySelector('[data-act="usage-refresh"]'); if (b) b.innerHTML = S.usage.pinging ? `<span class="spin"></span>` : "↻"; }
const CHAT_QUICK = ["chapter", "continue", "revise", "synopsis"];
function engineSelect() {
  return `<select class="engsel" data-set-mode>${ENGINES.map((e) => { const [ok, st] = engineStatus(e.id); return `<option value="${e.id}" ${S.settings.mode === e.id ? "selected" : ""}>${e.name}${ok ? "" : " — " + st}</option>`; }).join("")}</select>`;
}
function vChat(p: Project) {
  const mode = S.settings.mode as Mode;
  const size = S.settings.chatSize === "min" ? "min" : "normal";
  if (size === "min") return `<aside class="chat rail"><button class="icon" data-act="chat-size" data-v="normal" title="${tr("Abrir assistente")}">«</button><button class="railbtn" data-act="chat-size" data-v="normal" title="${tr("Abrir assistente")}">${S.busy || S.writing ? `<span class="spin"></span>` : ic("sparkles", 18)}<span>${tr("Assistente")}</span></button>${p.chat.length ? `<i class="railn">${p.chat.length}</i>` : ""}</aside>`;
  const head = `<div class="chead"><h3>Assistente</h3>${engineSelect()}<button class="icon" data-act="picker" title="Detalhes dos motores">${ic("sliders")}</button><button class="icon" data-act="chat-size" data-v="min" title="${tr("Minimizar")}">—</button></div>${mode === "claude" ? claudeBar() : ""}`;
  if (mode === "offline") return `<aside class="chat">${head}<p class="muted">Modo Básico (sem IA): usa o perfil de estilo e o texto do acervo. Não escreve capítulos.</p>
    <button class="btn w" data-act="outline">${ic("compass")} Roteiro modelo</button><button class="btn w" data-act="scaffold">${ic("blocks")} Rascunho guiado do capítulo</button><button class="btn w" data-act="check-chap">${ic("fingerprint")} Checar estilo do capítulo</button><button class="btn w" data-act="kdp-offline">${ic("tag")} Descrição e keywords KDP</button>
    <p class="muted">Para escrever o livro, troque acima para <b>Local</b> (grátis) ou <b>Claude</b>.</p></aside>`;
  const [ok, st] = engineStatus(mode);
  const here = S.busy === "ai" && S.aiProj === p.id, elsewhere = S.busy === "ai" && S.aiProj && S.aiProj !== p.id ? S.projects.find((x) => x.id === S.aiProj) : null;
  const ch = p.chapters[S.chap];
  const QI: Record<string, string> = { chapter: "write", continue: "feather", revise: "fingerprint", synopsis: "book" };
  const ideas = [L("Deixe o capítulo atual mais tenso", "Make the current chapter tenser"), L("Sugira um plot twist para o meio do livro", "Suggest a plot twist for the middle of the book"), L("Quem é o personagem mais fraco e como melhorar?", "Which character is weakest and how can I improve them?")];
  const msgs = p.chat.map((m, i) => `<div class="msg ${m.role}">${m.role === "assistant" && m.by ? `<div class="msgby">${ic("cpu", 11)} ${esc(m.by)}</div>` : ""}${m.role === "assistant" ? marked.parse(m.content) : esc(m.content)}${m.role === "assistant" ? `<div class="mact"><button data-act="ins" data-i="${i}">${ic("plus", 12)} ${tr("Inserir no capítulo")}</button><button data-act="copy" data-i="${i}">${ic("clipboard", 12)} ${tr("Copiar")}</button></div>` : ""}</div>`).join("");
  return `<aside class="chat">${head}
    <div class="cbook" title="${L("Tudo neste chat usa só este livro. Ao trocar de livro, o chat troca junto.", "Everything in this chat uses only this book. Switch books and the chat switches too.")}">${bookCov(p, "sm")}<div><small>${L("Conversando sobre", "Talking about")}</small><b>${esc(p.title || L("Sem título", "Untitled"))}</b>${ch ? `<em>${L("Capítulo", "Chapter")} ${S.chap + 1}${ch.title ? " · " + esc(ch.title) : ""}</em>` : ""}</div>${ic("link", 14)}</div>
    ${ok ? "" : `<p class="hint warn">${esc(st)} — <a href="#" data-act="picker">${L("configurar", "set up")}</a></p>`}
    ${elsewhere ? `<p class="hint">${ic("cpu", 13)} ${L(`A IA está respondendo no livro “${esc(elsewhere.title)}”. A resposta fica salva lá.`, `The AI is answering in “${esc(elsewhere.title)}”. The answer is saved there.`)}</p>` : ""}
    <div class="quick">${QUICK.filter((q) => CHAT_QUICK.includes(q.id)).map((q) => `<button data-act="quick" data-q="${q.id}">${ic(QI[q.id] || "sparkles", 13)} ${q.label}</button>`).join("")}</div>
    <div class="msgs" id="msgs">${actsHtml()}${p.chat.length || S.acts.length || here ? "" : `<div class="cempty"><span class="cspark">${ic("sparkles", 20)}</span><b>${L("Pergunte qualquer coisa sobre este livro", "Ask anything about this book")}</b><small>${L("A IA conhece o estilo do autor, as fichas e o roteiro.", "The AI knows the author's style, the character sheets and the outline.")}</small>${ideas.map((t) => `<button class="cidea" data-act="chat-idea" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div>`}${msgs}
    ${here ? `<div class="msg assistant live"><div class="msgby">${ic("cpu", 11)} ${esc(engName())}</div><div id="live">${marked.parse(S.aiText || "…")}</div></div>` : ""}</div>
    <div class="composer"><textarea id="ask" rows="2" placeholder="${L("Peça algo: ‘deixe o capítulo 3 mais tenso’…", "Ask something: ‘make chapter 3 tenser’…")}"></textarea>
      <div class="cmpbar"><span class="talkto" title="${L("A IA que vai responder", "The AI that will answer")}">${ic("cpu", 12)} <b>${esc(engName())}</b></span><span class="grow"></span><button class="icon" data-act="clear-chat" title="${L("Limpar conversa", "Clear chat")}">${ic("broom")}</button>${S.busy === "ai" ? `<button class="btn sm" data-act="stop">${ic("stop", 13)} ${L("Parar", "Stop")}</button>` : `<button class="sendb" data-act="send" title="${L("Enviar", "Send")}">${ic("send", 16)}</button>`}</div></div></aside>`;
}
after.estudio = () => {
  const ed = $("#ed");
  if (ed) ed.oninput = () => { if (S.edit?.kind === "text") { S.edit.draft.html = ed.innerHTML; S.edit.dirty = true; } };
  const m = $("#msgs"); if (m) m.scrollTop = m.scrollHeight;
};

// ---------- KDP ----------
/** Ficha de texto com tudo o que o formulário da KDP pede, na ordem das telas da KDP. */
function kdpSheet(p: Project, pages: number) {
  const k = p.kdp, d = wrapOf(p), m = kdpDims(d.trim, pages, d.paper), au = S.author.pen || S.author.name || "";
  const ai = S.settings.mode !== "offline";
  return [`KDP — ${p.title}`, "=".repeat(40), "",
    "1) DETAILS (Kindle eBook and Paperback)", `Language: ${({ en: "English", pt: "Portuguese", es: "Spanish" } as any)[k.lang] || k.lang}`, `Book title: ${p.title}`, `Subtitle: ${p.subtitle || "-"}`, `Series: ${k.series || "-"}`, `Author: ${au}`, "",
    "Description:", k.description.trim(), "",
    "Publishing rights: I own the copyright and I hold the necessary publishing rights.",
    "Keywords (7 boxes):", ...(k.keywords.filter(Boolean).length ? k.keywords.filter(Boolean).map((x, i) => `  ${i + 1}. ${x}`) : ["  (empty — use “Fill” on the app's KDP screen)"]), "",
    "Categories (choose up to 3 in KDP's list, closest to these):", ...(k.categories.filter(Boolean).length ? k.categories.filter(Boolean).map((x) => `  - ${x}`) : ["  (empty — use “Fill” on the app's KDP screen)"]), "",
    `AI-generated content: KDP asks this — answer YES for ${ai ? "Text (written with AI assistance) and " : ""}Images (cover art generated with AI). Say which parts and how much you edited.`, "",
    "2) CONTENT — Kindle eBook", `Manuscript: ${p.title} - kindle.epub`, `Kindle eBook cover: ${p.title} - kindle cover.jpg (1600 x 2560)`, "",
    "2) CONTENT — Paperback", "ISBN: get a free KDP ISBN (or use your own)", `Ink and paper: Black & white interior, ${d.paper === "white" ? "white" : "cream"} paper`, `Trim size: ${d.trim.replace("x", " x ")} in`, "Bleed settings: No bleed", "Paperback cover finish: matte (or glossy, your choice)",
    `Manuscript: ${p.title} - paperback interior.pdf (${pages} pages)`, `Book cover: "Upload a cover you already have" → ${p.title} - paperback cover.pdf`, `  Full cover size: ${m.W.toFixed(3)} x ${m.H.toFixed(3)} in · spine ${m.spine.toFixed(3)} in · ${m.spineText ? "spine text allowed" : "spine too thin for text (under 79 pages)"}`,
    "Then click Launch Previewer, check every page, and approve.", "",
    "3) RIGHTS & PRICING", `Price: US$ ${k.price || "4.99"} (eBook 70% royalty needs US$ 2.99–9.99)`, "Paperback: KDP shows the minimum price after the printing cost — set it above that.", ""].join("\n");
}
function kdpPanel(p: Project) {
  const k = p.kdp, e = S.kdpEdit as KdpDraft | null, d = wrapOf(p);
  const author = S.author.pen || S.author.name || "";
  const miss = `<span class="kmiss">${L("falta", "missing")}</span>`;
  const row = (label: string, val: string, ok = true) => `<div class="krow"><span>${label}</span><div>${ok ? val : miss}</div></div>`;
  const chips = (l: string[]) => l.filter(Boolean).map((x) => `<span class="kchip">${esc(x)}</span>`).join("");
  const kws = k.keywords.filter(Boolean), cats = k.categories.filter(Boolean);
  const langs: [string, string][] = [["en", L("Inglês", "English")], ["pt", L("Português", "Portuguese")], ["es", L("Espanhol", "Spanish")]];
  const sizes = Object.keys(TRIMS).map((t) => [t, t.replace("x", " × ") + '"']);
  const pages = d.pages, spine = kdpDims(d.trim, pages, d.paper).spine;
  const missing = [!p.title, !author, !k.description.trim(), kws.length < 7, !cats.length, !k.price].filter(Boolean).length;
  // 1. dados — leitura (padrão) ou edição (só depois de clicar Editar)
  const details = e ? `<div class="kform">
      <div class="form2"><label class="fld"><span>${L("Título", "Title")}</span><input data-kd="title" value="${esc(e.title)}"></label><label class="fld"><span>${L("Subtítulo", "Subtitle")}</span><input data-kd="subtitle" value="${esc(e.subtitle)}"></label>
      <label class="fld"><span>${L("Autor", "Author")}</span><input data-kd="author" value="${esc(e.author)}"></label><label class="fld"><span>${L("Série (opcional)", "Series (optional)")}</span><input data-kd="series" value="${esc(e.series)}"></label>
      <label class="fld"><span>${L("Idioma", "Language")}</span><select data-kd="lang">${langs.map(([v, l]) => `<option value="${v}" ${e.lang === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="fld"><span>${L("Preço do ebook (US$) — entre 2.99 e 9.99 rende 70%", "Ebook price (US$) — 2.99 to 9.99 earns 70%")}</span><input data-kd="price" value="${esc(e.price)}" placeholder="4.99"></label>
      <label class="fld"><span>${L("Tamanho do impresso", "Paperback size")}</span><select data-kd="trim">${sizes.map(([v, l]) => `<option value="${v}" ${e.trim === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="fld"><span>${L("Papel", "Paper")}</span><select data-kd="paper"><option value="cream" ${e.paper === "cream" ? "selected" : ""}>${L("Creme", "Cream")}</option><option value="white" ${e.paper === "white" ? "selected" : ""}>${L("Branco", "White")}</option></select></label></div>
      <label class="fld"><span>${L("Descrição (até 4000 caracteres)", "Description (up to 4000 characters)")}</span><textarea rows="8" data-kd="description">${esc(e.description)}</textarea></label>
      <label class="fld"><span>${L("7 palavras-chave (uma por caixa)", "7 keywords (one per box)")}</span><div class="kw">${Array.from({ length: 7 }, (_, i) => `<input data-kd="kw${i}" value="${esc(e.keywords[i] || "")}">`).join("")}</div></label>
      <label class="fld"><span>${L("Categorias (uma por linha)", "Categories (one per line)")}</span><textarea rows="3" data-kd="categories">${esc(e.categories.join("\n"))}</textarea></label>
      <div class="row kfoot"><button class="btn ghost" data-act="kdp-cancel">${L("Cancelar", "Cancel")}</button><span class="grow"></span><button class="btn primary" data-act="kdp-save">${ic("check", 14)} ${L("Salvar alterações", "Save changes")}</button></div></div>`
    : `<div class="kview">
      ${row(L("Título", "Title"), esc(p.title), !!p.title)}${p.subtitle ? row(L("Subtítulo", "Subtitle"), esc(p.subtitle)) : ""}${row(L("Autor", "Author"), esc(author), !!author)}${k.series ? row(L("Série", "Series"), esc(k.series)) : ""}
      ${row(L("Idioma", "Language"), langs.find((x) => x[0] === k.lang)?.[1] || k.lang)}${row(L("Preço do ebook", "Ebook price"), `US$ ${esc(k.price)}`, !!k.price)}
      ${row(L("Livro impresso", "Paperback"), `${d.trim.replace("x", " × ")}" · ${d.paper === "white" ? L("papel branco", "white paper") : L("papel creme", "cream paper")} · ~${pages} ${L("páginas", "pages")}`)}
      ${row(L("Descrição", "Description"), `<p class="kdesc">${esc(k.description)}</p>`, !!k.description.trim())}
      ${row(L("Palavras-chave", "Keywords"), `<div class="kchips">${chips(kws)}</div>${kws.length && kws.length < 7 ? `<small class="muted">${kws.length}/7</small>` : ""}`, kws.length > 0)}
      ${row(L("Categorias", "Categories"), `<div class="kchips">${chips(cats)}</div>`, cats.length > 0)}
    </div>`;
  const fill = S.settings.mode !== "offline" ? `<button class="btn sm ghost" data-act="kdp-ai">${ic("sparkles", 13)} ${L("Sugerir com IA", "Suggest with AI")}</button>` : `<button class="btn sm ghost" data-act="kdp-offline">${ic("tag", 13)} ${L("Sugerir", "Suggest")}</button>`;
  return `<div class="ksteps">
    <section class="kstep"><div class="kh"><span class="kn">1</span><div><b>${L("Confira os dados do livro", "Check the book details")}</b><small class="muted">${missing ? L(`${missing} item(ns) faltando`, `${missing} item(s) missing`) : L("Tudo preenchido", "All filled in")}</small></div>
      ${e ? "" : `<span class="grow"></span>${fill}<button class="btn sm" data-act="kdp-edit">${ic("write", 13)} ${L("Editar", "Edit")}</button>`}</div>${details}</section>
    <section class="kstep"><div class="kh"><span class="kn">2</span><div><b>${L("Capa", "Cover")}</b><small class="muted">${p.coverFull ? L("Ebook: só a frente · Impresso: verso, lombada e frente", "Ebook: front only · Paperback: back, spine and front") : L("Ainda sem capa", "No cover yet")}</small></div><span class="grow"></span><button class="btn sm" data-act="kdp-cover" data-id="${p.id}">${ic("image", 13)} ${p.cover ? L("Trocar a capa", "Change the cover") : L("Criar a capa", "Create the cover")}</button></div>
      ${p.ebookCover || p.cover ? `<div class="kcovers"><img class="kfront" src="${convertFileSrc(p.ebookCover || p.cover!)}">${p.coverFull ? `<img class="kfull" src="${convertFileSrc(p.coverFull)}">` : ""}</div>` : ""}</section>
    <section class="kstep"><div class="kh"><span class="kn">3</span><div><b>${L("Baixe os arquivos", "Download the files")}</b><small class="muted">${L("Uma pasta com tudo: EPUB e capa do Kindle, PDF do miolo e da capa do impresso, e uma ficha dizendo o que colar em cada campo da Amazon.", "One folder with everything: Kindle EPUB and cover, paperback interior and cover PDFs, and a sheet saying what to paste in each Amazon field.")}</small></div></div>
      <button class="btn primary big w" data-act="kdp-pack" ${e ? "disabled" : ""}>${ic("download")} ${L("Baixar tudo para a KDP", "Download everything for KDP")}</button>
      <details class="kone"><summary>${L("Só um arquivo", "Just one file")}</summary><div class="mpanel">
        <button class="mitem" data-act="epub"><span class="mthumb">EPUB</span><span><b>${L("Livro do Kindle", "Kindle book")}</b><small>${L("o texto do ebook", "the ebook text")}</small></span></button>
        <button class="mitem" data-act="kdp-interior"><span class="mthumb">PDF</span><span><b>${L("Miolo do impresso", "Paperback interior")}</b><small>${d.trim.replace("x", " × ")}" · ${L("sem sangria", "no bleed")}</small></span></button>
        ${p.cover || p.wrapArt ? coverExportItems(p).replace(/<button class="mitem" data-act="wrap-png"[\s\S]*?<\/button>/, "") : ""}</div></details></section>
    <section class="kstep"><div class="kh"><span class="kn">4</span><div><b>${L("Suba na Amazon", "Upload at Amazon")}</b><small class="muted">${L("Leva uns 15 minutos. Siga a ficha KDP details.txt da pasta.", "Takes about 15 minutes. Follow the KDP details.txt sheet in the folder.")}</small></div><span class="grow"></span><button class="btn sm" data-act="kdp-site">${ic("globe", 13)} ${L("Abrir kdp.amazon.com", "Open kdp.amazon.com")}</button></div>
      <ol class="kguide"><li>${L("Clique em <b>+ Create</b> → <b>Kindle eBook</b>. Cole os dados da ficha, envie o EPUB e a capa JPG.", "Click <b>+ Create</b> → <b>Kindle eBook</b>. Paste the details from the sheet, upload the EPUB and the JPG cover.")}</li>
        <li>${L("Quando a Amazon perguntar sobre <b>conteúdo gerado por IA</b>, responda <b>Sim</b> (texto e imagens).", "When Amazon asks about <b>AI-generated content</b>, answer <b>Yes</b> (text and images).")}</li>
        <li>${L("Depois <b>+ Create</b> → <b>Paperback</b>: ISBN grátis da KDP, sem sangria, o tamanho da ficha, envie os dois PDFs.", "Then <b>+ Create</b> → <b>Paperback</b>: free KDP ISBN, no bleed, the size on the sheet, upload both PDFs.")}</li>
        <li>${L("Abra o <b>Launch Previewer</b>, confira página por página e publique.", "Open the <b>Launch Previewer</b>, check every page and publish.")}</li></ol></section>
  </div>`;
}/** Rota antiga: publicar agora é um modo dentro do livro, no Estúdio. */
function vKdp() { S.view = "estudio"; const p = proj() || readProjs()[0]; if (p) { S.projId = p.id; if (p.status === "approved") S.ptab = "publish"; } return vEstudio(); }
/** Status do livro como uma etiqueta com menu (economiza espaço no topo). */
function statusMenu(p: Project) {
  const cur = p.status || "";
  const O: [string, string, string, string, string][] = [["", L("Rascunho", "Draft"), "write", "", L("Só no Estúdio", "Studio only")], ["approved", L("Aprovado", "Approved"), "check", "ok", L("Aparece no Acervo e no Leitor; libera a Amazon", "Shows in Library and Reader; unlocks Amazon")], ["rejected", L("Rejeitado", "Rejected"), "x", "bad", L("Escondido do Acervo e do Leitor", "Hidden from Library and Reader")]];
  const c = O.find((o) => o[0] === cur) || O[0];
  return `<details class="menu stmenu"><summary class="stchip ${c[3]}">${ic(c[2], 13)} ${c[1]}<span class="chev"></span></summary><div class="mpanel right">${O.map(([v, l, i, cls, d]) => `<button class="mitem ${v === cur ? "on" : ""}" data-act="proj-status" data-v="${v}"><span class="sti ${cls}">${ic(i, 14)}</span><span><b>${l}</b><small>${d}</small></span></button>`).join("")}</div></details>`;
}
/** Chave de modo, embaixo do livro: Edição do livro ⇄ Amazon KDP (o modo Amazon só libera com o livro aprovado). */
function pubBar(p: Project, on: boolean) {
  const ok = p.status === "approved";
  return `<div class="pubbar"><div class="mswitch ${on ? "amz" : ""}" role="tablist">
    <span class="mknob"></span>
    <button class="${on ? "" : "on"}" data-act="mode-edit">${ic("write", 15)} ${L("Edição do livro", "Book editing")}</button>
    <button class="${on ? "on" : ""} ${ok ? "" : "locked"}" data-act="pub-toggle" title="${ok ? "" : L("Aprove o livro (no topo) para liberar", "Approve the book (at the top) to unlock")}">${ic(ok ? "rocket" : "lock", 15)} ${L("Amazon KDP", "Amazon KDP")}</button>
  </div>${ok ? "" : `<small class="muted mhint">${ic("lock", 12)} ${L("Aprove o livro para liberar o modo Amazon", "Approve the book to unlock Amazon mode")}</small>`}</div>`;
}

type KdpDraft = { title: string; subtitle: string; author: string; series: string; lang: string; price: string; trim: string; paper: string; description: string; keywords: string[]; categories: string[] };
function kdpDraft(p: Project): KdpDraft { const d = wrapOf(p); return { title: p.title, subtitle: p.subtitle, author: S.author.pen || S.author.name || "", series: p.kdp.series, lang: p.kdp.lang, price: p.kdp.price, trim: d.trim, paper: d.paper, description: p.kdp.description, keywords: [...p.kdp.keywords], categories: [...p.kdp.categories] }; }

// ---------- Configurações ----------
const ACCENTS = ["#c8963e", "#d0574a", "#c2417a", "#8a5cf0", "#3f7fe0", "#2aa59a", "#5f9e3f", "#9a8f84"];
const BGS: Record<string, string[]> = { dark: ["#14110f", "#101418", "#121212", "#17121c", "#0f1712"], light: ["#f6f2ec", "#f4f6f9", "#fafafa", "#f7f1f6", "#f1f6f0"] };
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
/** Aplica o tema: automático (segue o sistema), escuro, claro ou personalizado (base + fundo + destaque). */
function applyTheme() {
  const r = document.documentElement, st = S.settings, t0 = st.theme || "light", t = t0 === "auto" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : t0;
  for (const k of ["--bg", "--tx", "--acc", "--onacc", "color-scheme"]) r.style.removeProperty(k);
  r.classList.remove("base-light"); r.dataset.theme = t === "dark" ? "" : t;
  if (t !== "custom") return;
  const base = st.tBase === "light" ? "light" : "dark", bg = st.tBg || BGS[base][0], acc = st.tAcc || ACCENTS[0];
  if (base === "light") r.classList.add("base-light");
  r.style.setProperty("--bg", bg); r.style.setProperty("--tx", lum(bg) > 0.4 ? "#241c15" : "#ece6df");
  r.style.setProperty("--acc", acc); r.style.setProperty("--onacc", lum(acc) > 0.35 ? "#16120e" : "#ffffff"); r.style.setProperty("color-scheme", base);
}
matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => { if (S.settings.theme === "auto") applyTheme(); });
function themePanel() {
  const st = S.settings, cur = st.theme || "light";
  const prev = (bg: string, side: string, pan: string, acc: string, tx: string) => `<div class="tprev" style="background:${bg}"><i style="background:${side}"></i><em><b style="background:${acc};width:45%"></b><b style="background:${tx};opacity:.5;width:80%"></b><b style="background:${pan};width:65%"></b></em></div>`;
  const base = st.tBase === "light" ? "light" : "dark", cbg = st.tBg || BGS[base][0], cacc = st.tAcc || ACCENTS[0];
  const opts: [string, string, string, string, string][] = [
    ["auto", "monitor", L("Automático", "Automatic"), L("Segue o sistema", "Follows your system"), `<div class="tprev" style="background:linear-gradient(110deg,#14110f 50%,#f6f2ec 50%)"></div>`],
    ["dark", "moon", L("Escuro", "Dark"), L("Confortável à noite", "Easy on the eyes at night"), prev("#14110f", "#1b1714", "#342c25", "#c8963e", "#efe6dc")],
    ["light", "sun", L("Claro (padrão)", "Light (default)"), L("Limpo e luminoso", "Clean and bright"), prev("#f6f2ec", "#efe8df", "#e3d9cc", "#a8722a", "#2a2119")],
    ["custom", "palette", L("Personalizado", "Custom"), L("Suas cores", "Your colors"), prev(cbg, cbg, cacc + "55", cacc, lum(cbg) > 0.4 ? "#241c15" : "#ece6df")]];
  const dot = (k: string, v: string, on: boolean) => `<button class="${on ? "on" : ""}" style="background:${v}" data-act="theme-set" data-k="${k}" data-v="${v}" title="${v}"></button>`;
  return `<section class="panel"><h3>${ic("palette")} ${L("Aparência", "Appearance")}</h3><p class="muted">${L("Escolha as cores do app. Muda na hora.", "Choose the app's colors. Changes right away.")}</p>
  <div class="themes">${opts.map(([v, icon, name, sub, pv]) => `<button class="thm ${cur === v ? "on" : ""}" data-act="theme-set" data-k="theme" data-v="${v}">${pv}<span>${ic(icon, 14)} ${name}</span><small>${sub}</small></button>`).join("")}</div>
  ${cur === "custom" ? `<div class="tcustom">
    <label>${L("Base", "Base")}<div class="seg"><button class="${base === "dark" ? "on" : ""}" data-act="theme-set" data-k="tBase" data-v="dark">${ic("moon", 13)} ${L("Escura", "Dark")}</button><button class="${base === "light" ? "on" : ""}" data-act="theme-set" data-k="tBase" data-v="light">${ic("sun", 13)} ${L("Clara", "Light")}</button></div></label>
    <label>${L("Fundo", "Background")}<div class="sw">${BGS[base].map((v) => dot("tBg", v, v === cbg)).join("")}<input type="color" data-theme-color="tBg" value="${cbg}"></div></label>
    <label>${L("Cor de destaque", "Accent color")}<div class="sw">${ACCENTS.map((v) => dot("tAcc", v, v === cacc)).join("")}<input type="color" data-theme-color="tAcc" value="${cacc}"></div></label>
  </div>` : ""}</section>`;
}
function vConfig() {
  const c = S.claude;
  const sel = (prov: "openai" | "gemini") => {
    const list = S.models[prov];
    const cur = S.settings.models[prov];
    return list.length ? `<select data-model="${prov}">${[cur, ...list.filter((m) => m !== cur)].filter(Boolean).map((m) => `<option ${m === cur ? "selected" : ""}>${m}</option>`).join("")}</select>` : `<input data-model="${prov}" value="${esc(cur)}" placeholder="${prov === "openai" ? "gpt-5.1" : "gemini-2.5-pro"}">`;
  };
  const tab = S.cfgTab || "geral";
  const TABS: [string, string, string][] = [["geral", L("Geral", "General"), "palette"], ["ia", L("IA e imagens", "AI & images"), "sparkles"], ["dados", L("Dados e backup", "Data & backup"), "folder"]];
  const body = tab === "ia" ? `
  <section class="panel"><h3>Motor de escrita</h3><p class="muted">${L("A IA que escreve os livros. Troque aqui ou no botão da barra lateral.", "The AI that writes the books. Change it here or with the sidebar button.")}</p>${engineButton()}</section>
  <section class="panel"><h3>Claude</h3><p>Usa o <b>Claude Code</b> instalado neste computador, com a sua assinatura do Claude — sem chave de API.</p>
    <p>${c?.ok ? `${ic("check")} ${L("Encontrado", "Found")}: ${esc(c.version)}` : (ic("x") + L(" Claude Code não encontrado. Instale em claude.com/claude-code e rode <code>claude</code> uma vez no terminal para fazer login.", " Claude Code not found. Install it from claude.com/claude-code and run <code>claude</code> once in the terminal to log in."))}</p>
    <label class="fld"><span>Modelo (vazio = padrão)</span><input data-model="claude" value="${esc(S.settings.models.claude)}" placeholder="opus, sonnet, haiku…"></label></section>
  <section class="panel" id="imgsec"><h3>Imagens (capas e ilustrações)</h3><div class="row"><select data-img="provider"><option value="openai" ${imgProv() === "openai" ? "selected" : ""}>OpenAI (gpt-image)</option><option value="gemini" ${imgProv() === "gemini" ? "selected" : ""}>Gemini (Nano Banana / Imagen)</option><option value="local" ${imgProv() === "local" ? "selected" : ""}>${L("No computador — grátis (Z-Image-Turbo)", "On this computer — free (Z-Image-Turbo)")}</option></select>
    ${imgProv() === "local" ? "" : `<input data-img="model" value="${esc(S.settings.img.model)}" placeholder="${S.settings.img.provider === "openai" ? "gpt-image-1" : "gemini-2.5-flash-image"}">`}</div>
    ${imgEngineCard()}
    <label class="fld"><span>${L("Estilo das capas locais (o modelo local não vê as capas do acervo, então o estilo vai em texto)", "Local cover style (the local model can't see the library covers, so the style goes as text)")}</span><textarea rows="3" data-img="localStyle">${esc(localStyle())}</textarea></label></section>
  <details class="panel keysbox"><summary><h3>${L("Chaves pagas (opcional): ChatGPT e Gemini", "Paid keys (optional): ChatGPT and Gemini")}</h3><small class="muted">${L("Só se quiser usar essas IAs. O app funciona sem elas.", "Only if you want to use these AIs. The app works without them.")}</small></summary>
  ${(["openai", "gemini"] as const).map((prov) => `<section class="panel"><h3 class="row" style="gap:8px">${prov === "openai" ? "ChatGPT (OpenAI)" : "Gemini (Google)"}<button class="icon infob ${S.keyInfo ? "on" : ""}" data-act="key-info" title="${L("Como pegar a chave e se precisa pagar", "How to get a key and whether you need to pay")}">i</button></h3>${prov === "openai" && S.keyInfo ? keyGuide() : ""}
    <div class="row"><input type="password" id="key-${prov}" placeholder="${S.keys[prov] ? L("•••••• chave salva (cole outra para trocar)", "•••••• key saved (paste another to replace)") : L("Cole a chave de API", "Paste the API key")}"><button class="btn" data-act="key" data-p="${prov}">Salvar chave</button><button class="btn" data-act="models" data-p="${prov}">Testar / listar modelos</button></div>
    <label class="fld"><span>Modelo de texto</span>${sel(prov)}</label></section>`).join("")}
  </details>` : tab === "dados" ? `  <section class="panel"><h3>Backup</h3><p class="muted">Tudo num único .zip: acervo, textos, capas, projetos, autor, estilo e configurações (os modelos de IA local ficam de fora — baixe de novo se precisar).</p>
    <div class="row"><button class="btn primary" data-act="backup-export">${ic("download")} Exportar backup</button><button class="btn" data-act="backup-import">${ic("upload")} Importar backup</button></div></section>
    <section class="card" id="histbox"><h3>${ic("clock", 16)} ${L("Histórico de versões (automático)", "Version history (automatic)")}</h3><p class="muted">${L("Carregando…", "Loading…")}</p></section>
  <section class="panel"><h3>Dados</h3><p class="muted">Tudo fica neste computador. As chaves ficam no arquivo secrets.json da pasta de dados.</p><button class="btn" data-act="reveal-data">${ic("folder")} Abrir pasta de dados</button></section>` : `  ${themePanel()}
  <section class="panel"><h3>${ic("globe")} Idioma do app</h3><div class="row"><select data-set="lang" style="max-width:280px"><option value="" ${!S.settings.lang ? "selected" : ""}>Automático (sistema)</option><option value="en" ${S.settings.lang === "en" ? "selected" : ""}>English</option><option value="pt" ${S.settings.lang === "pt" ? "selected" : ""}>Português (Brasil)</option></select></div></section>`;
  return `<header class="top"><div><h1>Configurações</h1><p>${L("Aparência, IA, chaves e backup.", "Appearance, AI, keys and backup.")}</p></div></header>
  <div class="seg ptabs stabs">${TABS.map(([k, l, i]) => `<button class="${tab === k ? "on" : ""}" data-act="cfg-tab" data-t="${k}">${ic(i, 14)} ${l}</button>`).join("")}</div>
  <div class="cfgbody">${body}</div>`;
}

const VIEWS: Record<string, () => string> = { mapa: vMapa, novo: vNovo, referencias: vReferencias, acervo: vAcervo, leitor: vLeitor, autor: vAutor, estilo: vEstilo, estudio: vEstudio, kdp: vKdp, config: vConfig };

// ---------- Mapa e análise (livros do acervo e do Estúdio) ----------
let mapCtl: MapCtl | null = null;
const anOf = (id: string): BookAnalysis => (S.analysis[id] ||= { ledger: [] });
const saveAn = () => save_("analysis", S.analysis);
const mapBooks = () => [...S.lib.filter((i) => i.kind === "livro").map((b) => ({ id: b.id, title: b.title, proj: false })), ...liveProjs().filter((p) => p.chapters.some((c) => strip(c.html).trim())).map((p) => ({ id: p.id, title: p.title, proj: true }))];
async function bookChapters(id: string): Promise<{ title: string; text: string }[]> {
  const p = S.projects.find((x) => x.id === id);
  if (p) return p.chapters.map((c) => ({ title: c.title, text: htmlText(c.html || "") }));
  const item = S.lib.find((i) => i.id === id); if (!item) return [];
  return splitChapters(await textOf(id)).map((c) => ({ title: c.title === "Opening" ? item.title : c.title, text: c.text })).filter((c) => c.text.trim().length > 200);
}
function bookNames(id: string): { name: string; group: MGroup; note?: string }[] {
  const p = S.projects.find((x) => x.id === id);
  if (p) {
    const g = (k: string): MGroup => (k === "Local" ? "place" : k === "Evento passado" ? "event" : "object");
    return [...castOf(p).filter((c) => c.name).map((c) => ({ name: c.name, group: "character" as MGroup, note: [c.role, c.mbti].filter(Boolean).join(" · ") })), ...worldOf(p).filter((w) => w.name).map((w) => ({ name: w.name, group: g(w.kind), note: w.desc }))];
  }
  return (S.profile?.names || []).slice(0, 40).map(([n]) => ({ name: n, group: "character" as MGroup }));
}
/** IA barata para tarefas de extração: Haiku com esforço baixo no Claude; nos outros motores, o modelo escolhido. */
async function cheapAI(system: string, prompt: string, maxTokens: number, act?: Act) {
  const models = S.settings.mode === "claude" ? { ...S.settings.models, claude: "haiku", claudeEffort: "low" } : S.settings.models;
  if (act) { act.ai = S.settings.mode === "claude" ? `Claude · Haiku · ${L("esforço baixo (tarefa simples)", "low effort (simple task)")}` : engName(); paintAct(act); }
  return runAI({ mode: S.settings.mode, models, system, history: [], prompt, maxTokens, onDelta: (d) => { if (act) { act.live += d; paintAct(act); } } });
}
async function smartAI(system: string, prompt: string, maxTokens: number, act?: Act) {
  return runAI({ mode: S.settings.mode, models: S.settings.models, system, history: [], prompt, maxTokens, onDelta: (d) => { if (act) { act.live += d; paintAct(act); } } });
}
const anTitle = (id: string) => mapBooks().find((b) => b.id === id)?.title || "";
/** Fichas por capítulo (resumo, personagens, lugares, objetos, eventos, fatos). Continua de onde parou. */
async function buildLedger(id: string) {
  const chs = await bookChapters(id), an = anOf(id);
  const todo = chs.map((c, i) => [c, i] as const).filter(([c, i]) => { const l = an.ledger.find((x) => x.i === i); return !l || l.title !== c.title || Math.abs(((l as any).w || 0) - words(c.text)) > words(c.text) * 0.1; });
  if (!todo.length) return an.ledger;
  S.stopGen = false; S.writing = "ledger"; S.anRun = "ledger"; render();
  const all = actStart("globe", L(`Mapeando “${anTitle(id)}”`, `Mapping “${anTitle(id)}”`), L(`${todo.length} capítulos · ${S.settings.mode === "claude" ? "Claude Haiku (barato)" : engName()}`, `${todo.length} chapters · ${S.settings.mode === "claude" ? "Claude Haiku (cheap)" : engName()}`));
  let n = 0;
  for (const [c, i] of todo) {
    if (S.stopGen) break;
    all.detail = L(`capítulo ${i + 1} de ${chs.length}`, `chapter ${i + 1} of ${chs.length}`); paintAct(all);
    try {
      const out = await cheapAI("You extract story facts from fiction for a continuity bible. Output only valid JSON, no prose.", ledgerPrompt(i, c), 900);;
      const j = parseJson<any>(out);
      if (j) { an.ledger = an.ledger.filter((x) => x.i !== i).concat(ledgerRow(i, c, j)).sort((a, b) => a.i - b.i); n++; an.ledgerAt = Date.now(); saveAn(); }
    } catch (e: any) { actEnd(all, String(e?.message || e), false); S.writing = ""; render(); return an.ledger; }
    if (S.view === "mapa") paintMap();
  }
  an.ledger = an.ledger.filter((x) => x.i < chs.length); saveAn();
  actEnd(all, S.stopGen ? L(`parado — ${n} capítulos mapeados`, `stopped — ${n} chapters mapped`) : L(`${n} capítulos mapeados`, `${n} chapters mapped`), !S.stopGen);
  S.writing = ""; S.busy = ""; render();
  return an.ledger;
}
const ledgerText = (led: ChapLedger[], facts = true) => led.map((c) => `Ch ${c.i + 1} "${c.title.replace(/^chapter\s*\d+:?\s*/i, "")}" [${c.time}] ${c.summary} | chars: ${c.characters.join(", ")}${c.places.length ? ` | places: ${c.places.join(", ")}` : ""}${c.objects?.length ? ` | objects: ${c.objects.join(", ")}` : ""}${c.events?.length ? ` | events: ${c.events.join("; ")}` : ""}${facts && c.facts.length ? ` | facts: ${c.facts.join("; ")}` : ""}`).join("\n");
type ElGroup = "place" | "object" | "event" | "character";
interface StoryEl { name: string; group: ElGroup; chapters: number[] }
const cleanEl = (x: string) => x.replace(/\s*\([^)]*\)?/g, "").replace(/\s+/g, " ").trim();
const elKey = (x: string) => cleanEl(x).toLowerCase().replace(/^(the|a|an|o|a|os|as)\s+/, "").replace(/['’]s\b/g, "");
/** Lugares, objetos e eventos de um livro (das fichas dos capítulos), com os capítulos em que aparecem. */
function storyEls(id: string, upto = Infinity, chars = false): StoryEl[] {
  const m = new Map<string, StoryEl>();
  for (const c of S.analysis[id]?.ledger || []) if (c.i < upto) for (const [g, arr] of [...(chars ? [["character", c.characters]] : []), ["place", c.places], ["object", c.objects], ["event", c.events]] as [ElGroup, string[]][])
    for (const raw of arr || []) { const name = cleanEl(raw); if (name.length < 2) continue; const k = g + ":" + elKey(name); const it = m.get(k) || { name, group: g, chapters: [] }; if (!it.chapters.includes(c.i)) it.chapters.push(c.i); m.set(k, it); }
  return [...m.values()].sort((a, b) => b.chapters.length - a.chapters.length || a.chapters[0] - b.chapters[0]);
}
/** Continuidade para o próximo capítulo: lugares e objetos já usados + fatos estabelecidos (curto). */
function continuityText(id: string, upto: number) {
  const led = (S.analysis[id]?.ledger || []).filter((c) => c.i < upto); if (!led.length) return "";
  const els = storyEls(id, upto), pl = els.filter((e) => e.group === "place").slice(0, 14).map((e) => e.name), ob = els.filter((e) => e.group === "object").slice(0, 12).map((e) => e.name);
  const facts = led.slice(-6).flatMap((c) => c.facts.map((f) => `- (ch ${c.i + 1}) ${f}`)).slice(-22);
  const last = led[led.length - 1];
  return `# Continuity so far (keep it consistent; reuse these places/objects when they fit, describe them the same way)
${pl.length ? `Places already in the story: ${pl.join("; ")}
` : ""}${ob.length ? `Objects that matter: ${ob.join("; ")}
` : ""}${last?.time ? `Time at the end of the previous chapter: ${last.time}
` : ""}${facts.length ? `Established facts:
${facts.join("\n")}` : ""}`.slice(0, 2200);
}
const WK: Record<ElGroup, string> = { place: "Local", object: "Objeto", event: "Evento passado", character: "Outro" };
function inWorld(p: Project, name: string) { const k = elKey(name); return worldOf(p).some((w) => elKey(w.name) === k || (k.length > 4 && elKey(w.name).includes(k))); }
function addToWorld(p: Project, els: StoryEl[]) {
  let n = 0;
  for (const e of els) if ((e.group === "place" || e.group === "object") && !inWorld(p, e.name)) { worldOf(p).push({ id: uid(), kind: WK[e.group], name: e.name, desc: "", details: "", links: `${L("Capítulos", "Chapters")} ${e.chapters.sort((a, b) => a - b).map((c) => c + 1).join(", ")}` }); n++; }
  if (n) { p.updated = Date.now(); saveProjects(); }
  return n;
}
/** Atualiza a ficha de um capítulo só (depois que a IA escreve ou você salva o texto). */
async function ledgerOne(id: string, i: number) {
  const c = (await bookChapters(id))[i]; if (!c || words(c.text) < 150) return;
  const act = actStart("globe", L(`Atualizando o mapa: ${c.title}`, `Updating the map: ${c.title}`), L("lugares, objetos, eventos e fatos", "places, objects, events and facts"));
  try {
    const out = await cheapAI("You extract story facts from fiction for a continuity bible. Output only valid JSON, no prose.", ledgerPrompt(i, c), 900);
    const j = parseJson<any>(out); const an = anOf(id);
    if (j) { an.ledger = an.ledger.filter((x) => x.i !== i).concat(ledgerRow(i, c, j)).sort((a, b) => a.i - b.i); an.ledgerAt = Date.now(); saveAn(); }
    actEnd(act, j ? L("mapa atualizado", "map updated") : L("resposta inválida", "invalid answer"), !!j);
  } catch (e: any) { actEnd(act, String(e?.message || e), false); }
}
const ledgerPrompt = (i: number, c: { title: string; text: string }) => `Chapter ${i + 1}: "${c.title}"\n"""${c.text.split(/\s+/).slice(0, 5000).join(" ")}"""\n\nReturn JSON: {"summary":"2 sentences, what happens","time":"when it happens (date/season/time of day, relative to previous chapters)","characters":["full names of characters who appear or act"],"places":["specific named or distinct places"],"objects":["objects that matter to the plot"],"events":["key events, 3-8 words each"],"facts":["continuity facts that must stay consistent: ages, dates, physical traits, injuries, relationships, who knows what, rules, numbers — max 10, short"]}`;
const ledgerRow = (i: number, c: { title: string; text: string }, j: any): ChapLedger => ({ i, title: c.title, w: words(c.text), summary: j.summary || "", time: j.time || "", characters: j.characters || [], places: j.places || [], objects: j.objects || [], events: j.events || [], facts: j.facts || [] } as any);
function castBrief(id: string) { const p = S.projects.find((x) => x.id === id); return p ? castText(p).slice(0, 2500) : ""; }
async function needLedger(id: string) { const chs = await bookChapters(id); if (anOf(id).ledger.length < chs.length) { toast(L("Primeiro vou mapear os capítulos (barato) — depois a análise.", "Mapping the chapters first (cheap) — then the analysis.")); await buildLedger(id); } return anOf(id).ledger.length >= Math.max(1, chs.length - 1); }

async function runContradictions(id: string) {
  if (!engineReady()) { S.picker = true; render(); return; }
  if (!(await needLedger(id))) return;
  S.stopGen = false; S.writing = "an"; S.anRun = "contra"; render();
  const act = actStart("compass", L("Procurando contradições e erros", "Looking for contradictions and errors"), engName());
  try {
    const out = await smartAI("You are a meticulous fiction continuity editor. You only report real problems you can point to.",
      `Book: "${anTitle(id)}". Chapter-by-chapter continuity notes:\n${ledgerText(anOf(id).ledger)}\n${castBrief(id) ? `\nCharacter sheets:\n${castBrief(id)}\n` : ""}\nFind contradictions and errors: timeline/date problems, ages, physical traits, names spelled differently, who-knows-what, objects appearing/disappearing, broken rules of the world, plot holes, unresolved threads. Ignore style. Max 12, most serious first. For each output exactly:\n### short title\nChapters: numbers separated by commas\nType: timeline | character | name | object | logic | plot hole | loose thread\nProblem: what contradicts what (cite both chapters)\nFix: the smallest change that fixes it\nIf there are none, output: NONE`, 2600, act);
    const f: Finding[] = parseBlocks(out).filter((b) => b.problem).map((b) => ({ title: b.title, chapters: (b.chapters || "").match(/\d+/g)?.map((x) => +x - 1) || [], kind: b.type || "", problem: b.problem, fix: b.fix || "", status: "open" }));
    anOf(id).contradictions = f; saveAn(); actEnd(act, f.length ? `${f.length} ${L("problemas encontrados", "problems found")}` : L("nenhuma contradição encontrada", "no contradictions found"));
  } catch (e: any) { actEnd(act, String(e?.message || e), false); }
  S.writing = ""; S.busy = ""; S.anRun = ""; render();
}
async function runEndings(id: string) {
  if (!engineReady()) { S.picker = true; render(); return; }
  if (!(await needLedger(id))) return;
  S.stopGen = false; S.writing = "an"; S.anRun = "endings"; render();
  const act = actStart("feather", L("Imaginando finais alternativos", "Imagining alternative endings"), engName());
  try {
    const chs = await bookChapters(id), last = chs[chs.length - 1]?.text.split(/\s+/).slice(-2200).join(" ") || "";
    const out = await smartAI(`You are a developmental editor for ${S.author.name || "the author"}'s fiction. ${S.profile ? describe(S.profile, true).slice(0, 1500) : ""}`,
      `Book: "${anTitle(id)}". Story so far (chapter notes):\n${ledgerText(anOf(id).ledger, false)}\n\nThe current ending (last chapter, end):\n"""${last}"""\n\nPropose 3 alternative endings that fit this author's voice and genre and pay off the setups already in the book (one darker, one with a twist that recontextualizes earlier chapters, one more open). For each output exactly:\n### title\nSummary: 4-6 sentences of what happens\nChanges: which earlier chapters would need small adjustments, if any\nTone: one line`, 2200, act);
    const e = parseBlocks(out).filter((b) => b.summary).map((b) => ({ title: b.title, summary: b.summary, changes: b.changes || "", tone: b.tone || "" }));
    anOf(id).endings = e; saveAn(); actEnd(act, `${e.length} ${L("finais", "endings")}`);
  } catch (e: any) { actEnd(act, String(e?.message || e), false); }
  S.writing = ""; S.busy = ""; render();
}
async function runImprove(id: string, i: number) {
  if (!engineReady()) { S.picker = true; render(); return; }
  const chs = await bookChapters(id); const c = chs[i]; if (!c) return;
  const lc = S.analysis[id]?.ledger.find((x) => x.i === i);
  const els = lc ? `\nPlaces in this chapter: ${lc.places.join("; ") || "-"}\nObjects that matter: ${lc.objects.join("; ") || "-"}\nKey events: ${lc.events.join("; ") || "-"}\nCheck each place, object and event above: can the reader picture the place, follow the movement in the event, feel the object in hand? Prioritize those gaps.\n` : "";
  S.stopGen = false; S.writing = "an"; S.anRun = "improve"; render();
  const act = actStart("pen", L(`Como melhorar: capítulo ${i + 1}`, `How to improve: chapter ${i + 1}`), engName());
  try {
    const out = await smartAI(`You are a sharp line editor for ${S.author.name || "the author"}. Keep the author's voice; never make it generic. ${S.profile ? describe(S.profile, true).slice(0, 1200) : ""}`,
      `Chapter ${i + 1} "${c.title}":\n"""${c.text.split(/\s+/).slice(0, 4500).join(" ")}"""\n${els}\nHelp the reader SEE and FEEL this chapter: where can they not picture the place, the movement in a scene, the light, sounds, textures, temperature or smell (use varied senses, not only smell)? Which passages are weak (flat, rushed, confusing, telling instead of showing, clichés)? Which words are vague or not the best fit?\nOutput up to 8 passages, each exactly:\n### short label\nQuote: one or two sentences copied EXACTLY from the text\nProblem: why it is weak\nSuggestion: the rewritten passage, same voice, same length or a little longer\nThen a line WORDS: followed by up to 10 lines "- original => better (why)"\nThen a line IMAGERY: followed by up to 5 lines "- where the reader needs more to picture it and what to add"`, 3000, act);
    const [a, b = ""] = out.split(/^\s*WORDS:\s*$/mi); const [w, img = ""] = b.split(/^\s*IMAGERY:\s*$/mi);
    const findings: Finding[] = parseBlocks(a).filter((x) => x.quote && x.suggestion).map((x) => ({ title: x.title, chapters: [i], kind: "line", problem: x.problem || "", fix: "", quote: x.quote.replace(/^["“]|["”]$/g, ""), suggestion: x.suggestion.replace(/^["“]|["”]$/g, ""), status: "open" }));
    const wordsL = w.split("\n").map((l) => l.match(/^\s*[-*]\s*(.+?)\s*=>\s*(.+?)(?:\s*\((.+)\))?\s*$/)).filter(Boolean).map((m) => [m![1].replace(/["“”]/g, ""), m![2].replace(/["“”]/g, ""), m![3] || ""] as [string, string, string]);
    const imagery = img.split("\n").map((l) => l.replace(/^\s*[-*]\s*/, "").trim()).filter((l) => l.length > 8);
    (anOf(id).improve ||= {})[i] = { findings, words: wordsL, imagery, at: Date.now() }; saveAn();
    actEnd(act, `${findings.length} ${L("trechos", "passages")} · ${wordsL.length} ${L("palavras", "words")} · ${imagery.length} ${L("notas de imagem", "imagery notes")}`);
  } catch (e: any) { actEnd(act, String(e?.message || e), false); }
  S.writing = ""; S.busy = ""; render();
}
/** Troca um trecho no HTML do capítulo, aceitando aspas retas/curvas diferentes. */
function replaceInChapter(ch: Chapter, find: string, repl: string) {
  const variants = [find, esc(find), find.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"), find.replace(/"/g, "“").replace(/'/g, "’")];
  for (const v of variants) { const k = ch.html.indexOf(v); if (v.length > 6 && k >= 0) { ch.html = ch.html.slice(0, k) + esc(repl) + ch.html.slice(k + v.length); return true; } }
  return false;
}
async function fixContradiction(id: string, k: number) {
  const p = S.projects.find((x) => x.id === id); const f = anOf(id).contradictions?.[k]; if (!p || !f) return;
  const ci = f.chapters.filter((x) => p.chapters[x]).pop(); if (ci === undefined) return toast(L("Capítulo não encontrado", "Chapter not found"), true);
  const ch = p.chapters[ci]; S.stopGen = false; S.writing = "an"; S.anRun = "fix"; render();
  const act = actStart("pen", L(`Corrigindo no capítulo ${ci + 1}`, `Fixing in chapter ${ci + 1}`), f.title);
  try {
    const out = await smartAI("You make minimal, surgical edits to fiction to fix continuity errors. Output only JSON.",
      `Problem: ${f.problem}\nSuggested fix: ${f.fix}\n\nChapter ${ci + 1} text:\n"""${htmlText(ch.html).split(/\s+/).slice(0, 5000).join(" ")}"""\n\nReturn a JSON array of at most 5 edits [{"find":"exact text copied from the chapter (a full sentence)","replace":"the corrected sentence"}]. Keep the author's voice. Return [] if this chapter needs no change.`, 1200, act);
    const edits = parseJson<{ find: string; replace: string }[]>(out) || [];
    const ok = edits.filter((e) => e.find && e.replace && replaceInChapter(ch, e.find, e.replace)).length;
    if (ok) { f.status = "fixed"; p.updated = Date.now(); saveProjects(); saveAn(); }
    actEnd(act, ok ? L(`${ok} trecho(s) corrigido(s) no capítulo ${ci + 1}`, `${ok} passage(s) fixed in chapter ${ci + 1}`) : L("a IA não achou o que mudar neste capítulo", "the AI found nothing to change in this chapter"), ok > 0);
  } catch (e: any) { actEnd(act, String(e?.message || e), false); }
  S.writing = ""; S.busy = ""; render();
}

/** Capa (miniatura) de um livro do acervo ou do Estúdio. */
function bookThumbSrc(b: any): string { if (!b) return ""; if (b.chapters) return b.ebookCover || b.cover ? convertFileSrc(b.ebookCover || b.cover) : ""; const cv = b.kind === "livro" ? coverOf(b) : undefined; return cv?.thumb || ""; }
/** Capinha: imagem da capa, ou uma capa de mentira com a inicial do título. */
function bookCov(b: any, size = "") { const t = bookThumbSrc(b); const kind = b?.kind === "notas" ? "note" : b?.kind === "referencia" ? "ref" : ""; return `<span class="bcov ${size} ${kind}">${t ? `<img src="${esc(t)}">` : `<em>${kind ? ic(kind === "note" ? "feather" : "landmark", 14) : esc((b?.title || "?").trim().charAt(0).toUpperCase())}</em>`}</span>`; }
function mapPicker(cur?: { id: string; title: string; proj: boolean }) {
  const books = mapBooks();
  const opt = (b: { id: string; title: string; proj: boolean }) => { const an = S.analysis[b.id]; const src = S.projects.find((x) => x.id === b.id) || S.lib.find((x) => x.id === b.id) || b; return `<button class="mitem ${b.id === S.mapId ? "on" : ""}" data-act="map-book" data-id="${b.id}">${bookCov(src)}<span><b>${esc(b.title)}</b><small>${an?.ledger.length ? `${an.ledger.length} ${L("capítulos mapeados", "chapters mapped")}` : L("ainda não mapeado pela IA", "not mapped by AI yet")}</small></span></button>`; };
  return `<details class="menu bookpick mapsel"><summary>${cur ? `${bookCov(S.projects.find((x) => x.id === cur.id) || S.lib.find((x) => x.id === cur.id) || cur, "sm")}<span class="bpt"><small>${L("Livro", "Book")}</small><b>${esc(cur.title)}</b></span>` : `${ic("book", 16)} <b>${L("Escolher livro…", "Choose a book…")}</b>`}<span class="chev"></span></summary><div class="mpanel">
    <div class="mgroup"><label>${tr("Livros do autor")}</label>${books.filter((b) => !b.proj).map(opt).join("") || `<p class="muted" style="padding:6px 10px">—</p>`}</div>
    <div class="mgroup"><label>${tr("Livros do Estúdio")}</label>${books.filter((b) => b.proj).map(opt).join("") || `<p class="muted" style="padding:6px 10px">—</p>`}</div></div></details>`;
}
const MTABS = ["resumo", "mapa", "elementos", "revisao"];
const chT = (t: string) => t.replace(/^chapter\s*\d+:?\s*/i, "").replace(/^cap[ií]tulo\s*\d+:?\s*/i, "") || t;
function chapIssues(id: string, i: number) { return (S.analysis[id]?.contradictions || []).filter((f) => f.status === "open" && f.chapters.includes(i)).length; }
function vMapa() {
  const books = mapBooks();
  if (!S.mapId || !books.some((b) => b.id === S.mapId)) S.mapId = books[0]?.id || "";
  if (!MTABS.includes(S.mapTab)) S.mapTab = S.mapTab === "analise" ? "revisao" : "resumo";
  const cur = books.find((b) => b.id === S.mapId);
  const head = `<header class="top"><div><h1>${L("Mapa e análise", "Map & analysis")}</h1><p>${L("Entenda a história capítulo por capítulo e corrija o que precisar.", "Understand the story chapter by chapter and fix what it needs.")}</p></div>${mapPicker(cur)}</header>`;
  if (!cur) return head + `<div class="empty"><div class="big">${ic("globe")}</div><p>${L("Adicione livros no Acervo ou escreva um livro no Estúdio para ver o mapa.", "Add books to the Library or write one in the Studio to see the map.")}</p></div>`;
  const an = S.analysis[cur.id], led = an?.ledger || [], busy = !!S.writing;
  if (!led.length) return head + `<div class="mstart"><span class="avatar wk big">${ic("globe", 22)}</span><h2>${L(`Vamos mapear “${esc(cur.title)}”`, `Let's map “${esc(cur.title)}”`)}</h2>
    <p class="muted">${L("A IA lê cada capítulo uma vez e anota quem aparece, onde acontece, os objetos, os eventos e os fatos que precisam bater. Depois disso tudo aqui funciona sem gastar mais nada.", "The AI reads each chapter once and notes who appears, where it happens, the objects, the events and the facts that must stay consistent. After that, everything here works without spending more.")}</p>
    <ol class="msteps"><li><b>${L("Mapear", "Map")}</b><span>${L("uma chamada curta por capítulo", "one short call per chapter")}</span></li><li><b>${L("Entender", "Understand")}</b><span>${L("resumo, mapa e elementos da história", "summary, map and story elements")}</span></li><li><b>${L("Revisar", "Review")}</b><span>${L("contradições, trechos fracos e finais alternativos", "contradictions, weak passages and alternative endings")}</span></li></ol>
    ${S.writing === "ledger" ? `<div class="row"><span class="spin"></span> ${L("Mapeando… acompanhe na barra de atividade", "Mapping… follow it in the activity bar")} <button class="btn sm" data-act="stop-gen">${ic("stop", 13)} ${tr("Parar")}</button></div>` : S.settings.mode === "offline" ? `<p class="hint">${L("Escolha um motor de IA (Claude, local, ChatGPT ou Gemini) para mapear.", "Choose an AI engine (Claude, local, ChatGPT or Gemini) to map.")}</p>` : `<button class="btn primary" data-act="map-ai" ${busy ? "disabled" : ""}>${ic("sparkles")} ${L("Mapear o livro com IA", "Map the book with AI")}</button>`}</div>`;
  const els = storyEls(cur.id, Infinity, true), cnt = (g: string) => els.filter((e) => e.group === g).length;
  const open = (an?.contradictions || []).filter((f) => f.status === "open").length;
  const stat = (n: number, l: string, g: string, col: string, t = "elementos") => `<button class="mstat" data-act="an-goto" data-t="${t}" data-g="${g}" data-i="-1"><b style="color:${col}">${n}</b><span>${l}</span></button>`;
  const stats = `<div class="mstats">${stat(led.length, L("capítulos", "chapters"), "", "#c8963e", "resumo")}${stat(cnt("character"), L("personagens", "characters"), "character", "#e06c75")}${stat(cnt("place"), L("lugares", "places"), "place", "#56b6c2")}${stat(cnt("object"), L("objetos", "objects"), "object", "#98c379")}${stat(cnt("event"), L("eventos", "events"), "event", "#c678dd")}${stat(open, an?.contradictions ? L("problemas em aberto", "open problems") : L("problemas (ainda não buscados)", "problems (not searched yet)"), "", open ? "#e06c75" : "#98c379", "revisao")}</div>`;
  const ch = S.anChap, sel = led.find((c) => c.i === ch);
  const rail = `<aside class="mrail"><div class="mrail-h"><b>${L("Capítulos", "Chapters")}</b>${S.settings.mode !== "offline" ? `<button class="icon" data-act="map-ai" title="${L("Atualizar o mapa com IA (só os capítulos que mudaram)", "Update the map with AI (only chapters that changed)")}" ${busy ? "disabled" : ""}>${S.writing === "ledger" ? `<span class="spin"></span>` : ic("sparkles", 14)}</button>` : ""}</div>
    <button class="mch book ${ch < 0 ? "on" : ""}" data-act="an-ch" data-i="-1"><span class="mnum">${ic("book", 13)}</span><span class="mtx"><b>${L("Livro inteiro", "Whole book")}</b><small>${led.length} ${L("capítulos", "chapters")} · ${led.reduce((n, c) => n + ((c as any).w || 0), 0).toLocaleString(locale())} ${L("palavras", "words")}</small></span></button>
    ${led.map((c) => { const iss = chapIssues(cur.id, c.i), rev = !!an?.improve?.[c.i]; return `<button class="mch ${c.i === ch ? "on" : ""}" data-act="an-ch" data-i="${c.i}"><span class="mnum">${c.i + 1}</span><span class="mtx"><b>${esc(chT(c.title))}</b><small>${esc((c.time || "").split(/[;.]/)[0].slice(0, 60))}</small></span>${iss ? `<i class="mbadge bad" title="${L("problemas em aberto", "open problems")}">${iss}</i>` : ""}${rev ? `<i class="mbadge ok" title="${L("revisado", "reviewed")}">${ic("check", 10)}</i>` : ""}</button>`; }).join("")}</aside>`;
  const tabs = [["resumo", L("Resumo", "Summary"), "book"], ["mapa", L("Mapa", "Map"), "globe"], ["elementos", L("Elementos", "Elements"), "landmark"], ["revisao", L("Revisão", "Review"), "pen"]];
  const scope = sel ? `<span class="mscope"><span class="mnum">${sel.i + 1}</span>${esc(chT(sel.title))}<button class="icon" data-act="an-ch" data-i="-1" title="${L("Voltar ao livro inteiro", "Back to the whole book")}">✕</button></span>` : "";
  const body = S.mapTab === "mapa" ? mapTabView(an!) : S.mapTab === "elementos" ? elementsView(cur, els, sel) : S.mapTab === "revisao" ? reviewView(cur, sel) : sel ? chapterSummary(cur, sel) : bookTimeline(cur, led);
  return head + stats + `<div class="mgrid">${rail}<section class="mmain"><div class="mbar"><div class="seg ptabs">${tabs.map(([k, l, i]) => `<button class="${S.mapTab === k ? "on" : ""}" data-act="map-tab" data-t="${k}">${ic(i, 14)} ${l}</button>`).join("")}</div>${scope}</div><div class="mbody ${S.mapTab}">${body}</div></section></div>`;
}
const pill = (g: string, x: string) => `<i class="chip ${g}">${esc(x)}</i>`;
function bookTimeline(cur: { id: string }, led: ChapLedger[]) {
  return `<p class="muted mtip">${L("A história em ordem. Clique num capítulo para ver tudo sobre ele — ou escolha na lista à esquerda.", "The story in order. Click a chapter to see everything about it — or pick one from the list on the left.")}</p><div class="mtl">${led.map((c) => { const iss = chapIssues(cur.id, c.i); return `<button class="mtl-i" data-act="an-ch" data-i="${c.i}"><span class="mnum">${c.i + 1}</span><div><div class="mtl-h"><b>${esc(chT(c.title))}</b>${c.time ? `<small>${esc(c.time.split(/[;.]/)[0].slice(0, 70))}</small>` : ""}${iss ? `<i class="mbadge bad">${iss} ${L("problema(s)", "problem(s)")}</i>` : ""}</div><p>${esc(c.summary)}</p><div class="chipsw">${c.characters.slice(0, 6).map((x) => pill("ch", cleanEl(x))).join("")}${c.places.slice(0, 3).map((x) => pill("pl", cleanEl(x))).join("")}</div></div></button>`; }).join("")}</div>`;
}
function chapterSummary(cur: { id: string; proj: boolean }, c: ChapLedger) {
  const led = S.analysis[cur.id]!.ledger, k = led.indexOf(c), prev = led[k - 1], next = led[k + 1];
  const blk = (icn: string, t: string, cls: string, list: string[], asList = false) => list.length ? `<section class="mcard"><h4>${ic(icn, 13)} ${t} <span class="muted">${list.length}</span></h4>${asList ? `<ul>${list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<div class="chipsw">${list.map((x) => pill(cls, cleanEl(x))).join("")}</div>`}</section>` : "";
  return `<div class="msum"><div class="msum-h"><div><small class="muted">${L("Capítulo", "Chapter")} ${c.i + 1}${(c as any).w ? ` · ${(c as any).w.toLocaleString(locale())} ${L("palavras", "words")}` : ""}</small><h2>${esc(chT(c.title))}</h2>${c.time ? `<p class="muted">${ic("compass", 12)} ${esc(c.time)}</p>` : ""}</div>
      <div class="row"><button class="btn sm" data-act="map-open-ch" data-i="${c.i}">${ic(cur.proj ? "pen" : "book", 13)} ${cur.proj ? L("Abrir no Estúdio", "Open in the Studio") : L("Ler no Leitor", "Read in the Reader")}</button><button class="btn sm primary" data-act="an-goto" data-t="revisao" data-i="${c.i}">${ic("pen", 13)} ${L("Revisar este capítulo", "Review this chapter")}</button></div></div>
    <p class="mlead">${esc(c.summary)}</p>
    <div class="mcards">${blk("fingerprint", L("Quem aparece", "Who appears"), "ch", c.characters)}${blk("landmark", L("Onde acontece", "Where it happens"), "pl", c.places)}${blk("tag", L("Objetos que importam", "Objects that matter"), "ob", c.objects)}${blk("compass", L("O que acontece", "What happens"), "ev", c.events, true)}${blk("check", L("Fatos que precisam bater depois", "Facts that must stay consistent"), "", c.facts, true)}</div>
    <div class="mnav">${prev ? `<button class="btn sm ghost" data-act="an-ch" data-i="${prev.i}">← ${prev.i + 1}. ${esc(chT(prev.title)).slice(0, 40)}</button>` : "<span></span>"}${next ? `<button class="btn sm ghost" data-act="an-ch" data-i="${next.i}">${next.i + 1}. ${esc(chT(next.title)).slice(0, 40)} →</button>` : ""}</div></div>`;
}
function mapTabView(an: BookAnalysis) {
  return `<div class="mtool"><label class="mp-search">${ic("compass", 14)}<input id="mapq" placeholder="${L("Buscar e Enter…", "Search and Enter…")}"></label>
      <div class="seg mp-mode"><button class="${S.mapAll ? "" : "on"}" data-act="map-all" data-v="0" title="${L("Personagens e o que volta em 2+ capítulos", "Characters and what returns in 2+ chapters")}">${L("Principal", "Main")}</button><button class="${S.mapAll ? "on" : ""}" data-act="map-all" data-v="1">${L("Tudo", "Everything")}</button></div>
      <div class="mlayers">${MGROUPS.map(([k, l, c]) => `<button class="mp-layer ${S.mapHidden.includes(k) ? "off" : ""}" data-act="map-layer" data-k="${k}"><i class="mp-dot" style="background:${c}"></i>${tr(l)} <em id="cnt-${k}"></em></button>`).join("")}</div></div>
    <div class="mapwrap"><div class="mapc" id="mapc"></div><aside class="mapfloat" id="mapins">${mapInspector(null)}</aside><small class="maphelp">${an.ledger.length ? L("Linha dourada = capítulos em ordem. Clique num ponto para ver detalhes; arraste para mover; role para zoom.", "Gold line = chapters in order. Click a point for details; drag to move; scroll to zoom.") : ""}</small></div>`;
}
function mapInspector(n: MNode | null) {
  if (!n) return `<div class="mins-empty">${ic("globe", 18)}<p>${L("Clique num ponto do mapa", "Click a point on the map")}</p></div>`;
  const g = MGROUPS.find((x) => x[0] === n.group); const p = S.projects.find((x) => x.id === S.mapId);
  const chs = [...n.chapters].sort((a, b) => a - b);
  return `<div class="mins"><div class="row"><span class="mp-dot big" style="background:${g?.[2] || "#f0d9a8"}"></span><small class="muted">${tr(g?.[1] || "Livro")}</small><span class="grow"></span><button class="icon" data-act="map-unsel">✕</button></div><h3>${esc(n.label)}</h3>
    ${n.sub ? `<p class="muted">${esc(n.sub)}</p>` : ""}${n.note ? `<p>${esc(n.note)}</p>` : ""}
    ${n.group === "chapter" ? `<button class="btn sm primary" data-act="an-goto" data-t="resumo" data-i="${chs[0]}">${ic("book", 13)} ${L("Ver o capítulo", "See the chapter")}</button>` : n.group !== "book" && chs.length ? `<h4>${L(`Aparece em ${chs.length} capítulo(s)`, `Appears in ${chs.length} chapter(s)`)}</h4><div class="chipsw">${chs.map((c) => `<button class="chip" data-act="an-goto" data-t="resumo" data-i="${c}">${c + 1}</button>`).join("")}</div>` : ""}
    ${p && (n.group === "place" || n.group === "object") ? (inWorld(p, n.label) ? `<p class="muted">${ic("check", 12)} ${L("Está no Mundo do livro", "In the book's World")}</p>` : `<button class="btn sm" data-act="el-world" data-g="${n.group}" data-n="${esc(n.label)}">${ic("plus", 13)} ${L("Levar para o Mundo do livro", "Add to the book's World")}</button>`) : ""}</div>`;
}
async function paintMap() {
  const host = $("#mapc"); if (!host) return;
  const cur = mapBooks().find((b) => b.id === S.mapId); if (!cur) return;
  const an = S.analysis[cur.id]; const names = bookNames(cur.id);
  const g = an?.ledger.length ? graphFromLedger(cur.title, an.ledger, cur.proj ? names : [], S.mapAll) : graphQuick(cur.title, await bookChapters(cur.id), names);
  for (const [k] of MGROUPS) { const e = $(`#cnt-${k}`); if (e) e.textContent = String(g.nodes.filter((n) => n.group === k).length); }
  mapCtl?.stop();
  mapCtl = mountMap(host, g, (n) => { S.mapSel = n; const ins = $("#mapins"); if (ins) { ins.innerHTML = mapInspector(n); ins.classList.toggle("on", !!n); } });
  mapCtl.setHidden(new Set(S.mapHidden));
  if (S.anChap >= 0) setTimeout(() => mapCtl?.select(`ch:${S.anChap}`), 900);
  const q = $<HTMLInputElement>("#mapq"); if (q) q.onkeydown = (e) => { if (e.key === "Enter") { if (!mapCtl?.search(q.value)) toast(L("Nada encontrado", "Nothing found"), true); } };
}
function elementsView(cur: { id: string; proj: boolean }, all: StoryEl[], sel?: ChapLedger) {
  const p = S.projects.find((x) => x.id === cur.id);
  const G: [string, string, string, string][] = [["character", L("Personagens", "Characters"), "fingerprint", "#e06c75"], ["place", L("Lugares", "Places"), "landmark", "#56b6c2"], ["object", L("Objetos", "Objects"), "tag", "#98c379"], ["event", L("Eventos", "Events"), "compass", "#c678dd"]];
  const els = sel ? all.filter((e) => e.chapters.includes(sel.i)) : all;
  const gsel = S.elGroup || "";
  const missing = p ? all.filter((e) => (e.group === "place" || e.group === "object") && !inWorld(p, e.name)) : [];
  return `<div class="mtool"><label class="mp-search">${ic("compass", 14)}<input id="elq" placeholder="${L("Filtrar por nome…", "Filter by name…")}"></label>
      <div class="seg">${[["", L("Todos", "All"), els.length] as const, ...G.map(([g, l]) => [g, l, els.filter((e) => e.group === g).length] as const)].map(([g, l, n]) => `<button class="${gsel === g ? "on" : ""}" data-act="el-group" data-g="${g}">${l} <em class="muted">${n}</em></button>`).join("")}</div>
      ${p && missing.length && !sel ? `<button class="btn sm" data-act="el-world-all" title="${L("Lugares e objetos que ainda não estão no Mundo do livro", "Places and objects not yet in the book's World")}">${ic("plus", 13)} ${L(`Levar ${missing.length} para o Mundo`, `Add ${missing.length} to the World`)}</button>` : ""}</div>
    <p class="muted mtip">${sel ? L(`Só o que aparece no capítulo ${sel.i + 1}. Os números mostram em que capítulos cada um aparece — clique para ir até lá.`, `Only what appears in chapter ${sel.i + 1}. The numbers show which chapters each one appears in — click to go there.`) : L("Tudo o que existe na história, do mais frequente ao menos. Os números são os capítulos — clique para ir até lá.", "Everything in the story, most frequent first. The numbers are chapters — click to go there.")}</p>
    ${G.filter(([g]) => !gsel || g === gsel).map(([g, l, icn, col]) => { const list = els.filter((e) => e.group === g); if (!list.length) return ""; const view = g === "event" ? [...list].sort((a, b) => a.chapters[0] - b.chapters[0]) : list; const lim = gsel || S.elAll?.[g] ? 600 : 12;
      return `<h4 class="elh"><i class="mp-dot" style="background:${col}"></i> ${l} <span class="muted">${list.length}</span></h4><div class="elgrid ${g}">${view.slice(0, lim).map((e) => `<div class="elc" data-n="${esc(e.name.toLowerCase())}">${ic(icn, 13)}<b title="${esc(e.name)}">${esc(e.name)}</b><span class="chipsw">${[...e.chapters].sort((a, b) => a - b).slice(0, 7).map((c) => `<button class="chip ${sel?.i === c ? "on" : ""}" data-act="an-goto" data-t="resumo" data-i="${c}">${c + 1}</button>`).join("")}${e.chapters.length > 7 ? `<i class="chip">+${e.chapters.length - 7}</i>` : ""}</span>${p && (g === "place" || g === "object") ? (inWorld(p, e.name) ? `<i class="muted" title="${L("Já está no Mundo", "Already in the World")}">${ic("check", 13)}</i>` : `<button class="icon" data-act="el-world" data-g="${g}" data-n="${esc(e.name)}" title="${L("Levar para o Mundo do livro", "Add to the book's World")}">${ic("plus", 13)}</button>`) : ""}</div>`).join("")}</div>${list.length > lim ? `<button class="btn sm ghost" data-act="el-more" data-g="${g}">${L(`Ver todos (${list.length})`, `See all (${list.length})`)}</button>` : S.elAll?.[g] && !gsel ? `<button class="btn sm ghost" data-act="el-more" data-g="${g}">${L("Mostrar menos", "Show less")}</button>` : ""}`; }).join("") || `<p class="muted">${L("Nada aqui.", "Nothing here.")}</p>`}`;
}
/** Botão de IA que vira "Gerando… · Cancelar" enquanto roda. */
function runBtn(key: string, act: string, primary: boolean, label: string) {
  if (S.writing && S.anRun === key) { const a = [...S.acts].reverse().find((x) => x.state === "run"); return `<span class="runbtn"><span class="spin"></span> ${L("Gerando", "Working")}${a ? ` <em data-elapsed="${a.t}">${Math.round((Date.now() - a.t) / 1000)}s</em>` : ""}</span><button class="btn sm ghost" data-act="stop-gen">${ic("stop", 12)} ${L("Cancelar", "Cancel")}</button>`; }
  return `<button class="btn sm ${primary ? "primary" : ""}" data-act="${act}" ${S.writing ? `disabled title="${L("Espere a tarefa atual terminar (ou cancele)", "Wait for the current task (or cancel it)")}"` : ""}>${ic("sparkles", 14)} ${label}</button>`;
}
function findingCard(f: Finding, k: number, isP: boolean, busy: boolean) {
  return `<div class="finding ${f.status}"><div class="fhead"><b>${esc(f.title)}</b><i class="chip">${esc(f.kind)}</i>${f.status === "fixed" ? `<i class="chip st-ok">${L("corrigido", "fixed")}</i>` : f.status === "ignored" ? `<i class="chip">${L("ignorado", "ignored")}</i>` : ""}</div><p>${esc(f.problem)}</p>${f.fix ? `<p class="fix"><b>${L("Como corrigir", "How to fix")}:</b> ${esc(f.fix)}</p>` : ""}
    <div class="row">${f.chapters.map((c) => `<button class="chip" data-act="an-ch" data-i="${c}">${L("Cap.", "Ch.")} ${c + 1}</button>`).join("")}<span class="grow"></span>${isP && f.status === "open" ? `<button class="btn sm" data-act="an-fix" data-k="${k}" ${busy ? "disabled" : ""}>${ic("pen", 13)} ${L("Corrigir com IA", "Fix with AI")}</button>` : ""}${f.status !== "fixed" ? `<button class="btn sm ghost" data-act="an-ignore" data-k="${k}">${f.status === "ignored" ? L("Reabrir", "Reopen") : L("Ignorar", "Ignore")}</button>` : ""}</div></div>`;
}
function reviewView(cur: { id: string; title: string; proj: boolean }, sel?: ChapLedger) {
  const an = S.analysis[cur.id] || { ledger: [] }, busy = !!S.writing, isP = cur.proj, contra = an.contradictions;
  const card = (icn: string, t: string, sub: string, action: string, body: string) => `<section class="rcard"><div class="rcard-h"><span class="avatar wk">${ic(icn, 16)}</span><div class="mtx"><b>${t}</b><small class="muted">${sub}</small></div>${action}</div>${body}</section>`;
  if (sel) {
    const i = sel.i, imp = an.improve?.[i], mine = (contra || []).map((f, k) => [f, k] as const).filter(([f]) => f.chapters.includes(i));
    const impBody = imp ? `${imp.findings.map((f, k) => `<div class="finding ${f.status}"><div class="fhead"><b>${esc(f.title)}</b>${f.status === "fixed" ? `<i class="chip st-ok">${L("aplicado", "applied")}</i>` : ""}</div><div class="ba"><div><small>${L("Como está", "As it is")}</small><blockquote>${esc(f.quote || "")}</blockquote></div><div><small>${L("Sugestão", "Suggestion")}</small><p class="sugg">${esc(f.suggestion || "")}</p></div></div><p class="muted">${esc(f.problem)}</p>
        <div class="row"><span class="grow"></span>${isP && f.status !== "fixed" ? `<button class="btn sm primary" data-act="an-apply" data-k="${k}">${ic("check", 13)} ${L("Aplicar no capítulo", "Apply to the chapter")}</button>` : ""}<button class="btn sm ghost" data-act="an-copy" data-k="${k}">${ic("clipboard", 13)} ${L("Copiar", "Copy")}</button></div></div>`).join("")}
      ${imp.words.length ? `<h4>${L("Palavras que podem ser melhores", "Words that could be better")}</h4><div class="wordgrid">${imp.words.map(([a, b, why], k) => `<div class="wordc"><s>${esc(a)}</s> → <b>${esc(b)}</b>${why ? `<small>${esc(why)}</small>` : ""}${isP ? `<button class="icon" data-act="an-word" data-k="${k}" title="${L("Trocar no capítulo", "Replace in the chapter")}">${ic("check", 13)}</button>` : ""}</div>`).join("")}</div>` : ""}
      ${imp.imagery.length ? `<h4>${L("Para o leitor imaginar melhor", "So the reader can picture it")}</h4><ul class="imglist">${imp.imagery.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`
      : `<p class="muted">${L("A IA lê este capítulo e aponta: trechos fracos (com uma versão reescrita), palavras que podem ser mais precisas e onde falta o leitor ver o lugar, o movimento e os sentidos — conferindo cada lugar, objeto e evento do capítulo.", "The AI reads this chapter and points out weak passages (with a rewritten version), words that could be more precise, and where the reader can't see the place, the movement and the senses — checking each place, object and event in the chapter.")}</p>`;
    return card("pen", L("Como escrever melhor", "How to write better"), imp ? L(`${imp.findings.length} trechos · ${imp.words.length} palavras · ${imp.imagery.length} notas de imagem`, `${imp.findings.length} passages · ${imp.words.length} words · ${imp.imagery.length} imagery notes`) : L("ainda não analisado", "not analyzed yet"),
        runBtn("improve", "an-improve", !imp, imp ? L("Analisar de novo", "Analyze again") : L("Analisar este capítulo", "Analyze this chapter")), impBody)
      + (mine.length ? card("compass", L("Contradições neste capítulo", "Contradictions in this chapter"), `${mine.length}`, "", mine.map(([f, k]) => findingCard(f, k, isP, busy)).join("")) : "");
  }
  const rev = Object.keys(an.improve || {}).length, open = (contra || []).filter((f) => f.status === "open");
  const end = an.endings;
  return `<p class="muted mtip">${L("Revisão do livro inteiro. Para revisar o texto de um capítulo (trechos fracos, palavras, imagens), escolha o capítulo na lista à esquerda.", "Whole-book review. To review a chapter's text (weak passages, words, imagery), pick the chapter in the list on the left.")}</p>
    ${card("compass", L("Contradições e erros", "Contradictions and errors"), contra ? L(`${open.length} em aberto · ${contra.filter((f) => f.status === "fixed").length} corrigidos`, `${open.length} open · ${contra.filter((f) => f.status === "fixed").length} fixed`) : L("datas, idades, nomes, objetos que somem, furos de roteiro", "dates, ages, names, vanishing objects, plot holes"),
      runBtn("contra", "an-contra", !contra, contra ? L("Procurar de novo", "Search again") : L("Procurar", "Search")),
      contra ? (contra.length ? contra.map((f, k) => findingCard(f, k, isP, busy)).join("") : `<p class="hint">${ic("check", 14)} <span>${L("Nenhuma contradição encontrada.", "No contradictions found.")}</span></p>`) : `<p class="muted">${L("Usa as anotações dos capítulos, então é rápido e barato — não relê o livro inteiro.", "Uses the chapter notes, so it's fast and cheap — it doesn't re-read the whole book.")}</p>`)}
    ${card("pen", L("Revisão por capítulo", "Review by chapter"), L(`${rev} de ${an.ledger.length} capítulos revisados`, `${rev} of ${an.ledger.length} chapters reviewed`), "", `<div class="mprog"><i style="width:${Math.round((rev / Math.max(1, an.ledger.length)) * 100)}%"></i></div><div class="chipsw">${an.ledger.map((c) => `<button class="chip ${an.improve?.[c.i] ? "st-ok" : ""}" data-act="an-ch" data-i="${c.i}">${an.improve?.[c.i] ? ic("check", 10) : ""} ${c.i + 1}</button>`).join("")}</div>`)}
    ${card("feather", L("Finais alternativos", "Alternative endings"), end ? `${end.length} ${L("opções", "options")}` : L("3 caminhos diferentes para o final, no estilo do autor", "3 different paths for the ending, in the author's style"),
      runBtn("endings", "an-endings", !end, end ? L("Gerar outros", "Generate others") : L("Gerar", "Generate")),
      end ? `<div class="endgrid">${end.map((e, k) => `<div class="endc"><b>${esc(e.title)}</b><small class="muted">${esc(e.tone)}</small><p>${esc(e.summary)}</p>${e.changes ? `<p class="muted"><b>${L("Ajustes antes", "Earlier changes")}:</b> ${esc(e.changes)}</p>` : ""}${isP ? `<button class="btn sm" data-act="an-use-end" data-k="${k}">${ic("feather", 13)} ${L("Usar no último capítulo", "Use in the last chapter")}</button>` : ""}</div>`).join("")}</div>` : "")}`;
}
after.mapa = () => {
  if (S.mapTab === "mapa") paintMap(); else { mapCtl?.stop(); mapCtl = null; }
  const q = $<HTMLInputElement>("#elq"); if (q) q.oninput = () => { const k = q.value.trim().toLowerCase(); document.querySelectorAll<HTMLElement>(".elc").forEach((e) => (e.style.display = !k || (e.dataset.n || "").includes(k) ? "" : "none")); };
  document.querySelector(".mch.on")?.scrollIntoView({ block: "nearest" });
};

// ---------- IA ----------
function ctx(p: Project) {
  const ch = p.chapters[S.chap];
  const sel = window.getSelection()?.toString() || "";
  const prev = p.chapters[S.chap - 1];
  return { title: p.title, premise: p.premise + (castText(p) ? "\n" + castText(p) : ""), chapters: p.nChapters, chapterTitle: ch?.title, chapterPlan: ch?.plan, selection: sel, tail: strip(ch?.html || "").slice(-3000), prevTail: prev ? strip(prev.html).slice(-1200) : "" };
}

async function ask(prompt: string, p: Project, opts: { record?: boolean } = {}) {
  if (S.busy === "ai") return;
  if (!engineReady()) { S.picker = true; render(); toast("Escolha e prepare um motor de escrita com IA", true); return null; }
  S.busy = "ai"; S.aiText = ""; S.aiProj = p.id;
  if (opts.record !== false) p.chat.push({ role: "user", content: prompt });
  render();
  const act = actStart("sparkles", L("Respondendo no chat", "Answering in the chat"), engName());
  try {
    const out = await runAI({
      mode: S.settings.mode, models: S.settings.models, system: await buildSystem(prompt + " " + p.premise + " " + (p.chapters[S.chap]?.plan || ""), p), history: p.chat.slice(0, -1), prompt,
      onStatus: (st) => { const l = $("#live"); if (l && !S.aiText) l.innerHTML = `<em>${esc(tr(st))}</em>`; },
      onDelta: (d) => { S.aiText += d; const l = $("#live"); if (l) { l.innerHTML = marked.parse(S.aiText) as string; const m = $("#msgs"); m.scrollTop = m.scrollHeight; } },
    });
    if (opts.record !== false) p.chat.push({ role: "assistant", content: out, by: act.ai });
    saveProjects(); actEnd(act, `${words(out)} ${L("palavras", "words")}`);
    return out;
  } catch (e: any) { actEnd(act, String(e?.message || e), false); toast(String(e?.message || e), true); if (S.aiText) p.chat.push({ role: "assistant", content: S.aiText, by: act.ai }); return null; }
  finally { S.busy = ""; S.aiText = ""; render(); }
}

function applyOutline(text: string, p: Project) {
  const parts = text.split(/\n(?=#{1,3}\s*(?:chapter|cap[ií]tulo)?\s*\d*)/i).map((s) => s.trim()).filter((s) => /^#/.test(s));
  if (parts.length < 2) return toast("Não achei capítulos nessa resposta (esperado ‘## Chapter N: …’)", true);
  p.chapters = parts.map((s) => { const [h, ...rest] = s.split("\n"); return { id: uid(), title: h.replace(/^#+\s*/, "").trim(), plan: rest.join(" ").trim(), html: "" }; });
  S.chap = 0; saveProjects(); render(); toast(`${p.chapters.length} capítulos criados`);
}

function parseKdp(out: string, p: Project) {
  const sec = (name: string) => out.split(new RegExp(`\\**#*\\s*${name}\\s*\\**:?`, "i"))[1]?.split(/\n\s*\**#*\s*(DESCRIPTION|KEYWORDS|CATEGORIES|SUBTITLE)\b/i)[0]?.trim() || "";
  const lines = (s: string) => s.split("\n").map((l) => l.replace(/^[\s\-*\d.)]+/, "").trim()).filter(Boolean);
  const d = sec("DESCRIPTION"); if (d) p.kdp.description = d;
  const k = lines(sec("KEYWORDS")); if (k.length) p.kdp.keywords = k.slice(0, 7);
  const c = lines(sec("CATEGORIES")); if (c.length) p.kdp.categories = c.slice(0, 3);
  const s = lines(sec("SUBTITLE"))[0]; if (s && !p.subtitle) p.subtitle = s.replace(/^["“]|["”]$/g, "");
}

const EFFORTS: [string, string][] = [["low", "Baixo"], ["medium", "Médio"], ["high", "Alto"], ["xhigh", "Muito alto"], ["max", "Máximo"]];
const effortOf = () => S.settings.models.claudeEffort || "medium";
const claudeLabel = () => `Claude · ${S.usage.model ? String(S.usage.model).replace(/^claude-/, "").replace(/-(\d+)-(\d+).*$/, " $1.$2") : (S.settings.models.claude || L("padrão", "default"))} · ${tr(EFFORTS.find((e) => e[0] === effortOf())![1])}`;
const engName = () => { const m = S.settings.mode; if (m === "claude") return claudeLabel(); const n = ENGINES.find((e) => e.id === m)?.name || ""; const mod = (S.settings.models as any)?.[m]; return mod ? `${n} · ${mod}` : n; };
/** Qual IA gera a imagem. */
const imgAIName = (prov: string) => prov === "local" ? L("Grátis · neste computador (Z-Image-Turbo)", "Free · this computer (Z-Image-Turbo)") : `${prov === "openai" ? "ChatGPT" : "Gemini"} · ${(S.settings.img.provider === prov && S.settings.img.model) || (prov === "openai" ? "gpt-image-1" : "gemini-2.5-flash-image")} · ${L("pago", "paid")}`;
/** Janela de confirmação: diz exatamente para qual IA vai o pedido e o que vai acontecer. */
function confirmAI(o: { to: string; what: string; text?: string; effect: string; ok?: string; toLabel?: string; icon?: string }): Promise<boolean> {
  return new Promise((res) => {
    document.getElementById("cfm")?.remove();
    const m = document.createElement("div"); m.className = "overlay"; m.id = "cfm";
    m.innerHTML = `<div class="picker cfm"><h2>${esc(o.what)}</h2>
      <div class="cfmto">${ic(o.icon || "cpu", 16)}<div><small>${o.toLabel || L("Vai para", "Goes to")}</small><b>${esc(o.to)}</b></div></div>
      ${o.text ? `<div class="cfmtext"><small>${L("Seu pedido", "Your request")}</small><p>${esc(o.text.slice(0, 600))}${o.text.length > 600 ? "…" : ""}</p></div>` : ""}
      <p class="muted">${esc(o.effect)}</p>
      <div class="row adfoot"><button class="btn ghost" data-r="0">${L("Cancelar", "Cancel")}</button><span class="grow"></span><button class="btn primary" data-r="1">${esc(o.ok || L("Enviar", "Send"))}</button></div></div>`;
    const done = (v: boolean) => { m.remove(); document.removeEventListener("keydown", key, true); res(v); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); } };
    m.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-r]"); if (b) { e.stopPropagation(); done(b.dataset.r === "1"); } else if (e.target === m) done(false); });
    document.addEventListener("keydown", key, true);
    document.body.appendChild(m); m.querySelector<HTMLElement>('[data-r="1"]')?.focus();
  });
}
// ---------- limites e tempo estimado ----------
/** Páginas com boa coerência e velocidade padrão (tokens/s num Mac com chip Apple; o app mede a sua máquina). */
const LOCAL_SPEC: Record<string, { pages: number; tps: number }> = { rapido: { pages: 80, tps: 20 }, equilibrado: { pages: 200, tps: 9 }, escritor: { pages: 300, tps: 5 } };
const localSpec = (id: string) => LOCAL_SPEC[id] || { pages: 150, tps: 8 };
const localTps = (id: string) => S.settings.speed?.[id] || localSpec(id).tps;
const fmtTime = (sec: number) => sec < 3600 ? `~${Math.max(1, Math.round(sec / 60))} min` : `~${(sec / 3600).toFixed(1).replace(".0", "").replace(".", ",")} h`;
/** Segundos para escrever N páginas (texto + releitura do contexto a cada parte). */
function bookSeconds(mode: Mode, pages: number, modelId = S.settings.models.local) {
  const w = pages * wpp(), tokens = w * 1.35;
  if (mode === "local") { const t = localTps(modelId); return tokens / t + (w / 700) * (4000 / (t * 12)); }
  if (mode === "claude") return tokens / 55 + (w / 1500) * 12;
  if (mode === "openai" || mode === "gemini") return tokens / 70 + (w / 1500) * 4;
  return 0;
}
function engineLimits(mode: Mode, pages?: number): string {
  if (mode === "offline") return "Não escreve o texto do livro — só roteiro, rascunho guiado e checagem de estilo. Instantâneo.";
  if (mode === "local") {
    const m = localReady(); if (!m) return "Baixe um modelo para ver o limite e o tempo.";
    const sp = localSpec(m.id), pg = pages || 150;
    return `${m.name}: recomendado até ~${sp.pages} páginas · ${pg} páginas em ${fmtTime(bookSeconds("local", pg, m.id))} neste computador${pg > sp.pages ? ` · acima do recomendado, a história pode perder coerência` : ""}`;
  }
  const pg = pages || 150;
  return `Sem limite prático de páginas · ${pg} páginas em ${fmtTime(bookSeconds(mode, pg))} · usa a cota da sua ${mode === "claude" ? "assinatura do Claude" : "chave de API"}`;
}

// ---------- motor de escrita ----------
const ENGINES: { id: Mode; name: string; tag: string; icon: string; grad: string; does: string[]; cover: boolean }[] = [
  { id: "offline", name: "Básico", tag: "Instantâneo, sem IA", icon: ic("blocks", 22), grad: "#8a8aa3,#3a3a48", does: ["Análise do estilo e bíblia do autor", "Esboço por estrutura narrativa", "Rascunho guiado e checagem de estilo"], cover: false },
  { id: "local", name: "Local", tag: "IA no seu computador, sem internet", icon: ic("cpu", 22), grad: "#3fa57a,#12503a", does: ["Escreve capítulos inteiros no estilo do autor", "Privado: nada sai do seu computador", "Baixa o modelo uma vez e usa para sempre"], cover: false },
  { id: "claude", name: "Claude", tag: "A melhor escrita · sua assinatura", icon: ic("claude", 22), grad: "#e08a63,#8a3a1f", does: [], cover: false },
  { id: "openai", name: "ChatGPT", tag: "Texto e capas · chave de API", icon: ic("openai", 22), grad: "#2bbd94,#0b5d48", does: [], cover: true },
  { id: "gemini", name: "Gemini", tag: "Texto e capas · chave de API", icon: ic("gemini", 22), grad: "#6b8cff,#7b3fe4", does: [], cover: true },
];
const localReady = () => S.local.models.find((m) => m.id === S.settings.models.local && m.ready);
function engineStatus(id: Mode): [boolean, string] {
  if (id === "offline") return [true, "Sempre pronto"];
  if (id === "local") { const m = localReady(); return m ? [true, `Pronto · ${m.name}`] : [false, S.local.models.some((x) => x.ready) ? "Escolha o modelo" : "Baixar um modelo"]; }
  if (id === "claude") return S.claude?.ok ? [true, `Pronto · ${String(S.usage.model || S.settings.models.claude || "").replace(/^claude-/, "") || "Claude Code"} · ${tr(EFFORTS.find((e) => e[0] === effortOf())![1])}`] : [false, "Instale o Claude Code"];
  return S.keys?.[id] ? [true, "Pronto · chave salva"] : [false, "Adicionar chave"];
}
const engineReady = () => S.settings.mode !== "offline" && engineStatus(S.settings.mode)[0];
function engineButton() {
  const e = ENGINES.find((x) => x.id === S.settings.mode)!;
  const [ok, st] = engineStatus(e.id);
  return `<button class="engine-btn" data-act="picker" style="--g:linear-gradient(135deg,${e.grad})"><span class="eico">${e.icon}</span><span class="etx"><b>${e.name}</b><small class="${ok ? "ok" : "warn"}">● ${esc(st)}</small></span><span class="chev">${ic("chevron", 14)}</span></button>`;
}
const gb = (n: number) => (n / 1e9).toFixed(1).replace(".", ",") + " GB";
function picker() {
  const mode = S.settings.mode as Mode;
  const card = (e: (typeof ENGINES)[number], big: boolean) => { const [ok, st] = engineStatus(e.id); return `<button class="ecard ${big ? "big" : ""} ${mode === e.id ? "on" : ""}" data-act="set-mode" data-m="${e.id}" style="--g:linear-gradient(135deg,${e.grad})">
    ${big ? `<span class="free">GRÁTIS</span>` : ""}<span class="eicon">${e.icon}</span><b>${e.name}</b><span class="etag">${e.tag}</span>
    ${big ? `<ul class="does">${e.does.map((d) => `<li>${d}</li>`).join("")}</ul><span class="elim">${ic("clipboard", 13)} ${e.id === "offline" ? "Limite: 0 páginas de texto (não escreve prosa)" : `Limite: ${Object.entries(LOCAL_SPEC).map(([id, v]) => `${({ rapido: "Rápido", equilibrado: "Equilibrado", escritor: "Escritor" } as any)[id]} ~${v.pages} pág`).join(" · ")}`}</span><span class="elim">${ic("cpu", 13)} ${e.id === "offline" ? "Tempo: instantâneo" : `Tempo para 150 páginas: ${Object.keys(LOCAL_SPEC).map((id) => fmtTime(bookSeconds("local", 150, id))).join(" · ")}`}</span>` : ""}
    <span class="ecap">${e.cover ? (ic("image") + " Gera capas") : (ic("image") + " Não gera capas")}</span>
    <span class="est ${ok ? "ok" : "warn"}">${ok ? (ic("check") + "") : "•"} ${esc(st)}</span></button>`; };
  const cards = `<div class="egrid main">${ENGINES.slice(0, 2).map((e) => card(e, true)).join("")}</div>
    <div class="esep"><span>Com conta ou chave de API</span></div><div class="egrid more">${ENGINES.slice(2).map((e) => card(e, false)).join("")}</div>
    <p class="muted capnote">${ic("image")} ${L("Capas: grátis neste computador (botão Imagens na barra lateral) ou pelo ChatGPT/Gemini com a sua chave. A escrita e as capas são escolhas separadas.", "Covers: free on this computer (Images button in the sidebar) or through ChatGPT/Gemini with your key. Writing and covers are separate choices.")}</p>`;
  let detail = "";
  if (mode === "local") detail = `<div class="pdetail"><h3>Modelos do modo Local</h3><p class="muted">${L("Baixe uma vez e use para sempre, sem internet e sem custo.", "Download once and use it forever, offline and free.")} ${S.local.ram ? L(`Seu computador tem ${S.local.ram} GB de memória.`, `Your computer has ${S.local.ram} GB of memory.`) : ""} ${L("Tudo é processado no seu processador/GPU.", "Everything runs on your processor/GPU.")}</p>
    <div class="mgrid">${S.local.models.map((m) => { const d = S.dl[m.id]; const pct = d ? Math.round((d.done / d.total) * 100) : m.partial ? Math.round((m.partial / m.size) * 100) : 0; const sel = S.settings.models.local === m.id;
      return `<div class="mcard ${sel ? "on" : ""} ${m.fits ? "" : "heavy"}"><div class="mtop"><b>${esc(m.name)}</b>${m.id === "equilibrado" ? `<span class="pill">Recomendado</span>` : ""}</div><span class="muted">${esc(m.desc)}</span>
      <span class="muted">${gb(m.size)}${m.ram ? ` · precisa de ${m.ram} GB de RAM` : ""}${m.fits ? "" : " · pesado para esta máquina"}</span>
      <span class="mlim">Até ~${localSpec(m.id).pages} páginas · 150 páginas em ${fmtTime(bookSeconds("local", 150, m.id))}${S.settings.speed?.[m.id] ? " (medido)" : " (estimado)"}</span>
      ${d ? `<div class="pbar"><i style="width:${pct}%"></i></div><div class="row"><span class="muted">${pct}% · ${gb(d.done)} de ${gb(d.total)}</span><button class="btn sm" data-act="dl-cancel">Pausar</button></div>`
        : m.ready ? `<div class="row"><button class="btn sm ${sel ? "primary" : ""}" data-act="use-model" data-id="${m.id}">${sel ? (ic("check") + " Em uso") : "Usar este"}</button><button class="icon" data-act="del-model" data-id="${m.id}" title="Apagar do computador">${ic("trash")}</button></div>`
        : `<button class="btn sm primary" data-act="dl-model" data-id="${m.id}">${pct ? `Continuar download (${pct}%)` : `Baixar (${gb(m.size)})`}</button>`}</div>`; }).join("")}</div>
    <button class="btn sm" data-act="import-gguf">Usar um arquivo .gguf que já tenho</button></div>`;
  else if (mode === "claude") detail = `<div class="pdetail"><h3>Claude</h3><div class="row"><span class="muted">Modelo:</span><div class="seg">${[["", "Padrão"], ["opus", "Opus (melhor escrita)"], ["sonnet", "Sonnet (mais rápido)"]].map(([v, l]) => `<button class="${(S.settings.models.claude || "") === v ? "on" : ""}" data-act="claude-model" data-v="${v}">${l}</button>`).join("")}</div></div><p>${S.claude?.ok ? `${ic("check")} Claude Code encontrado (${esc(S.claude.version)}). Ele usa a sua assinatura do Claude — sem chave de API.<br>${esc(engineLimits("claude", 180))}` : "Instale o Claude Code (claude.com/claude-code) e rode <code>claude</code> uma vez no terminal para entrar na sua conta."}</p></div>`;
  else if (mode === "openai" || mode === "gemini") detail = `<div class="pdetail"><h3>${mode === "openai" ? "ChatGPT" : "Gemini"}</h3><div class="row"><input type="password" id="key-${mode}" placeholder="${S.keys[mode] ? "•••••• chave salva (cole outra para trocar)" : "Cole a chave de API"}"><button class="btn" data-act="key" data-p="${mode}">Salvar</button></div><p class="muted">Modelo e testes em Configurações.</p></div>`;
  else detail = `<div class="pdetail"><h3>Básico</h3><p class="muted">Sem IA: análise de estilo, esboço por estrutura narrativa, rascunho guiado com trechos do acervo e checagem de estilo. Para escrever capítulos completos use “No meu computador” ou Claude.</p></div>`;
  return `<div class="overlay" id="overlay"><div class="picker"><div class="phead"><div><h2>Quem vai escrever com você?</h2><p class="muted">Troque quando quiser — seus livros e o estilo do autor continuam os mesmos.</p></div><button class="icon" data-act="picker-close">${ic("x")}</button></div>
    ${cards}${detail}</div></div>`;
}

// ---------- estilo e referências de cada livro ----------
const authorBooks = () => S.lib.filter((i) => i.kind === "livro");
const refWorks = () => S.lib.filter((i) => i.kind === "referencia");
function styleOf(p?: Project | null): BookStyle {
  const def: BookStyle = { base: authorBooks().length ? (S.settings.useRefs && refWorks().length ? "both" : "author") : "refs", books: null, refs: null, genres: p?.genre || "", tone: "", pov: "", tense: "", audience: "", comps: "", notes: "", coverStyle: "", coverRef: "author" };
  return { ...def, ...(p?.style || {}) };
}
/** Livros do autor e referências que valem para este livro. */
function styleSources(st: BookStyle) {
  const books = st.base === "refs" ? [] : authorBooks().filter((b) => !st.books || st.books.includes(b.id));
  const refs = st.base === "author" ? [] : refWorks().filter((b) => (st.refs ? st.refs.includes(b.id) : (b as any).use !== false));
  return { books, refs };
}
async function sources() {
  const { books, refs } = styleSources(styleOf(proj()));
  return Promise.all([...books, ...refs].map(async (b) => ({ title: b.title, text: await textOf(b.id) })));
}
const POVS: [string, string, string][] = [["", "Igual aos livros do autor", ""], ["first", "Primeira pessoa", "first person"], ["third-limited", "Terceira pessoa próxima", "close third person"], ["third-omni", "Terceira pessoa onisciente", "omniscient third person"], ["multi", "Vários pontos de vista", "multiple POV characters, alternating by chapter"]];
const TENSES: [string, string, string][] = [["", "Igual aos livros do autor", ""], ["past", "Passado", "past tense"], ["present", "Presente", "present tense"]];
const AUDS: [string, string, string][] = [["", "Igual aos livros do autor", ""], ["adult", "Adulto", "adult readers"], ["na", "Jovem adulto (New Adult)", "new adult readers (18-25)"], ["ya", "Juvenil (YA)", "young adult readers, no explicit content"]];
const BASES: [BookStyle["base"], string, string][] = [["author", "Só os livros do autor", "voz, ritmo e temas do autor"], ["both", "Autor + obras de referência", "voz do autor, referências para atmosfera e estrutura"], ["refs", "Só as obras de referência", "imita o estilo das referências escolhidas"]];
/** Bloco curto com as decisões deste livro (vai em todo pedido). */
function bookBrief(p?: Project | null) {
  if (!p) return "";
  const st = styleOf(p), en = (l: [string, string, string][], v: string) => l.find((x) => x[0] === v)?.[2] || "";
  const { books, refs } = styleSources(st);
  const lines = [
    st.base === "refs" ? `Voice: imitate the reference works (${refs.map((r) => r.title).join(", ") || "none selected"}), not any other author.` : st.base === "both" ? `Voice: the author's own voice (books: ${books.map((b) => b.title).join(", ")}); use the reference works (${refs.map((r) => r.title).join(", ")}) only for atmosphere, structure and genre conventions — never their voice.` : books.length ? `Voice: the author's own books only (${books.map((b) => b.title).join(", ")}).` : "",
    (st.genres || p.genre) && `Genres: ${st.genres || p.genre}.`, st.tone && `Tone/mood: ${st.tone}.`, en(POVS, st.pov) && `Point of view: ${en(POVS, st.pov)}.`, en(TENSES, st.tense) && `Tense: ${en(TENSES, st.tense)}.`,
    en(AUDS, st.audience) && `Audience: ${en(AUDS, st.audience)}.`, st.comps && `Comparable to: ${st.comps} (feel and market, never copy).`, st.notes && `Style notes from the author: ${st.notes}`,
  ].filter(Boolean);
  return lines.length ? `# This book: style decisions (follow them)\n${lines.join("\n")}` : "";
}
async function buildSystem(query: string, book?: Project) {
  const p = book || proj(), st = styleOf(p);
  buildIndex(await sources());
  const brief = bookBrief(p);
  if (st.base === "refs") {
    const ex = retrieve(query, S.settings.mode === "local" ? 3 : 4, S.settings.mode === "local" ? 1300 : 1800);
    if (S.settings.mode === "local") return localSystem({ name: "the reference works" }, null, brief, ex);
    return `You are a fiction ghostwriter. Write new original stories in the style of the reference works below (voice, rhythm, dialogue, atmosphere) without copying them, organized for publishing on Amazon KDP. Output only clean prose when writing chapters (paragraphs, dialogue in quotes, *** for scene breaks).\n\n${brief}\n\n# Reference passages most similar to this request\n${ex.map((e) => `(${e.src})\n${e.text}`).join("\n\n")}`;
  }
  if (S.settings.mode === "local") return localSystem(S.author, S.profile, brief + "\n" + bibleText(S.bible, query, 2000), retrieve(query, 3, 1300));
  const ex = retrieve(query, 4, 1800);
  return systemPrompt(S.author, S.profile, S.author.notes) + `\n\n${brief}\n\n${bibleText(S.bible, query, 5000)}\n\n# Passages most similar to this request\n${ex.map((e) => `(${e.src})\n${e.text}`).join("\n\n")}`;
}

// ---------- tamanho do livro ----------
/** Palavras por página medidas nos livros do autor (o miolo impresso), entre 180 e 320. */
function wpp() {
  const b = S.lib.filter((i) => i.kind === "livro" && i.pages > 20);
  const w = b.reduce((n, x) => n + x.words, 0), pg = b.reduce((n, x) => n + x.pages, 0);
  return pg ? Math.max(180, Math.min(320, Math.round(w / pg))) : 250;
}
/** Tamanho de capítulo do autor (mínimo 1500 palavras para não virar dezenas de capítulos minúsculos). */
const chapterWords = () => Math.max(1500, Math.min(4500, S.profile?.avgChapterWords || 2500));
const totalWords = (p: Project) => (p.pages ? p.pages * wpp() : p.nChapters * chapterWords());
const perChapter = (p: Project) => Math.max(800, Math.round(totalWords(p) / Math.max(1, p.chapters.length || p.nChapters)));
const chaptersFor = (pages: number) => Math.max(5, Math.min(80, Math.round((pages * wpp()) / chapterWords())));
function sizeInfo(p: Project) { const n = Math.max(1, p.nChapters || p.chapters.length); return `≈ ${totalWords(p).toLocaleString(locale())} palavras · ${n} capítulos de ~${Math.round(totalWords(p) / n).toLocaleString(locale())} palavras`; }

/** Roda a IA sem passar pelo chat, mostrando o andamento na barra. */
async function gen(label: string, prompt: string, query: string, maxTokens: number, onDelta: (d: string) => void = () => {}, act?: Act) {
  let t0 = 0, chars = 0;
  const out = await runAI({ mode: S.settings.mode, models: S.settings.models, system: await buildSystem(query), history: [], prompt, maxTokens, onDelta: (d) => {
      if (!t0) t0 = performance.now(); chars += d.length; onDelta(d);
      if (act) { act.live += d; paintAct(act); }
      const sec = (performance.now() - t0) / 1000;
      if (S.settings.mode === "local" && sec > 20 && chars > 1500 && Math.random() < 0.05) { S.settings.speed = { ...(S.settings.speed || {}), [S.settings.models.local]: Math.round(chars / 4.2 / sec * 10) / 10 }; save_("settings", S.settings); }
    },
    onStatus: (st) => { const b = $("#busy"); if (b) b.textContent = `${label}: ${tr(st)}`; if (act && !act.live) { act.detail = tr(st); paintAct(act); } } });
  return out;
}
const busyText = (t: string) => { S.busy = t; const b = $("#busy"); if (b) b.textContent = tr(t); };
const L = (pt: string, en: string) => (isEn() ? en : pt);

// ---------- histórico de versões: nada do que foi gerado se perde ----------
async function histSummary(ms: string) { try { const v = await invoke<any[]>("history_get", { key: "projects", ms }); return Array.isArray(v) ? v.map((p) => `${p.title || "?"} (${p.chapters?.length || 0} ${L("cap.", "ch.")}, ${(p.chapters || []).reduce((n: number, c: any) => n + words(htmlText(c.html || "")), 0).toLocaleString(locale())} ${L("palavras", "words")})`).join(" · ") || L("nenhum livro", "no books") : ""; } catch { return ""; } }
after.config = async () => {
  const box = $("#histbox"); if (!box) return;
  const list = await invoke<{ ms: string; size: number }[]>("history_list", { key: "projects" }).catch(() => []);
  const dir = await invoke<string>("data_dir");
  box.innerHTML = `<h3>${ic("clock", 16)} ${L("Histórico de versões (automático)", "Version history (automatic)")}</h3>
    <p class="muted">${L("Antes de cada mudança nos livros do Estúdio o app guarda a versão anterior (no máximo a cada 3 min, e sempre que algo some). Tudo que a IA gera também fica gravado em texto, na pasta “generated”. Nada disso é apagado.", "Before each change to the Studio books the app keeps the previous version (at most every 3 min, and always when something disappears). Everything the AI generates is also saved as text in the “generated” folder. None of it is ever deleted.")}</p>
    <div class="row" style="margin:8px 0 12px"><button class="btn sm" data-act="reveal" data-path="${esc(dir)}/generated">${ic("folder", 13)} ${L("Abrir o que a IA gerou", "Open what the AI generated")}</button><button class="btn sm ghost" data-act="reveal" data-path="${esc(dir)}/data/history">${ic("folder", 13)} ${L("Abrir pasta do histórico", "Open history folder")}</button></div>
    ${list.length ? `<div class="hist">${list.slice(0, 25).map((h) => `<div class="hist-r"><b>${new Date(+h.ms).toLocaleString(locale())}</b><small class="muted" data-hsum="${h.ms}">…</small><span class="grow"></span><button class="btn sm" data-act="hist-restore" data-ms="${h.ms}">${ic("undo", 13)} ${L("Restaurar", "Restore")}</button></div>`).join("")}</div>` : `<p class="muted">${L("Nenhuma versão guardada ainda.", "No saved versions yet.")}</p>`}`;
  for (const h of list.slice(0, 25)) { const e = box.querySelector<HTMLElement>(`[data-hsum="${h.ms}"]`); if (e) e.textContent = await histSummary(h.ms); }
};
// ---------- painel global de tarefas de IA (aparece em qualquer tela) ----------
const dockSeen = new Set<string>();
function paintDock() {
  let d = document.getElementById("jobdock");
  if (!d) { d = document.createElement("div"); d.id = "jobdock"; document.body.appendChild(d); }
  const m = document.getElementById("msgs"), panel = !!(m && m.offsetParent);
  const now = Date.now();
  const list = S.acts.filter((a) => !dockSeen.has(a.id) && (a.state === "run" || (a.state === "done" && now - (a as any).end < 7000) || a.state === "err"));
  if (panel || !list.length) { d.innerHTML = ""; d.className = ""; return; }
  d.className = "on";
  d.innerHTML = `<div class="jd-h">${list.some((a) => a.state === "run") ? `<span class="spin"></span> ${L("IA trabalhando", "AI working")}` : L("Tarefas de IA", "AI tasks")}<span class="grow"></span>${list.some((a) => a.state === "run") ? `<button class="btn sm ghost" data-act="stop-gen">${ic("stop", 12)} ${L("Cancelar", "Cancel")}</button>` : ""}</div>
    ${list.slice(-4).map((a) => `<div class="jd-i ${a.state}"><span class="jd-ico">${a.state === "run" ? `<span class="spin"></span>` : a.state === "done" ? ic("check", 13) : ic("x", 13)}</span><div class="jd-b"><b>${esc(a.title)}</b><small>${esc(a.detail)}${a.state === "run" ? ` · ${Math.round((now - a.t) / 1000)}s` : ""}</small>${a.state === "run" ? (a.live ? `<p class="jd-live">${esc(a.live.slice(-180))}</p>` : `<p class="jd-live muted">${L("esperando a primeira resposta da IA…", "waiting for the AI's first words…")}</p>`) : ""}</div>${a.state !== "run" ? `<button class="icon" data-act="dock-x" data-id="${a.id}" title="${L("Fechar", "Close")}">✕</button>` : ""}</div>`).join("")}`;
}
// ---------- atividade ao vivo (painel do assistente) ----------
function actHtml(a: Act) {
  const sec = Math.round((Date.now() - a.t) / 1000);
  return `<div class="act ${a.state}" id="act-${a.id}" data-state="${a.state}"><div class="aico">${a.state === "run" ? `<span class="spin"></span>` : a.state === "done" ? ic("check", 14) : ic("x", 14)}</div>
    <div class="abody"><b>${ic(a.icon, 13)} ${esc(a.title)}</b>${a.ai ? `<span class="aiby">${ic("cpu", 11)} ${esc(a.ai)}</span>` : ""}<small>${esc(a.detail)}${a.state === "run" ? ` · ${sec}s` : ""}</small>
    ${a.state === "run" && a.live ? `<div class="alive"><span class="lt">${esc(a.live.slice(-700))}</span><span class="caret"></span></div>` : a.state === "run" ? `<div class="dots"><i></i><i></i><i></i></div>` : ""}</div></div>`;
}
const actsHtml = () => S.acts.length ? `<div class="acts" id="acts"><div class="acth">${ic("sparkles", 13)} ${L("O que está acontecendo", "What's happening")}</div>${S.acts.map(actHtml).join("")}</div>` : "";
let actRaf = 0;
function paintAct(a: Act) {
  if (actRaf) return;
  actRaf = requestAnimationFrame(() => {
    actRaf = 0;
    const el = document.getElementById("act-" + a.id);
    if (el && el.dataset.state === a.state && a.state === "run") {
      const sm = el.querySelector("small"); if (sm) sm.textContent = `${a.detail} · ${Math.round((Date.now() - a.t) / 1000)}s`;
      if (a.live) { let lv = el.querySelector(".alive"); if (!lv) { el.querySelector(".dots")?.remove(); el.querySelector(".abody")!.insertAdjacentHTML("beforeend", `<div class="alive"><span class="lt"></span><span class="caret"></span></div>`); lv = el.querySelector(".alive"); } lv!.querySelector(".lt")!.textContent = a.live.slice(-700); }
    } else if (el) el.outerHTML = actHtml(a); else { const box = $("#acts"); if (box) box.outerHTML = actsHtml(); else { const m = $("#msgs"); if (m) m.insertAdjacentHTML("afterbegin", actsHtml()); } }
    const m = $("#msgs"); if (m && m.scrollHeight - m.scrollTop - m.clientHeight < 260) m.scrollTop = m.scrollHeight;
    paintDock();
  });
}
function actStart(icon: string, title: string, detail = ""): Act {
  const a: Act = { id: uid(), icon, title, detail, state: "run", live: "", t: Date.now(), ai: icon === "image" ? "" : engName() };
  S.acts.push(a); if (S.acts.length > 60) S.acts.shift();
  const box = $("#acts"); if (box) box.insertAdjacentHTML("beforeend", actHtml(a)); else paintAct(a);
  return a;
}
function actEnd(a: Act, detail: string, ok = true) { (a as any).end = Date.now(); setTimeout(paintDock, 0); if (!ok && (S.stopGen || /cancel|abort|killed|interromp/i.test(detail))) { detail = L("cancelado", "cancelled"); } a.state = ok ? "done" : "err"; a.detail = detail; a.live = ""; cancelAnimationFrame(actRaf); actRaf = 0; const el = document.getElementById("act-" + a.id); if (el) el.outerHTML = actHtml(a); else paintAct(a); }
setInterval(() => { if (!S.writing) S.anRun = ""; paintDock(); document.querySelectorAll<HTMLElement>("[data-elapsed]").forEach((e) => (e.textContent = `${Math.round((Date.now() - +e.dataset.elapsed!) / 1000)}s`)); for (const a of S.acts) if (a.state === "run") { const el = document.querySelector(`#act-${a.id} small`); if (el) el.textContent = `${a.detail} · ${Math.round((Date.now() - a.t) / 1000)}s`; } }, 1000);

/** Elenco completo com IA: mantém quem você já criou, completa as fichas e cria os demais. */
async function aiCast(p: Project) {
  const have = castOf(p).filter((x) => x.name.trim());
  busyText("Criando as fichas dos personagens…");
  const act = actStart("fingerprint", L("Criando o elenco e as fichas", "Creating the cast and sheets"), L("lendo a premissa e o estilo do autor", "reading the premise and the author's style"));
  const out = await gen("Personagens", `Create the full cast of the novel "${p.title}".\nPremise: ${p.premise.slice(0, 2500)}\n${have.length ? `The author already created these characters — KEEP them (same names) and complete their sheets, respecting what is already written:\n${castText(p)}\n\nThen ADD new characters so the cast has 7 to 9 people in total.\n` : "Create 7 to 9 characters.\n"}The cast needs: protagonist, love interest, close friends, a rival, the antagonist or threat, a family member, someone with a dark secret. Intertwined relationships (friendship, romance, jealousy), diverse personalities and MBTI types, in the author's style. Use NEW names for new characters.\n\n${CAST_FORMAT}`, p.premise + " characters", 4000, undefined, act);
  mergeCast(p, parseCast(out)); saveProjects();
  const full = castOf(p).filter((c) => c.personality);
  actEnd(act, full.length ? `${full.length} ${L("personagens", "characters")}: ${full.map((c) => c.name + (c.mbti ? ` (${c.mbti})` : "")).join(", ")}` : L("não consegui ler as fichas — tente de novo", "could not read the sheets — try again"), full.length >= 3);
  render();
}

/** Lê "## Chapter N: Título" + resumo. */
function parseOutline(text: string) {
  const out: { n: number; title: string; plan: string }[] = [];
  let cur: { n: number; title: string; plan: string } | null = null;
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:#{1,4}\s*)?\**\s*(?:chapter|cap[ií]tulo)\s+(\d+)\s*\**\s*[:.\-–—]?\s*(.*?)\**\s*$/i);
    if (m) { cur = { n: +m[1], title: m[2].replace(/^["“]|["”]$/g, "").trim(), plan: "" }; out.push(cur); continue; }
    if (cur && line.trim()) cur.plan += (cur.plan ? " " : "") + line.replace(/^[\s\-*]+/, "").trim();
  }
  return out;
}

/** Roteiro completo com IA, em blocos de capítulos (cabe no contexto do modelo local). */
async function aiOutline(p: Project, force = false) {
  const n = p.nChapters, step = S.settings.mode === "local" ? 6 : 15;
  const keep = force ? 0 : Math.min(p.outlineAI || 0, p.chapters.length, n);
  const got: { title: string; plan: string }[] = p.chapters.slice(0, keep).map((c) => ({ title: c.title.replace(/^chapter\s*\d+:?\s*/i, ""), plan: c.plan || "" }));
  if (keep) actEnd(actStart("check", L(`Roteiro: ${keep} de ${n} capítulos já prontos`, `Outline: ${keep} of ${n} chapters already done`), L("continuando de onde parou, sem gastar tokens de novo", "continuing where it stopped, no tokens spent again")), "");
  let tries = 0;
  while (got.length < n && tries < Math.ceil(n / step) + 4 && !S.stopGen) {
    tries++;
    const a = got.length + 1, b = Math.min(n, got.length + step);
    busyText(`Criando o roteiro… capítulos ${a}–${b} de ${n}`);
    const act = actStart("compass", L(`Roteiro · capítulos ${a}–${b} de ${n}`, `Outline · chapters ${a}–${b} of ${n}`), L("planejando a história", "planning the story"));
    const so = got.slice(-10).map((c, k) => `Chapter ${got.length - Math.min(10, got.length) + k + 1}: ${c.title} — ${c.plan.slice(0, 260)}`).join("\n");
    const out = await gen("Roteiro", `Novel "${p.title}" — ${n} chapters in total, about ${perChapter(p)} words each.\nPremise: ${p.premise.slice(0, 2000)}\n${castText(p)}\n${so ? `Outline so far:\n${so}\n` : ""}\nWrite the outline for chapters ${a} to ${b} only${b === n ? " (the last one resolves the story and ends on an unsettling hook)" : ""}. ${archText(p.arch)}\n${worldText(p).slice(0, 1800)}\nPace it for the whole book: ${a === 1 ? "start with the characters' ordinary lives and relationships" : "escalate the tension"}${b >= n * 0.75 ? ", build to the climax" : ""}.\nFormat strictly:\n## Chapter N: Title\n3-4 sentences: what happens, which characters, the twist or emotional beat, how it ends.`, p.premise + " " + p.names, 260 * (b - a + 1) + 200, undefined, act);
    const parsed = parseOutline(out).filter((c) => c.n >= a && c.n <= b && c.plan.length > 20);
    const before = got.length;
    for (const c of parsed) if (got.length < n && c.n === got.length + 1) got.push({ title: c.title || `Chapter ${c.n}`, plan: c.plan });
    p.outlineAI = got.length;
    actEnd(act, got.length > before ? got.slice(before).map((c, k) => `${before + k + 1}. ${c.title}`).join(" · ") : L("resposta fora do formato — tentando de novo", "answer out of format — retrying"), got.length > before);
    const old = p.chapters; p.chapters = got.map((c, k): Chapter => ({ id: old[k]?.id || uid(), title: `Chapter ${k + 1}: ${c.title}`, plan: c.plan, html: old[k]?.html || "" })).concat(old.slice(got.length)); S.ptab = "write"; S.chview = "lista"; render();
  }
  if (S.stopGen) { saveProjects(); return; }
  if (got.length < n) {
    const off = outline({ premise: p.premise, chapters: n, names: castOf(p).map((x) => x.name).filter(Boolean), profile: S.profile });
    for (let k = got.length; k < n; k++) got.push({ title: off[k].title, plan: `${off[k].beat}: ${off[k].summary}` });
  }
  const old = p.chapters;
  p.chapters = got.map((c, k) => ({ id: old[k]?.id || uid(), title: /^chapter\s*\d+$/i.test(c.title) ? `Chapter ${k + 1}` : `Chapter ${k + 1}: ${c.title}`, plan: c.plan, html: old[k]?.html && strip(old[k].html).trim().length > 50 ? old[k].html : "" }));
  saveProjects();
}

const cleanPart = (t: string) => t.replace(/^\s*(#+ .*|\**\s*(chapter|part)\s+\d+[^\n]*\**)\n+/i, "").replace(/\n\s*(THE END|To be continued\.?)\s*$/i, "");

/** Escreve um capítulo inteiro: vai pedindo partes até chegar ao tamanho alvo, sempre continuando o texto. */
async function writeChapter(p: Project, i: number) {
  if (!engineReady()) { S.picker = true; render(); toast("Para escrever capítulos completos escolha Local ou Claude (o Básico não escreve texto)", true); return false; }
  const ch = p.chapters[i];
  const target = perChapter(p);
  const partW = S.settings.mode === "local" ? 700 : Math.min(target, 4000);
  S.chap = i; S.writing = ch.id; S.ptab = "write"; S.chview = "editor"; S.busy = `Escrevendo ${ch.title}…`; render();
  const act = actStart("write", L(`Escrevendo ${ch.title}`, `Writing ${ch.title}`), `0 / ~${target.toLocaleString(locale())} ${L("palavras", "words")}`);
  const prev = p.chapters[i - 1] ? strip(p.chapters[i - 1].html).slice(-1500) : "";
  const story = p.chapters.slice(Math.max(0, i - 8), i).map((c) => `${c.title}: ${(c.plan || "").slice(0, 220)}`).join("\n");
  const next = p.chapters[i + 1];
  const old = ch.done ? "" : htmlText(ch.html || "");
  let text = words(old) >= 50 && words(old) < target * 0.9 ? old : "";
  ch.done = false;
  const show = () => { const ed = $("#ed"); if (ed) { ed.innerHTML = marked.parse(text) as string; scrollPaper(); } };
  const base = `Novel: "${p.title}". Premise: ${p.premise.slice(0, 1500)}\n${castText(p)}\n${worldText(p, (ch.plan || "") + ch.title).slice(0, 1500)}\n${continuityText(p.id, i)}\n${story ? `Previous chapters:\n${story}\n` : ""}\nNOW WRITING ${ch.title}. Plan for this chapter: ${ch.plan || "(free)"}\n${next ? `(The next chapter will be: ${next.title} — ${(next.plan || "").slice(0, 160)}. Do not get there yet.)\n` : "(This is the final chapter.)\n"}`;
  const rules = `Write full scenes in the author's voice: dialogue in quotes, the characters' inner thoughts, tension. Do not summarize, do not skip time, do not repeat what was already written. Output only the story text, no headings or notes.\n${CRAFT_RULES}\n${archText(p.arch)}`;
  try {
    let k = text ? 1 : 0;
    if (text) { act.detail = L(`continuando de ${words(text)} palavras`, `continuing from ${words(text)} words`); paintAct(act); }
    const maxParts = Math.ceil(target / partW) + 3 + k;
    const need = S.settings.mode === "local" ? 0.92 : 0.8;
    while (words(text) < target * need && k < maxParts && !S.stopGen) {
      const left = target - words(text), want = Math.max(300, Math.min(partW, left)), last = left <= partW * 1.2;
      const prompt = k === 0
        ? base + (prev ? `The previous chapter ended with:\n"""${prev}"""\n` : "This is the first chapter.\n") + (last ? `Write the COMPLETE chapter (about ${want} words), ending on a hook.` : `Write the beginning of this chapter (about ${want} words). The chapter will be about ${target} words in total, so take your time: do not end the chapter.`) + "\n" + rules
        : base + `The chapter so far (last part):\n"""${text.slice(-3200)}"""\n` + (last ? `Continue from exactly where it stops and FINISH the chapter (about ${want} words), ending on a hook.` : `Continue from exactly where it stops (about ${want} words). Part ${k + 1} of about ${Math.ceil(target / partW)}: develop the next scene; do not end the chapter yet.`) + "\n" + rules;
      const before = words(text);
      if (k > 0) text += "\n\n";
      let part = "";
      busyText(`Escrevendo ${ch.title} · ${words(text).toLocaleString(locale())} de ~${target.toLocaleString(locale())} palavras`);
      act.detail = `${words(text).toLocaleString(locale())} / ~${target.toLocaleString(locale())} ${L("palavras", "words")}${k ? ` · ${L("parte", "part")} ${k + 1}` : ""}`;
      await gen(ch.title, prompt, base + p.names, Math.round(want * 1.8) + 200, (d) => { part += d; if ((part.length & 63) < d.length) { act.detail = `${(words(text) + words(part)).toLocaleString(locale())} / ~${target.toLocaleString(locale())} ${L("palavras", "words")}`; const w = document.querySelector(`.chlist button.live .cbar b`) as HTMLElement | null; if (w) w.style.width = Math.min(100, ((words(text) + words(part)) / target) * 100) + "%"; } const t0 = text; text = t0; const ed = $("#ed"); if (ed) { ed.innerHTML = marked.parse(text + cleanPart(part)) as string; scrollPaper(); } }, act);
      text += cleanPart(part).trim();
      show();
      ch.html = marked.parse(text) as string; saveProjects();
      if (words(text) - before < 60) break;
      k++;
    }
    if (!S.stopGen) ch.done = true;
    p.updated = Date.now(); saveProjects();
    if (!S.stopGen && S.settings.mode !== "offline") await ledgerOne(p.id, i); // o mapa (lugares, objetos, eventos) acompanha o que a IA escreveu
    actEnd(act, S.stopGen ? L(`parado em ${words(text)} palavras`, `stopped at ${words(text)} words`) : `${words(text).toLocaleString(locale())} ${L("palavras", "words")} · ${L("pronto", "done")}`, !S.stopGen);
    return !S.stopGen;
  } catch (e: any) { actEnd(act, String(e?.message || e), false); toast(String(e?.message || e), true); if (text) { ch.html = marked.parse(text) as string; saveProjects(); } return false; }
  finally { S.writing = ""; S.busy = ""; render(); }
}

/** Lugares, objetos e eventos do livro. Sem texto: inventa a partir da premissa. Com capítulos mapeados: junta as variações do que aparece no texto e descreve. */
async function aiWorld(p: Project) {
  const act = actStart("globe", L("Lugares, objetos e eventos", "Places, objects and events"), L(`“${p.title}”`, `“${p.title}”`));
  try {
    const led = S.analysis[p.id]?.ledger || [], have = worldOf(p).filter((x) => x.name);
    const found = led.length ? storyEls(p.id).filter((e) => e.group === "place" || e.group === "object").slice(0, 140).map((e) => `- [${e.group}] ${e.name} (ch ${[...e.chapters].sort((a, b) => a - b).map((c) => c + 1).join(",")})`).join("\n") : "";
    const story = led.map((c) => `Ch ${c.i + 1}: ${c.summary}`).join("\n").slice(0, 7000);
    const prompt = `Build the story world of the novel "${p.title}": its PLACES, OBJECTS and EVENTS.\nPremise: ${p.premise.slice(0, 1800)}\n${castText(p).slice(0, 1500)}\n`
      + (led.length ? `\nThe book is already written. Chapter summaries:\n${story}\n\nPlaces and objects found in the chapters (chapter numbers in brackets; many are variants of the same thing):\n${found}\n\nMerge variants into ONE element with the best name (e.g. "X" and "X ride" or "her camcorder" and "Sony Handycam"), keep only what matters (recurring or important to the plot) and describe it as the text shows it.\n`
        : `\nThe book is not written yet: invent specific, real-feeling places (real streets, brands and venues are welcome), the objects the plot needs, and the events.\n`)
      + (have.length ? `\nKeep these existing elements (same names; complete them if thin) and add the missing ones:\n${worldText(p)}\n` : "")
      + `\nOutput 6-10 places, 4-8 objects and 4-8 events. Events = past events that shape the story plus the big turning points, in story order${led.length ? "; put their chapter numbers in Linked to" : ""}.\n\n${WORLD_FORMAT}`;
    const out = await gen("Mundo", prompt, p.premise + " world places objects", 3800, undefined, act);
    const got = parseWorld(out); let added = 0;
    for (const g of got) { const x = worldOf(p).find((w) => elKey(w.name) === elKey(g.name!)); if (x) { for (const k of ["desc", "details", "links"] as const) if (g[k] && !x[k]) x[k] = g[k]!; } else { worldOf(p).push({ id: uid(), kind: g.kind!, name: g.name!, desc: g.desc || "", details: g.details || "", links: g.links || "" }); added++; } }
    p.updated = Date.now(); saveProjects();
    actEnd(act, got.length ? L(`${added} novos, ${got.length - added} completados`, `${added} new, ${got.length - added} completed`) : L("resposta fora do formato", "answer out of format"), got.length > 0);
  } catch (e: any) { actEnd(act, String(e?.message || e), false); }
}
/** Livro completo: fichas → roteiro → capítulos (um inteiro depois do outro). */
async function buildBook(p: Project, writeAll: boolean, force = false, coverAI = "") {
  S.stopGen = false; S.writing = "pipeline"; S.acts = []; render();
  const all = actStart("rocket", L(`Criando “${p.title}”`, `Creating “${p.title}”`), L(`${p.pages || 180} páginas · ${p.nChapters} capítulos · ${engName()}`, `${p.pages || 180} pages · ${p.nChapters} chapters · ${engName()}`));
  try {
    S.pipe = "cast"; render();
    if (castOf(p).filter((x) => x.personality && x.mbti && x.height).length < 5) await aiCast(p);
    S.pipe = "world"; render();
    if (!S.stopGen && worldOf(p).filter((x) => x.desc).length < 6) await aiWorld(p);
    S.pipe = "outline"; render();
    if (!S.stopGen && (force || p.chapters.length !== p.nChapters || (p.outlineAI !== undefined && p.outlineAI < p.nChapters) || p.chapters.every((c) => !c.plan || /^Ordinary world|^Mundo normal/.test(c.plan)))) await aiOutline(p, force);
  } catch (e: any) { toast(String(e?.message || e), true); actStart("x", L("Erro", "Error"), String(e?.message || e)).state = "err"; }
  if (coverAI && !S.stopGen) { S.pipe = "cover"; render(); await makeCover(p, coverAI); }
  S.pipe = writeAll && !S.stopGen ? "write" : ""; S.writing = ""; S.busy = ""; render();
  if (writeAll && !S.stopGen) await ACT["write-all"](document.body);
  S.pipe = ""; render();
  actEnd(all, S.stopGen ? L("parado — continue quando quiser", "stopped — continue anytime") : `${projWords(p).toLocaleString(locale())} ${L("palavras escritas", "words written")}`, !S.stopGen);
}

/** Capa com ChatGPT/Gemini: a IA de texto escreve o prompt e as capas do acervo entram como referência de estilo. */
const KAVEEL_COVER_STYLE = "dark horror-thriller book cover, photorealistic cinematic photo-manipulation, dramatic close-up of faces with intense expressions (rage, terror, menace), pale skin and deep shadows, near-black background with drifting smoke and fog, blood-red accents and blood spatter against cold desaturated teal-grey tones, high contrast, gritty texture, heavy vignette";
const localStyle = () => (S.settings.img?.localStyle ?? KAVEEL_COVER_STYLE) as string;
async function imgLocalStatus() { try { const st = await invoke<any>("img_local_status"); S.imgLocal = { ...S.imgLocal, ...st, got: st.files.reduce((n: number, f: any) => n + f.got, 0) + (st.bin ? st.binSize || 0 : 0) }; } catch { /* sem backend */ } }
/** Quanto tempo uma capa leva, pela máquina. */
function imgEst() { const st = S.imgLocal; if (st.os === "mac") return st.ram >= 16 ? L("cerca de 5 min", "about 5 min") : L("10 min ou mais", "10 min or more"); return L("1 a 10 min (depende da placa de vídeo)", "1 to 10 min (depends on the graphics card)"); }
type ImgState = "ready" | "gen" | "dl" | "partial" | "none" | "unsupported";
function imgState(): ImgState { const st = S.imgLocal; if (st.supported === false) return "unsupported"; if (st.ok) return S.writing === "cover" && (S as any).imgAct ? "gen" : "ready"; if (st.dl) return "dl"; return st.got ? "partial" : "none"; }
const imgPct = () => (S.imgLocal.total ? Math.round((S.imgLocal.got / S.imgLocal.total) * 100) : 0);
/** Status curto das imagens (barra lateral). */
function imgChip() {
  const prov = S.settings.img?.provider || "openai", k = imgState();
  const [name, ok, txt] = prov === "local" || !S.keys?.[prov]
    ? [L("Grátis · neste computador", "Free · this computer"), k === "ready" || k === "gen", ({ ready: L("Pronto", "Ready"), gen: L("Gerando capa…", "Generating a cover…"), dl: L(`Baixando ${imgPct()}%`, `Downloading ${imgPct()}%`), partial: L(`Download pausado (${imgPct()}%)`, `Download paused (${imgPct()}%)`), none: L("Não instalado · clique para ver", "Not installed · click to see"), unsupported: L("Indisponível neste computador", "Not available on this computer") } as Record<ImgState, string>)[k]]
    : [prov === "openai" ? "ChatGPT (gpt-image)" : "Gemini", true, L("Chave salva · pago por imagem", "Key saved · paid per image")];
  return `<button class="engine-btn imgchip" data-act="img-engine"><span class="eico">${ic("image", 15)}</span><span class="etx"><b>${name}</b><small class="${ok ? "ok" : "warn"} imgpct-txt">● ${esc(txt)}</small></span><span class="chev">${ic("chevron", 14)}</span></button>`;
}
/** Cartão completo: o que é, se precisa baixar, requisitos, status e ações. */
/** Janela "Quem faz as capas?" — igual à do motor de escrita. */
function imgPicker() {
  const cur = imgProv(), k = imgState();
  const C: [string, string, string, string, string, boolean, string][] = [
    ["local", "cpu", L("Neste computador", "On this computer"), L("Grátis · sem internet · ~5 min por capa", "Free · offline · ~5 min per cover"), "#3fa57a,#12503a", true, k === "ready" || k === "gen" ? L("Pronto", "Ready") : k === "dl" ? L(`Baixando ${imgPct()}%`, `Downloading ${imgPct()}%`) : L("Precisa baixar (~6,7 GB, uma vez)", "Needs a download (~6.7 GB, once)")],
    ["openai", "openai", "ChatGPT", L("gpt-image · pago por imagem", "gpt-image · paid per image"), "#2bbd94,#0b5d48", false, S.keys?.openai ? L("Chave salva", "Key saved") : L("Precisa de chave", "Needs a key")],
    ["gemini", "gemini", "Gemini", L("Nano Banana · pago por imagem", "Nano Banana · paid per image"), "#6b8cff,#7b3fe4", false, S.keys?.gemini ? L("Chave salva", "Key saved") : L("Precisa de chave", "Needs a key")]];
  const card = ([id, icon, name, tag, g, free, st]: typeof C[number]) => { const ok = id === "local" ? k === "ready" || k === "gen" : !!S.keys?.[id]; return `<button class="ecard ${cur === id ? "on" : ""}" data-act="img-pick" data-v="${id}" style="--g:linear-gradient(135deg,${g})">${free ? `<span class="free">${L("GRÁTIS", "FREE")}</span>` : ""}<span class="eicon">${ic(icon, 22)}</span><b>${name}</b><span class="etag">${tag}</span><span class="est ${ok ? "ok" : "warn"}">${ok ? ic("check", 12) : "•"} ${st}</span></button>`; };
  const detail = cur === "local" ? `<div class="pdetail">${imgEngineCard()}</div>` : S.keys?.[cur] ? `<p class="muted capnote">${ic("check", 14)} ${L("Pronto. Cada capa custa alguns centavos na sua conta da", "Ready. Each cover costs a few cents on your")} ${cur === "openai" ? "OpenAI" : "Google"}${L(".", " account.")}</p>` : `<div class="pdetail row"><p class="muted" style="flex:1;margin:0">${L("Para usar esta IA, cole a sua chave de API nas Configurações.", "To use this AI, paste your API key in Settings.")}</p><button class="btn primary" data-act="img-keys">${ic("key", 14)} ${L("Adicionar chave", "Add key")}</button></div>`;
  return `<div class="overlay" id="overlay"><div class="picker imgpk"><div class="phead"><div><h2>${L("Quem faz as capas?", "Who makes the covers?")}</h2><p class="muted">${L("Escolha a IA das imagens. A escrita é uma escolha separada.", "Choose the image AI. Writing is a separate choice.")}</p></div><button class="icon" data-act="img-picker-close">${ic("x")}</button></div>
    <div class="egrid3">${C.map(card).join("")}</div>${detail}</div></div>`;
}
function imgEngineCard() {
  const st = S.imgLocal, k = imgState(), need = st.total || 6.73e9;
  const okc = (good: boolean) => good ? `<span class="ok">${ic("check", 13)}</span>` : `<span class="warn">!</span>`;
  const pill = ({ ready: [L("Pronto para usar", "Ready to use"), "ok"], gen: [L("Gerando agora", "Generating now"), "ok"], dl: [L(`Baixando · ${imgPct()}%`, `Downloading · ${imgPct()}%`), "run"], partial: [L(`Pausado em ${imgPct()}%`, `Paused at ${imgPct()}%`), "warn"], none: [L("Não instalado", "Not installed"), "warn"], unsupported: [L("Indisponível neste computador", "Not available on this computer"), "bad"] } as Record<ImgState, [string, string]>)[k];
  if (k === "unsupported") return `<div class="imgcard"><div class="ichead"><b>${ic("cpu", 15)} ${L("Capas grátis neste computador", "Free covers on this computer")}</b><span class="pill ${pill[1]}">${pill[0]}</span></div>
    <p class="muted">${L("O gerador local funciona em Macs com chip Apple (M1 ou mais novo) e em PCs Windows/Linux de 64 bits com placa de vídeo. Este computador não é compatível. Você ainda pode usar o ChatGPT ou o Gemini com chave, ou o botão “Copiar prompt da capa”, que é grátis.", "The local generator works on Macs with Apple chips (M1 or newer) and on 64-bit Windows/Linux PCs with a graphics card. This computer isn't supported. You can still use ChatGPT or Gemini with a key, or the free “Copy cover prompt” button.")}</p></div>`;
  const ramOk = !st.ram || st.ram >= 8, diskOk = !st.free || st.ok || st.free * 1e9 >= need - st.got + 5e8;
  return `<div class="imgcard"><div class="ichead"><b>${ic("cpu", 15)} ${L("Capas grátis neste computador", "Free covers on this computer")}</b><span class="pill ${pill[1]}">${pill[0]}</span></div>
    <ol class="ichow">
      <li><b>${st.ok ? L("Já baixado", "Already downloaded") : L(`Baixa uma vez: ${gb(need)}`, `Download once: ${gb(need)}`)}</b><span>${L("O programa stable-diffusion.cpp e o modelo Z-Image-Turbo (código aberto). Grátis, sem conta, sem cartão. O download pode ser pausado e continua de onde parou.", "The stable-diffusion.cpp program and the Z-Image-Turbo model (open source). Free, no account, no card. You can pause the download and it resumes where it stopped.")}</span></li>
      <li><b>${L("Roda só no seu computador", "Runs only on your computer")}</b><span>${L(`Usa ${st.accel || "a placa de vídeo"}. Depois de baixado funciona sem internet, sem chave e nada é enviado para fora.`, `Uses ${st.accel || "the graphics card"}. Once downloaded it works offline, with no key, and nothing leaves your computer.`)}</span></li>
      <li><b>${L(`Uma capa: ${imgEst()}`, `One cover: ${imgEst()}`)}</b><span>${L("Você acompanha o progresso no painel de tarefas (canto inferior) e pode cancelar a qualquer momento. O estilo do Kaveel vai junto (editável abaixo).", "You can follow progress in the task panel (bottom corner) and cancel anytime. Kaveel's style goes along (editable below).")}</span></li>
    </ol>
    <div class="icreq">
      ${st.ram ? `<span>${okc(st.ram >= 8)} ${L("Memória", "Memory")}: ${st.ram} GB <small>(${L("mín. 8, ideal 16", "min. 8, ideal 16")})</small></span>` : ""}
      ${st.free ? `<span>${okc(diskOk)} ${L("Disco livre", "Free disk")}: ${st.free} GB <small>(${L(`precisa ${gb(Math.max(0, need - st.got))}`, `needs ${gb(Math.max(0, need - st.got))}`)})</small></span>` : ""}
      <span>${okc(true)} ${st.os === "windows" ? "Windows" : st.os === "linux" ? "Linux" : "macOS"} · ${esc(st.accel || "")}</span>
    </div>
    ${!ramOk ? `<p class="hint warn">${L("Pouca memória: pode ficar muito lento ou falhar.", "Low memory: it may be very slow or fail.")}</p>` : ""}${!diskOk ? `<p class="hint warn">${L("Pouco espaço livre no disco para o download.", "Not enough free disk space for the download.")}</p>` : ""}
    ${k === "dl" || k === "partial" ? `<div class="mprog imgprog"><i style="width:${imgPct()}%"></i></div><small class="muted imgpct">${gb(st.got)} / ${gb(st.total)} · ${imgPct()}%${st.file ? ` · ${esc(st.file)}` : ""}</small>` : ""}
    ${st.err ? `<p class="hint warn">${esc(st.err)}</p>` : ""}
    <div class="row">${k === "dl" ? `<button class="btn sm ghost" data-act="imgl-cancel">${ic("stop", 12)} ${L("Pausar download", "Pause download")}</button>` : k === "none" || k === "partial" ? `<button class="btn sm primary" data-act="imgl-dl">${ic("download", 14)} ${k === "partial" ? L("Continuar download", "Resume download") : L(`Baixar e instalar (${gb(need)})`, `Download and install (${gb(need)})`)}</button>` : ""}
      ${st.dir ? `<button class="btn sm ghost" data-act="imgl-folder">${ic("folder", 14)} ${L("Onde fica", "Where it's stored")}</button>` : ""}</div></div>`;
}
/** As formas de conseguir a capa, lado a lado, com custo e status claros. */
function coverWays(p: Project, busy: boolean) {
  const k = imgState(), dis = S.writing ? "disabled" : "";
  const row = (icon: string, name: string, badge: [string, string], desc: string, act: string) => `<div class="way"><span class="wico">${ic(icon, 16)}</span><div class="wtx"><b>${name} <span class="pill ${badge[1]}">${badge[0]}</span></b><small>${desc}</small></div><div class="wact">${act}</div></div>`;
  const free: [string, string] = [L("Grátis", "Free"), "ok"], paid: [string, string] = [L("Pago · sua chave", "Paid · your key"), "warn"];
  const localDesc = ({ ready: L(`Pronto · ${imgEst()} por capa · sem internet`, `Ready · ${imgEst()} per cover · offline`), gen: L("Gerando… acompanhe no painel de tarefas", "Generating… follow it in the task panel"), dl: L(`Baixando ${imgPct()}% — dá para continuar usando o app`, `Downloading ${imgPct()}% — you can keep using the app`), partial: L(`Download pausado em ${imgPct()}%`, `Download paused at ${imgPct()}%`), none: L(`Precisa baixar uma vez (${gb(S.imgLocal.total || 6.73e9)}). Depois é grátis e offline.`, `Needs a one-time download (${gb(S.imgLocal.total || 6.73e9)}). Then it's free and offline.`), unsupported: L("Não funciona neste computador", "Doesn't work on this computer") } as Record<ImgState, string>)[k];
  const localAct = k === "ready" ? `<button class="btn sm ${p.cover ? "" : "primary"}" data-act="cover-gen" data-v="local" ${dis}>${ic("sparkles", 14)} ${p.cover ? L("Nova arte…", "New art…") : L("Gerar capa…", "Generate cover…")}</button>`
    : k === "gen" ? `<span class="spin"></span><button class="btn sm ghost" data-act="imgl-cancel">${ic("stop", 12)} ${L("Cancelar", "Cancel")}</button>`
    : k === "dl" ? `<button class="btn sm ghost" data-act="imgl-cancel">${ic("stop", 12)} ${L("Pausar", "Pause")}</button>`
    : k === "unsupported" ? "" : `<button class="btn sm primary" data-act="imgl-dl">${ic("download", 14)} ${k === "partial" ? L("Continuar", "Resume") : L("Instalar", "Install")}</button>`;
  const how = `<button class="linkbtn" data-act="imgl-how">${S.imgHow ? L("fechar", "close") : L("como funciona?", "how does it work?")}</button>`;
  const prov = (id: "openai" | "gemini", n: string) => row("sparkles", n, paid, S.keys?.[id] ? L("Chave salva · cada imagem é cobrada pela " + (id === "openai" ? "OpenAI" : "Google"), "Key saved · each image is billed by " + (id === "openai" ? "OpenAI" : "Google")) : L("Precisa de uma chave de API (Configurações)", "Needs an API key (Settings)"),
    S.keys?.[id] ? `<button class="btn sm" data-act="cover-gen" data-v="${id}" ${dis}>${ic("sparkles", 14)} ${L("Gerar", "Generate")}</button>` : `<button class="btn sm ghost" data-act="view" data-v="config">${L("Adicionar chave", "Add key")}</button>`);
  return `<div class="ways">
    ${row("cpu", L("Neste computador", "On this computer"), free, `${localDesc} ${how}${k === "dl" ? `<span class="mprog imgprog"><i style="width:${imgPct()}%"></i></span>` : ""}`, localAct)}
    ${S.imgHow ? imgEngineCard() : ""}
    ${row("upload", L("Sua imagem", "Your own image"), free, L("Uma arte pronta (JPG/PNG/WebP).", "Finished artwork (JPG/PNG/WebP)."), `<button class="btn sm" data-act="cover-file">${ic("upload", 14)} ${L("Enviar", "Upload")}</button>`)}
    <details class="moreways" ${S.keys?.openai || S.keys?.gemini ? "open" : ""}><summary>${L("Outras formas (ChatGPT, Gemini, copiar prompt)", "Other ways (ChatGPT, Gemini, copy prompt)")}</summary>
    ${S.settings.mode !== "offline" ? row("clipboard", L("Copiar prompt", "Copy prompt"), free, L("A IA escreve a descrição da capa; você cola no chatgpt.com ou gemini.google.com (conta grátis serve) e envia a imagem aqui.", "The AI writes the cover description; you paste it at chatgpt.com or gemini.google.com (a free account works) and upload the image here."), `<button class="btn sm" data-act="cover-prompt" ${dis}>${S.writing === "cprompt" ? `<span class="spin"></span>` : ic("clipboard", 14)} ${L("Copiar", "Copy")}</button>`) : ""}
    ${prov("openai", "ChatGPT")}${prov("gemini", "Gemini")}</details>
  </div>`;
}
/** Cena do verso: outro momento/lugar da história (usa o Mundo), escura e calma em cima para o texto. */
function backPrompt(p: Project) {
  const places = worldOf(p).filter((w) => /lugar|place/i.test(w.kind) && w.desc);
  const pl = places[1] || places[0];
  const scene = pl ? `${pl.name}: ${pl.desc.slice(0, 380)}` : p.premise.slice(0, 450);
  // sem as palavras "capa", "livro", "título" ou "texto": o modelo local desenha um livro/letras quando lê isso
  return `Full-bleed cinematic horror illustration, a single continuous scene (not a book, not a poster, no mockup): ${scene}. Wide establishing view of this location, no close-up faces, any people small and distant in the lower part of the frame. The upper half is mostly empty dark negative space: deep shadows, night sky, drifting fog. Moody, atmospheric, high detail.`;
}
type ArtOpts = { extra?: string; init?: string; strength?: number; chainBack?: boolean };
async function makeCover(p: Project, provider: string, kind: "front" | "wrap" | "back" = "front", o: ArtOpts = {}) {
  if (provider === "local") { if (!S.imgLocal.ok) return toast(L("Instale o gerador local primeiro", "Install the local generator first"), true); }
  else if (!S.keys?.[provider]) return toast("Capa não gerada: falta a chave do " + (provider === "openai" ? "ChatGPT" : "Gemini"), true);
  try {
    busyText(kind === "back" ? L("Preparando a arte do verso…", "Preparing the back-cover art…") : "Escrevendo a ideia da capa…");
    let prompt = "";
    const baseArt = o.init ? p.arts?.find((a) => a.path === o.init) : undefined;
    if (o.init && baseArt?.prompt) prompt = baseArt.prompt.replace(/\s*Requested changes[\s\S]*$/, "");
    else if (kind === "back") prompt = backPrompt(p);
    else if (o.init) prompt = `Book cover artwork for the novel "${p.title}": ${p.premise.slice(0, 600)}. Cinematic, moody, high detail, no text.`;
    else try { prompt = (await gen("Capa", QUICK.find((q) => q.id === "cover")!.prompt({ title: p.title, premise: p.premise.slice(0, 1500) + "\n" + castText(p).slice(0, 1200) }), p.premise, 500)).trim(); } catch { /* usa o modelo abaixo */ }
    if (kind === "wrap") prompt = `WIDE WRAPAROUND paperback book cover artwork (back cover on the left half, spine in the middle, front cover on the right half). Put the main subject and focal point on the RIGHT third. Keep the LEFT half darker and calmer (it will hold the back-cover text). Simple, dark vertical strip in the exact center for the spine. ` + (prompt.length >= 40 ? prompt : `Story: "${p.title}": ${p.premise.slice(0, 500)}.`) + " Cinematic, moody, high detail. No text, no letters, no logos.";
    else if (kind === "front" && prompt.length < 40) prompt = `Book cover artwork for the novel "${p.title}": ${p.premise.slice(0, 600)}. Cinematic, moody, high detail, genre-appropriate, empty space at the top for the title and at the bottom for the author name, no text.`;
    if (o.extra?.trim()) prompt += ` Requested changes and details (follow these closely): ${o.extra.trim()}.`;
    const cst = styleOf(p);
    if (cst.coverStyle) prompt += ` Art style: ${cst.coverStyle}.`;
    const lib = cst.coverRef === "author" ? S.lib.filter((i) => i.kind === "capa" && i.bookId) : [];
    if (lib.length) prompt += " Match the visual style, color palette, mood and illustration technique of the reference book covers by the same author, but create a completely new composition for this story. Do not copy their characters or text. No text in the image.";
    if (provider === "local") {
      let style = localStyle();
      if (kind === "back") style = style.replace(/\([^)]*\)/g, "").split(",").filter((x) => !/face|close-up|closeup|expression|portrait/i.test(x)).join(",").replace(/\s+,/g, ",").replace(/\b(book )?cover\b/gi, "artwork");
      const full = (o.init && baseArt?.prompt ? prompt : `${style ? style + ". " : ""}${prompt}`) + " No text, no letters, no title, no watermark.";
      const ca = actStart("image", kind === "back" ? L("Gerando a arte do verso no computador", "Generating the back-cover art on this computer") : L("Gerando a capa no computador", "Generating the cover on this computer"), L("carregando o modelo…", "loading the model…"));
      (S as any).imgAct = ca; ca.ai = imgAIName("local"); paintAct(ca);
      const [w, h] = kind === "wrap" ? [1216, 768] : [768, 1216];
      try {
        let init: string | null = null;
        if (o.init) { // a arte base no tamanho exato da geração
          const b = await bitmap(o.init); if (b) { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d")!; const sc = Math.max(w / b.width, h / b.height); x.drawImage(b, (w - b.width * sc) / 2, (h - b.height * sc) / 2, b.width * sc, b.height * sc); init = await invoke<string>("save_b64", { name: `init-${Date.now()}.png`, b64: c.toDataURL("image/png") }); }
        }
        const path = await invoke<string>("img_local_generate", { prompt: full.slice(0, 2500), width: w, height: h, steps: 8, seed: null, init, strength: o.strength ?? null });
        setArt(p, kind, path, full); actEnd(ca, kind === "back" ? L("verso pronto", "back ready") : L("capa pronta", "cover ready"));
      } catch (e: any) { actEnd(ca, String(e?.message || e), false); throw e; } finally { (S as any).imgAct = null; }
      return;
    }
    busyText(`Gerando a capa com ${provider === "openai" ? "ChatGPT" : "Gemini"}…`);
    const ca = actStart("image", kind === "back" ? L("Gerando a arte do verso", "Generating the back-cover art") : L("Gerando a capa", "Generating the cover"), provider === "openai" ? "ChatGPT" : "Gemini"); ca.ai = imgAIName(provider); paintAct(ca);
    const refs = await Promise.all(lib.map(frontOf)); if (o.init) refs.unshift(o.init);
    if (o.init) prompt = "Use the FIRST reference image as the base artwork and keep its composition, but apply these changes. " + prompt;
    const path = await invoke<string>("image_generate", { provider, model: S.settings.img.provider === provider ? S.settings.img.model || "" : "", prompt, portrait: kind !== "wrap", refs });
    setArt(p, kind, path, prompt); actEnd(ca, kind === "back" ? L("verso pronto", "back ready") : L("capa pronta", "cover ready"));
  } catch (e: any) { toast("Capa: " + String(e?.message || e), true); return; }
  // a frente nova pede um verso próprio (imagem diferente) — gera em seguida
  if (kind === "front" && o.chainBack && !S.stopGen) { toast(L("Frente pronta — agora gerando a arte do verso (diferente da frente)…", "Front ready — now generating the back-cover art (different from the front)…")); await makeCover(p, provider, "back"); }
}
/** Janela única para criar ou retocar artes: o que gerar, de onde partir, o que mudar — e confirma antes (tempo e memória). */
type ArtDlg = { prov: string; what: "front" | "back" | "both"; from: "new" | "edit"; base: string; amount: "low" | "mid" | "high"; extra: string; pf?: any };
const AMOUNT: Record<string, [number, string, string]> = { low: [0.35, "Pouco", "Little"], mid: [0.55, "Médio", "Medium"], high: [0.75, "Muito", "A lot"] };
async function artDialog(init?: Partial<ArtDlg>) {
  const p = proj(); if (!p) return;
  if (init) { S.artDlg = { prov: "local", what: p.backArt ? "front" : "both", from: "new", base: p.cover || "", amount: "mid", extra: "", ...init }; if (S.artDlg.prov === "local") S.artDlg.pf = await invoke<any>("img_local_preflight").catch(() => null); }
  const d: ArtDlg = S.artDlg; if (!d) return;
  const local = d.prov === "local", arts = (p.arts || []).filter((a) => a.kind !== "wrap").slice().sort((a, b) => b.at - a.at);
  const n = d.what === "both" ? 2 : 1, mins = local ? (d.from === "edit" ? 3 : 5) * n : 1 * n;
  const pf = d.pf, blocked = local && pf && (!pf.ok || pf.running);
  const seg = (k: keyof ArtDlg, opts: [string, string][]) => `<div class="seg">${opts.map(([v, t]) => `<button class="${d[k] === v ? "on" : ""}" data-act="ad-set" data-k="${k}" data-v="${v}">${t}</button>`).join("")}</div>`;
  document.getElementById("overlay")?.remove();
  const m = document.createElement("div"); m.className = "overlay"; m.id = "overlay";
  m.innerHTML = `<div class="picker artdlg"><div class="phead"><div><h2>${d.from === "edit" ? L("Retocar uma arte", "Retouch an artwork") : L("Nova arte da capa", "New cover artwork")}</h2><p class="muted">${local ? L("Grátis, neste computador", "Free, on this computer") : `${d.prov === "openai" ? "ChatGPT" : "Gemini"} · ${L("pago pela sua chave", "paid with your key")}`}</p></div><button class="icon" data-act="overlay-x">${ic("x")}</button></div>
    <div class="adbody">
      <div class="adrow"><b>1. ${L("O que gerar", "What to make")}</b>${seg("what", [["front", L("Frente", "Front")], ["back", L("Verso", "Back")], ...(d.from === "new" ? [["both", L("Frente e verso", "Front and back")]] as [string, string][] : [])])}</div>
      <div class="adrow"><b>2. ${L("Começar de", "Start from")}</b>${seg("from", [["new", L("Do zero (pela história do livro)", "Scratch (from the book's story)")], ...(arts.length ? [["edit", L("Uma arte que já existe", "An existing artwork")]] as [string, string][] : [])])}</div>
      ${d.from === "edit" ? `<div class="adpick">${arts.map((a) => `<button class="${a.path === d.base ? "on" : ""}" data-act="ad-set" data-k="base" data-v="${esc(a.path)}"><img src="${convertFileSrc(a.path)}"><small>${L(...ART_KIND[a.kind] || ["Arte", "Art"])}</small></button>`).join("")}<button class="adup" data-act="ad-upload">${ic("upload", 16)}<small>${L("Outra imagem", "Other image")}</small></button></div>
        ${local ? `<div class="adrow"><b>${L("Quanto mudar", "How much to change")}</b>${seg("amount", Object.entries(AMOUNT).map(([k, v]) => [k, L(v[1], v[2])]))}</div><p class="muted small">${L("Pouco = mesma imagem com ajustes de cor, clima e detalhes. Muito = só aproveita a composição. Para mexer num ponto exato ou nos textos, use o PSD editável.", "Little = same image with tweaks to color, mood and details. A lot = only keeps the composition. To change one exact spot or the text, use the editable PSD.")}</p>` : `<p class="muted small">${L("A imagem escolhida vai como referência para a IA manter a composição.", "The chosen image goes as a reference so the AI keeps the composition.")}</p>`}` : ""}
      <label class="fld"><span><b>3. ${L("O que você quer", "What you want")}</b> <small class="muted">(${L("opcional", "optional")})</small></span><textarea rows="3" id="adextra" placeholder="${L("Ex.: mais neblina, a torre maior, tons mais vermelhos, Melika de costas no centro…", "E.g.: more fog, a bigger tower, redder tones, Melika seen from behind in the center…")}">${esc(d.extra)}</textarea></label>
      <div class="adinfo">
        <span>${ic("clock", 14)} ${L(`Cerca de ${mins} min`, `About ${mins} min`)}${n > 1 ? L(" (uma imagem de cada vez)", " (one image at a time)") : ""}</span>
        ${local && pf ? `<span class="${pf.avail < pf.min ? "bad" : pf.tight ? "warn" : "ok"}">${ic("cpu", 14)} ${L("Memória livre", "Free memory")}: ${String(pf.avail).replace(".", isEn() ? "." : ",")} GB ${L(`de ${pf.ram} GB · precisa de ~${pf.need} GB`, `of ${pf.ram} GB · needs ~${pf.need} GB`)}</span>` : ""}
        ${local ? `<p>${L("Enquanto gera, o computador fica mais lento: evite programas pesados. Você pode cancelar a qualquer momento no painel de tarefas, e se a memória acabar o app para sozinho para não travar.", "While it generates the computer gets slower: avoid heavy apps. You can cancel anytime in the task panel, and if memory runs low the app stops by itself so nothing freezes.")}</p>` : `<p>${L("Cada imagem é cobrada pela", "Each image is billed by")} ${d.prov === "openai" ? "OpenAI" : "Google"}.</p>`}
        ${pf?.running ? `<p class="bad">${L("Já tem uma imagem sendo gerada. Espere terminar.", "An image is already being generated. Wait for it to finish.")}</p>` : local && pf && !pf.ok ? `<p class="bad">${L("Pouca memória livre para gerar agora. Feche outros programas (navegador, editores…) e clique em Verificar de novo.", "Not enough free memory right now. Close other apps (browser, editors…) and click Check again.")}</p>` : local && pf?.tight ? `<p class="warn">${L("A memória está justa: feche outros programas para ficar mais rápido e seguro.", "Memory is tight: close other apps to make it faster and safer.")}</p>` : ""}
      </div>
    </div>
    <div class="row adfoot"><button class="btn ghost" data-act="overlay-x">${L("Cancelar", "Cancel")}</button>${local ? `<button class="btn ghost" data-act="ad-check">${ic("undo", 14)} ${L("Verificar de novo", "Check again")}</button>` : ""}<span class="grow"></span>
      <button class="btn primary" data-act="ad-go" ${blocked || (d.from === "edit" && !d.base) ? "disabled" : ""}>${ic("sparkles", 14)} ${d.from === "edit" ? L("Retocar", "Retouch") : n > 1 ? L("Gerar frente e verso", "Generate front and back") : L("Gerar", "Generate")}</button></div></div>`;
  document.body.appendChild(m);
  const ta = m.querySelector<HTMLTextAreaElement>("#adextra"); if (ta) ta.oninput = () => { d.extra = ta.value; };
}
/** Guarda toda arte que já foi usada no livro (nada é substituído/perdido). */
function keepArt(p: Project, kind: string, path?: string) { if (!path) return; p.arts ||= []; if (!p.arts.some((a) => a.path === path)) p.arts.push({ path, kind, at: Date.now() }); }
function keepAllArts(p: Project) { keepArt(p, "front", p.cover); keepArt(p, "back", p.backArt); keepArt(p, "wrap", p.wrapArt); }
const ART_KIND: Record<string, [string, string]> = { front: ["Frente", "Front"], back: ["Verso", "Back"], wrap: ["Panorâmica", "Panoramic"] };
function artsGallery(p: Project) {
  const a = (p.arts || []).slice().sort((x, y) => y.at - x.at);
  if (!a.length) return "";
  const cur = (x: { path: string }) => x.path === p.cover ? "front" : x.path === p.backArt ? "back" : x.path === p.wrapArt ? "wrap" : "";
  return `<details class="arts" ${S.artsOpen ? "open" : ""}><summary data-act="arts-toggle">${ic("clock", 14)} ${L("Todas as artes deste livro", "All artwork for this book")} <span class="muted">(${a.length})</span><small class="muted">${L("nenhuma arte é substituída: escolha qual é a oficial", "nothing gets replaced: pick which one is official")}</small></summary>
    <div class="artgrid">${a.map((x) => { const c = cur(x), i = p.arts!.indexOf(x); return `<div class="artc ${c ? "on" : ""}"><img src="${convertFileSrc(x.path)}" loading="lazy">
      <div class="artmeta"><b>${L(...ART_KIND[x.kind] || ["Arte", "Art"])}</b>${c ? `<span class="stag ok">${ic("check", 11)} ${L("Oficial", "Official")} · ${L(...ART_KIND[c])}</span>` : ""}<small class="muted">${new Date(x.at).toLocaleString(locale())}</small></div>
      <div class="artbtns">${x.kind === "wrap" ? (c ? "" : `<button class="btn sm" data-act="art-use" data-i="${i}" data-as="wrap">${L("Usar", "Use")}</button>`) : `${c === "front" ? "" : `<button class="btn sm" data-act="art-use" data-i="${i}" data-as="front">${L("Usar na frente", "Use as front")}</button>`}${c === "back" ? "" : `<button class="btn sm" data-act="art-use" data-i="${i}" data-as="back">${L("Usar no verso", "Use as back")}</button>`}`}
        ${x.kind !== "wrap" ? `<button class="btn sm ghost" data-act="art-edit" data-i="${i}">${ic("sparkles", 13)} ${L("Retocar", "Retouch")}</button>` : ""}
        ${c ? "" : `<button class="icon" title="${L("Remover da lista", "Remove from list")}" data-act="art-del" data-i="${i}">${ic("trash", 14)}</button>`}</div></div>`; }).join("")}</div></details>`;
}
function setArt(p: Project, kind: string, path: string, prompt?: string) {
  keepAllArts(p); keepArt(p, kind, path); const a = p.arts?.find((x) => x.path === path); if (a && prompt) a.prompt = prompt;
  if (kind === "wrap") p.wrapArt = path; else if (kind === "back") p.backArt = path; else p.cover = path;
  p.coverV = 2; saveProjects(); toast(L("Arte gerada — montando a capa completa com os textos…", "Art generated — building the full cover with the texts…")); finishCover(p, kind !== "back");
}

async function makeOutline(p: Project) {
  if (S.settings.mode === "offline" || !engineReady()) {
    p.chapters = outline({ premise: p.premise, chapters: p.nChapters, names: castOf(p).map((x) => x.name).filter(Boolean), profile: S.profile }).map((o) => ({ id: uid(), title: o.title, plan: `${o.beat}: ${o.summary}`, html: "" }));
    return;
  }
  await buildBook(p, false);
}


// ---------- Novo livro ----------
function vNovo() {
  const d = S.settings.draft || {};
  const refs = S.lib.filter((i) => i.kind === "referencia").length;
  const sizes = [["80", "Curto", "~80 páginas"], ["150", "Médio", "~150 páginas"], ["200", "Completo", "~200 páginas"], ["300", "Longo", "~300 páginas"]];
  const pages = +(d.pages || 180);
  return `<div class="wizard"><h1>Vamos criar um livro novo</h1><p class="muted">No estilo de ${esc(S.author.pen || S.author.name || "o autor")}. Preencha o que souber — o resto a IA sugere.</p>
  <label class="fld"><span>Nome do livro</span><input class="big-in" data-draft="title" value="${esc(d.title || "")}" placeholder="Ex.: Silent Vows"></label>
  <label class="fld"><span>Suas ideias</span><textarea class="big-in" rows="7" data-draft="ideas" placeholder="Do que é a história? Quem são os personagens? Onde se passa? Que reviravolta você imagina? Pode escrever do jeito que vier.">${esc(d.ideas || "")}</textarea></label>
  <label class="fld"><span>Personagens principais (opcional)</span><input data-draft="names" value="${esc(d.names || "")}" placeholder="Ex.: Riya, Kabir, Meera"></label>
  <div class="fld"><span>Base de conhecimento</span><div class="toggles">
    <button class="tog on" disabled>${ic("library")} Meus livros <small>estilo, ritmo e personagens</small></button>
    <button class="tog ${S.settings.useRefs ? "on" : ""}" data-act="toggle-refs">${ic("landmark")} Obras de referência <small>${refs ? `${refs} obras liberadas` : "nenhuma ainda — adicione em Referências"}</small></button></div></div>
  <div class="fld"><span>Tamanho do livro</span><div class="toggles">${sizes.map(([n, l, sub]) => `<button class="tog ${String(pages) === n ? "on" : ""}" data-act="draft-size" data-n="${n}">${l} <small>${sub}</small></button>`).join("")}</div>
    <div class="row sizerow"><label class="mini-f">Páginas<input type="number" min="20" max="600" data-draft="pages" value="${pages}" style="width:90px"></label><span class="muted" id="wsize">≈ ${(pages * wpp()).toLocaleString(locale())} palavras · ${chaptersFor(pages)} capítulos de ~${Math.round((pages * wpp()) / chaptersFor(pages)).toLocaleString(locale())} palavras (padrão dos livros do autor: ${wpp()} palavras por página)</span></div></div>
  <div class="fld"><span>Quem escreve</span>${engineButton()}<p class="elimit ${S.settings.mode === "offline" ? "warn" : ""}" id="wlimit">${esc(engineLimits(S.settings.mode, pages))}</p></div>
  <div class="fld"><span>Capa (opcional — gerada junto com o livro)</span><div class="toggles">${[["", "Sem capa agora", "dá para gerar depois na KDP"], ["openai", "ChatGPT", S.keys?.openai ? "chave salva" : "precisa de chave"], ["gemini", "Gemini", S.keys?.gemini ? "chave salva" : "precisa de chave"]].map(([v, l, sub]) => `<button class="tog ${(d.coverAI || "") === v ? "on" : ""}" data-act="draft-cover" data-v="${v}">${v ? ic("image") + " " : ""}${l} <small>${sub}</small></button>`).join("")}</div></div>
  <div class="row"><button class="btn primary big" data-act="create-book">${ic("sparkles")} Criar meu livro</button><label class="muted chk"><input type="checkbox" data-draft-check="writeAll" ${d.writeAll !== false ? "checked" : ""}> já escrever todos os capítulos</label></div></div>`;
}

// ---------- Referências ----------
function vReferencias() {
  const list = S.lib.filter((i) => i.kind === "referencia"), on = !!S.settings.useRefs;
  const used = list.filter((i: any) => i.use !== false).length;
  const sw = `<div class="refuse ${on ? "on" : ""}"><div class="rtx"><b>${on ? L("Usando as referências ao escrever", "Using references while writing") : L("Referências desligadas", "References are off")}</b><small>${on ? L(`A IA consulta ${used} obra(s) marcada(s) para estrutura, atmosfera e vocabulário.`, `The AI looks at ${used} selected work(s) for structure, atmosphere and vocabulary.`) : L("Ligue para a IA consultar as obras abaixo ao escrever. O estilo continua sendo o do autor.", "Turn on so the AI looks at the works below while writing. The style stays the author's.")}</small></div>
    <button class="tswitch ${on ? "on" : ""}" data-act="toggle-refs" title="${on ? L("Desligar", "Turn off") : L("Ligar", "Turn on")}"><span></span></button></div>`;
  const cards = list.map((i: any) => `<div class="refcard ${i.use !== false ? "" : "off"}">
      <span class="bcov ref"><em>${ic("landmark", 14)}</em></span>
      <div class="rinfo"><input class="ttl" value="${esc(i.title)}" data-edit-item="${i.id}" data-f="title"><small>${i.words.toLocaleString(locale())} ${L("palavras", "words")}</small></div>
      <label class="ruse"><input type="checkbox" data-ref-use="${i.id}" ${i.use !== false ? "checked" : ""}> ${L("Usar", "Use")}</label>
      <button class="icon" data-act="read" data-id="${i.id}" title="${L("Ler", "Read")}">${ic("book")}</button><button class="icon" data-act="del-item" data-id="${i.id}" title="${L("Remover", "Remove")}">${ic("trash")}</button></div>`).join("");
  const empty = `<div class="refempty"><div class="big">${ic("landmark")}</div><h3>${L("Nenhuma obra de referência ainda", "No reference works yet")}</h3>
    <p class="muted">${L("Opcional. Use só textos de domínio público ou que você tem direito de usar.", "Optional. Only use public-domain texts or texts you have the right to use.")}</p>
    <ol class="refsteps"><li><b>${L("Encontre", "Find")}</b><span>${L("Clássicos de terror em domínio público, ex.: Project Gutenberg ou Standard Ebooks.", "Public-domain horror classics, e.g. Project Gutenberg or Standard Ebooks.")}</span></li>
    <li><b>${L("Adicione", "Add")}</b><span>${L("Arquivos .txt, .pdf ou .docx.", "Files in .txt, .pdf or .docx.")}</span></li>
    <li><b>${L("Ligue", "Turn on")}</b><span>${L("A chave acima faz a IA consultar essas obras ao escrever.", "The switch above makes the AI look at these works while writing.")}</span></li></ol>
    <button class="btn primary" data-act="import-ref">${ic("plus")} ${L("Adicionar obras", "Add works")}</button></div>`;
  return `<header class="top"><div><h1>${L("Obras de referência", "Reference works")}</h1><p>${L("Livros de domínio público ou com licença liberada para ampliar a base de conhecimento: estrutura, atmosfera, vocabulário. O <b>estilo</b> continua sendo o do autor.", "Public-domain or openly licensed books to broaden the knowledge base: structure, atmosphere, vocabulary. The <b>style</b> is still the author's.")}</p></div>
    ${list.length ? `<button class="btn primary" data-act="import-ref">${ic("plus")} ${L("Adicionar obras", "Add works")}</button>` : ""}</header>
  <div class="refpage">${sw}
  ${list.length ? `<div class="reflist"><div class="rlhead"><span>${L("Obras", "Works")} <em>${list.length}</em></span><small class="muted">.txt · .pdf · .docx</small></div>${cards}</div>` : empty}</div>`;
}

// ---------- capa completa (paperback KDP) ----------
const bmpCache = new Map<string, ImageBitmap>();
async function bitmap(path?: string): Promise<ImageBitmap | null> {
  if (!path) return null;
  if (!bmpCache.has(path)) { try { bmpCache.set(path, await createImageBitmap(await (await fetch(convertFileSrc(path))).blob())); } catch { return null; } }
  return bmpCache.get(path)!;
}
const estPages = (p: Project) => { const w = projWords(p); return Math.max(24, Math.round(w > 5000 ? w / 280 : p.pages || 180)); };
function wrapOf(p: Project): WrapDesign {
  p.wrap ||= { trim: "6x9", paper: "cream", pages: estPages(p), title: p.title, subtitle: p.subtitle, author: S.author.pen || S.author.name || "", series: "", tagline: "",
    back: strip(p.kdp.description || "") || p.premise.slice(0, 900), bio: "", font: "impact", titleColor: "#d21f26", accent: "#e6b35c", textColor: "#f3ede4", spineColor: "#0b0a0c", titlePos: "bottom", titleSize: 1, darkBack: 0.55 };
  return p.wrap;
}
let wrapGuides = true;
async function wrapRedraw() {
  const p = proj(); const cv = document.getElementById("wrapcv") as HTMLCanvasElement | null; if (!p || !cv) return;
  const d = wrapOf(p), m = kdpDims(d.trim, d.pages, d.paper);
  const box = cv.parentElement!.clientWidth - 4, dpi = Math.min(110, box / m.W);
  cv.width = Math.round(m.W * dpi * devicePixelRatio); cv.height = Math.round(m.H * dpi * devicePixelRatio); cv.style.width = Math.round(m.W * dpi) + "px";
  const fin = await bitmap(p.wrapFinal);
  if (fin) cv.getContext("2d")!.drawImage(fin, 0, 0, cv.width, cv.height);
  else drawWrap(cv.getContext("2d")!, d, { front: await bitmap(p.cover), wrap: await bitmap(p.wrapArt), back: await bitmap(p.backArt) }, dpi * devicePixelRatio, wrapGuides);
  const info = document.getElementById("wrapinfo");
  if (info) info.textContent = tr(`Capa total ${m.W.toFixed(3)}" × ${m.H.toFixed(3)}" (${Math.round(m.W * 300)} × ${Math.round(m.H * 300)} px a 300 dpi) · lombada ${m.spine.toFixed(3)}"${m.spineText ? "" : " · menos de 79 páginas: a KDP não permite texto na lombada"}`);
}
function wrapStudio() {
  const p = proj(); if (!p) return;
  const d = wrapOf(p);
  const inp = (k: keyof WrapDesign, l: string, type = "text") => `<label class="fld"><span>${tr(l)}</span><input type="${type}" data-wrap="${k}" value="${esc(d[k])}"></label>`;
  const sel = (k: keyof WrapDesign, l: string, opts: [string, string][]) => `<label class="fld"><span>${tr(l)}</span><select data-wrap="${k}">${opts.map(([v, t]) => `<option value="${v}" ${String(d[k]) === v ? "selected" : ""}>${tr(t)}</option>`).join("")}</select></label>`;
  const prov = S.settings.img.provider || "openai";
  document.getElementById("overlay")?.remove();
  const m = document.createElement("div"); m.className = "overlay"; m.id = "overlay";
  m.innerHTML = `<div class="picker wrapper"><div class="phead"><div><h2>${tr("Capa completa · paperback KDP")}</h2><p class="muted" id="wrapinfo"></p></div><button class="icon" data-act="overlay-x">${ic("x")}</button></div>
    <div class="wrapgrid"><div class="wside">
      <h3>${tr("Medidas")}</h3><div class="form2">${sel("trim", "Tamanho do livro", Object.keys(TRIMS).map((t) => [t, t.replace("x", " × ") + '"']))}${sel("paper", "Papel", [["cream", "Creme"], ["white", "Branco"]])}</div>
      ${inp("pages", "Páginas do miolo (define a lombada)", "number")}
      <h3>${tr("Arte")}</h3><div class="row wrapbtns"><button class="btn sm" data-act="wrap-art" data-k="wrap">${ic("sparkles", 14)} ${tr("Arte panorâmica (capa inteira)")}</button><button class="btn sm" data-act="wrap-art" data-k="front">${ic("sparkles", 14)} ${tr("Arte só da frente")}</button><button class="btn sm" data-act="wrap-file">${ic("upload", 14)} ${tr("Usar imagem minha")}</button></div>
      <p class="muted">${tr(S.keys?.[prov] ? `Imagem com ${prov === "openai" ? "ChatGPT" : "Gemini"} (troque em Configurações). As capas do acervo entram como referência de estilo.` : "Para gerar a arte, salve a chave do ChatGPT ou do Gemini em Configurações.")}</p>
      ${p.wrapArt ? `<label class="chk muted"><input type="checkbox" data-act="wrap-noart"> ${tr("Remover arte panorâmica (usar a da frente)")}</label>` : ""}
      <h3>${tr("Textos")} <button class="btn sm" data-act="wrap-text-ai">${ic("sparkles", 14)} ${tr("Escrever com IA")}</button></h3>
      ${inp("series", "Selo / série (topo da frente)")}${inp("title", "Título")}${inp("subtitle", "Subtítulo")}${inp("author", "Autor")}${inp("tagline", "Chamada do verso")}
      <label class="fld"><span>${tr("Texto do verso (sinopse)")}</span><textarea rows="7" data-wrap="back">${esc(d.back)}</textarea></label>
      <label class="fld"><span>${tr("Mini bio (opcional)")}</span><textarea rows="2" data-wrap="bio">${esc(d.bio)}</textarea></label>
      <h3>${tr("Estilo")}</h3><div class="form2">${sel("font", "Fonte do título", [["impact", "Impacto (thriller)"], ["copper", "Gravada (clássica)"], ["didot", "Elegante (Didot)"], ["serif", "Serifada"], ["sans", "Moderna"]])}${sel("titlePos", "Título na frente", [["bottom", "Embaixo"], ["top", "Em cima"]])}</div>
      <div class="colors">${(["titleColor", "accent", "textColor", "spineColor"] as const).map((k) => `<label><input type="color" data-wrap="${k}" value="${d[k]}"><span>${tr(({ titleColor: "Título", accent: "Destaque", textColor: "Textos", spineColor: "Lombada" } as any)[k])}</span></label>`).join("")}</div>
      <label class="fld"><span>${tr("Tamanho do título")}</span><input type="range" min="0.5" max="1.5" step="0.05" data-wrap="titleSize" value="${d.titleSize}"></label>
      <label class="fld"><span>${tr("Escurecer o verso")}</span><input type="range" min="0" max="0.9" step="0.05" data-wrap="darkBack" value="${d.darkBack}"></label>
    </div>
    <div class="wmain"><div class="cvbox"><canvas id="wrapcv"></canvas></div>
      <div class="row"><label class="chk muted"><input type="checkbox" data-act="wrap-guides" ${wrapGuides ? "checked" : ""}> ${tr("Mostrar guias (corte, lombada, área segura)")}</label></div>
      <div class="row"><button class="btn primary" data-act="wrap-pdf">${ic("download")} ${tr("Exportar PDF para a KDP")}</button><button class="btn" data-act="wrap-png">${ic("download")} PNG 300 dpi</button><button class="btn" data-act="wrap-ebook">${ic("image")} ${tr("Frente para o ebook (1600×2560)")}</button></div>
      <div class="editbox"><b>${ic("image", 14)} ${L("Editar à mão (logos, retoques, textos)", "Edit by hand (logos, retouching, text)")}</b>
        <p class="muted">${L("Exporta um PSD com cada parte numa camada (arte, título, autor, sinopse, lombada, código de barras e guias). Abra no PhotoCraft, Photopea (photopea.com, grátis) ou Photoshop, edite, salve como PNG e traga de volta aqui.", "Exports a PSD with each part on its own layer (art, title, author, blurb, spine, barcode and guides). Open it in PhotoCraft, Photopea (photopea.com, free) or Photoshop, edit, save as PNG and bring it back here.")}</p>
        <div class="row"><button class="btn sm" data-act="wrap-psd" ${p.wrapFinal ? "disabled" : ""}>${ic("download", 14)} ${L("Exportar editável (PSD)", "Export editable (PSD)")}</button><button class="btn sm" data-act="wrap-final">${ic("upload", 14)} ${L("Usar minha capa editada", "Use my edited cover")}</button>${p.wrapFinal ? `<button class="btn sm ghost" data-act="wrap-final-x">${ic("undo", 14)} ${L("Voltar para a capa do app", "Back to the app's cover")}</button>` : ""}</div>
        ${p.wrapFinal ? `<p class="note">${L("Usando a sua capa editada: o PDF, o PNG e a frente do ebook saem dela, do jeito que está. Os campos ao lado não mudam mais a capa.", "Using your edited cover: the PDF, PNG and ebook front come from it as is. The fields on the left no longer change the cover.")}</p>` : ""}</div>
      <p class="muted">${tr("Vermelho: linha de corte · azul: lombada · verde: área segura (textos importantes dentro dela). A caixa branca é onde a KDP imprime o código de barras.")}</p></div></div></div>`;
  document.body.appendChild(m);
  wrapRedraw();
}
/** Textos da capa (selo, chamada, sinopse, bio) escritos pela IA. */
async function coverTextsAI(p: Project, act?: Act) {
  const out = await gen("Capa", `Write the paperback cover texts for the novel "${p.title}" by ${S.author.pen || S.author.name}.\nPremise: ${p.premise.slice(0, 1800)}\n${castText(p).slice(0, 1500)}\nAuthor bio: ${(S.author.bio || "").slice(0, 600)}\n\nOutput exactly these labelled sections in English, nothing else:\nSERIES: a short genre label for the top of the front cover, in the style of the author's previous covers (e.g. "A PSYCHOLOGICAL THRILLER")\nTAGLINE: one gripping line for the top of the back cover (max 14 words)\nBACK: the back-cover blurb, 130-170 words, 2-3 short paragraphs, ending on a hook. No spoilers of the ending.\nBIO: a 30-40 word third-person author bio`, p.premise, 900, undefined, act);
  const sec = (k: string) => out.split(new RegExp(`\\**${k}\\**\\s*:`, "i"))[1]?.split(/\n\s*\**(SERIES|TAGLINE|BACK|BIO)\**\s*:/i)[0]?.trim().replace(/^["“]|["”]$/g, "") || "";
  const d = wrapOf(p);
  d.series = sec("SERIES") || d.series; d.tagline = sec("TAGLINE") || d.tagline; d.back = sec("BACK") || d.back; d.bio = sec("BIO") || d.bio;
  p.textsAI = true; saveProjects();
}
/** A sinopse do verso também serve de descrição na KDP (se ainda estiver vazia). */
function fillKdpBlurb(p: Project) {
  const d = p.kdp.description || "";
  if (/<\/?p>|<br/i.test(d)) { const t = document.createElement("textarea"); t.innerHTML = d.replace(/<\/p>\s*<p>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""); p.kdp.description = t.value.trim(); saveProjects(); }
  const b = p.wrap?.back?.trim(); if (b && !p.kdp.description.trim()) { p.kdp.description = b; saveProjects(); }
}
/** Nº real de páginas do miolo impresso (gera o PDF em memória). A lombada da capa depende disso. */
const cleanCh = (h: string) => h.replace(/<p><em>\[(Plano|Inspira|Scene plan|Inspiration)[\s\S]*?<\/p>/g, "");
function printPdf(p: Project) {
  const r = makePdf({ title: p.title, author: S.author.pen || S.author.name || "", subtitle: p.subtitle, chapters: p.chapters.filter((c) => strip(c.html).trim()).map((c) => ({ title: c.title, html: cleanCh(c.html) })) }, { print: true, trim: wrapOf(p).trim });
  const d = wrapOf(p); if (d.pages !== r.pages) { d.pages = r.pages; saveProjects(); }
  return r;
}
async function syncPrintPages(p: Project) { await new Promise((r) => setTimeout(r, 20)); try { printPdf(p); } catch { /* fica a estimativa */ } }
/** Monta a capa completa (verso + lombada + frente, com todos os textos) e a frente com título para o ebook.
 *  Roda sozinha depois de gerar/enviar uma arte e depois de editar a capa completa. */
let finishing = 0;
async function finishCover(p: Project, withTexts = true) {
  if (!p.cover && !p.wrapArt && !p.wrapFinal) return;
  const my = ++finishing;
  const d = wrapOf(p); d.title ||= p.title; d.author ||= S.author.pen || S.author.name || ""; d.pages = estPages(p);
  if (withTexts && !p.textsAI && engineReady() && S.settings.mode !== "offline") {
    const a = actStart("book", L("Textos da capa (sinopse, chamada, bio)", "Cover texts (blurb, tagline, bio)"));
    try { await coverTextsAI(p, a); actEnd(a, L("prontos", "ready")); } catch (e: any) { actEnd(a, String(e?.message || e), false); }
  }
  if (my !== finishing) return;
  fillKdpBlurb(p);
  try {
    const { cv, m, r } = await wrapCanvas(300, p);
    const pv = document.createElement("canvas"); pv.width = Math.round(cv.width / 2.5); pv.height = Math.round(cv.height / 2.5); pv.getContext("2d")!.drawImage(cv, 0, 0, pv.width, pv.height);
    p.coverFull = await invoke<string>("save_b64", { name: `full-${p.id}-${Date.now()}.jpg`, b64: pv.toDataURL("image/jpeg", 0.88) });
    const e = document.createElement("canvas"); e.width = 1600; e.height = 2560; const x = e.getContext("2d")!;
    const sx = r.frontX, sy = BLEED * 300, sw = m.trimW * 300, sh = m.trimH * 300, s = Math.max(1600 / sw, 2560 / sh);
    x.drawImage(cv, sx + (sw - 1600 / s) / 2, sy + (sh - 2560 / s) / 2, 1600 / s, 2560 / s, 0, 0, 1600, 2560);
    p.ebookCover = await invoke<string>("save_b64", { name: `ebook-${p.id}-${Date.now()}.jpg`, b64: e.toDataURL("image/jpeg", 0.92) });
    saveProjects(); render();
  } catch (e) { console.warn("finishCover", e); }
}
/** Capa em resolução de impressão (sem guias). */
/** Gerador padrão: o grátis local se estiver instalado (ou se o escolhido não tiver chave). */
const imgProv = () => S.imgLocal.ok && (S.settings.img.provider === "local" || !S.keys?.[S.settings.img.provider]) ? "local" : S.settings.img.provider;
/** Projeto da capa: o do botão (data-id) ou o aberto no Estúdio. */
function coverProj(el?: HTMLElement): Project { const id = el?.closest<HTMLElement>("[data-id]")?.dataset.id; document.querySelectorAll("details.menu[open]").forEach((d) => d.removeAttribute("open")); return S.projects.find((x) => x.id === id) || S.projects.find((x) => x.id === S.openId) || proj()!; }
/** Menu de exportação da capa (frente, verso, lombada). */
function coverExportItems(p: Project) {
  const it = (act: string, tag: string, t: string, sub: string) => `<button class="mitem" data-act="${act}" data-id="${p.id}"><span class="mthumb">${tag}</span><span><b>${t}</b><small>${sub}</small></span></button>`;
  return it("wrap-pdf", "PDF", L("Capa completa · PDF para a KDP", "Full cover · PDF for KDP"), L("verso + lombada + frente, 300 dpi, com sangria", "back + spine + front, 300 dpi, with bleed"))
    + it("wrap-png", "PNG", L("Capa completa · PNG 300 dpi", "Full cover · PNG 300 dpi"), L("a mesma capa, em imagem", "the same cover, as an image"))
    + it("cover-ebook-save", "JPG", L("Capa do ebook (frente)", "Ebook cover (front)"), "1600 × 2560 · Kindle")
    + it("wrap-psd", "PSD", L("Capa editável (PSD em camadas)", "Editable cover (layered PSD)"), L("para PhotoCraft, Photopea ou Photoshop", "for PhotoCraft, Photopea or Photoshop"));
}
async function wrapCanvas(dpi = 300, p: Project = proj()!) { const d = wrapOf(p), m = kdpDims(d.trim, d.pages, d.paper);
  const cv = document.createElement("canvas"); cv.width = Math.round(m.W * dpi); cv.height = Math.round(m.H * dpi);
  const fin = await bitmap(p.wrapFinal);
  if (fin) { cv.getContext("2d")!.drawImage(fin, 0, 0, cv.width, cv.height); const frontX = Math.round((BLEED + m.trimW + m.spine) * dpi); return { cv, m, r: { W: cv.width, H: cv.height, frontX, frontW: cv.width - frontX } }; }
  const r = drawWrap(cv.getContext("2d")!, d, { front: await bitmap(p.cover), wrap: await bitmap(p.wrapArt), back: await bitmap(p.backArt) }, dpi, false);
  return { cv, m, r };
}

// ---------- ações ----------
function newProject(): Project {
  return { id: uid(), title: "", subtitle: "", premise: "", genre: S.author.genres || "", names: "", nChapters: 15, chapters: [], chat: [], kdp: { description: "", keywords: [], categories: [], series: "", price: "4.99", lang: S.profile?.lang || "en" }, updated: Date.now() };
}

async function refreshLocal() { S.local = await invoke<any>("local_models"); if (!S.settings.models.local) { const r = S.local.models.find((m: any) => m.ready); if (r) { S.settings.models.local = r.id; save_("settings", S.settings); } } }
const ACT: Record<string, (el: HTMLElement) => any> = {
  "thumb-fit": (el) => {
    const c = S.lib.find((x) => x.id === el.dataset.id)!; c.thumbFit = el.dataset.v as any; save_("library", S.lib);
    el.parentElement!.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === el));
    $("#tprev")?.setAttribute("style", thumbStyle(c)); render();
  },
  "cover-view": (el) => { const c = S.lib.find((x) => x.id === el.dataset.id); if (c) coverModal(c); },
  "overlay-x": () => document.getElementById("overlay")?.remove(),
  "cover-png": async (el) => {
    const c = S.lib.find((x) => x.id === el.dataset.id)!; const book = S.lib.find((b) => b.id === c.bookId);
    const out = await save({ defaultPath: `${(book?.title || c.title).replace(/[^\w\s-]/g, "")} - capa.png`, filters: [{ name: "PNG", extensions: ["png"] }] });
    if (!out) return;
    toast("Gerando PNG em alta resolução…");
    const src = c.ext === "pdf" ? await renderThumb(await openPdf(c.path), 4000) : null;
    if (src) await invoke("write_b64", { path: out, b64: src }); else await invoke("copy_file", { src: c.path, dest: out });
    toast("Capa exportada"); invoke("reveal", { path: out });
  },
  "cover-orig": async (el) => {
    const c = S.lib.find((x) => x.id === el.dataset.id)!; const book = S.lib.find((b) => b.id === c.bookId);
    const out = await save({ defaultPath: `${(book?.title || c.title).replace(/[^\w\s-]/g, "")} - capa.${c.ext}`, filters: [{ name: c.ext.toUpperCase(), extensions: [c.ext] }] });
    if (out) { await invoke("copy_file", { src: c.path, dest: out }); toast("Capa exportada"); invoke("reveal", { path: out }); }
  },
  "export-txt": async () => {
    const { title, chapters } = await readerBook();
    const out = await save({ defaultPath: `${title.replace(/[^\w\s-]/g, "")}.txt`, filters: [{ name: "Texto", extensions: ["txt"] }] });
    if (!out) return;
    await invoke("write_text_file", { path: out, text: `${title}\n${S.author.pen || S.author.name || ""}\n\n` + chapters.map((c) => `${c.title}\n\n${strip(c.html)}`).join("\n\n\n") });
    toast("Texto exportado"); invoke("reveal", { path: out });
  },
  "open-book": (el) => { S.openId = el.dataset.id!; document.querySelectorAll("details.menu[open]").forEach((d) => d.removeAttribute("open")); render(); },
  "export-pdf": async (el) => {
    document.querySelectorAll("details.menu[open]").forEach((d) => d.removeAttribute("open"));
    const print = el.dataset.v === "print";
    const { title, chapters } = await readerBook(); const p = S.projects.find((x) => x.id === S.openId);
    const out = await save({ defaultPath: `${title.replace(/[^\w\s-]/g, "")}${print ? " - paperback" : ""}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (!out) return;
    toast(tr("Montando o PDF…"));
    await new Promise((r) => setTimeout(r, 30));
    try {
      const r = makePdf({ title, author: S.author.pen || S.author.name || "", subtitle: p?.subtitle, chapters }, { print, trim: p?.wrap?.trim });
      await invoke("write_b64", { path: out, b64: r.b64 });
      toast(`PDF ${tr("exportado")}: ${r.pages} ${tr("páginas")}${print && p ? ` · ${tr("use esse número na capa completa (lombada)")}` : ""}`); invoke("reveal", { path: out });
    } catch (e) { toast(String(e), true); }
  },
  "export-epub": async () => {
    const { title, chapters, cover } = await readerBook();
    const out = await save({ defaultPath: `${title.replace(/[^\w\s-]/g, "")}.epub`, filters: [{ name: "EPUB", extensions: ["epub"] }] });
    if (!out) return;
    try {
      await invoke("export_epub", { out, book: { title, author: S.author.pen || S.author.name || "", lang: S.profile?.lang || "en", description: "", publisher: S.author.pen || S.author.name, cover, front: "", chapters } });
      toast("EPUB exportado"); invoke("reveal", { path: out });
    } catch (e) { toast(String(e), true); }
  },
  picker: async () => { S.picker = true; render(); await refreshLocal(); S.claude = await invoke("claude_status"); if (S.picker) render(); },
  "picker-close": () => { S.picker = false; render(); },
  "set-mode": (el) => { S.settings.mode = el.dataset.m; save_("settings", S.settings); render(); },
  "dl-model": async (el) => { const id = el.dataset.id!; S.dl[id] = { done: 0, total: S.local.models.find((m) => m.id === id)?.size || 1 }; render(); try { await invoke("local_download", { id }); } catch (e) { delete S.dl[id]; toast(String(e), true); render(); } },
  "dl-cancel": () => invoke("local_download_cancel"),
  "use-model": (el) => { S.settings.models.local = el.dataset.id; S.settings.mode = "local"; save_("settings", S.settings); render(); },
  "del-model": async (el) => { if (!confirm("Apagar este modelo do computador? Dá para baixar de novo depois.")) return; await invoke("local_delete", { id: el.dataset.id }); await refreshLocal(); render(); },
  "import-gguf": async () => { const r = await open({ filters: [{ name: "Modelo GGUF", extensions: ["gguf"] }] }); if (!r) return; S.busy = "Copiando o modelo…"; render(); try { S.settings.models.local = await invoke<string>("local_import", { src: r }); S.settings.mode = "local"; save_("settings", S.settings); await refreshLocal(); } catch (e) { toast(String(e), true); } S.busy = ""; render(); },
  "toggle-refs": () => { S.settings.useRefs = !S.settings.useRefs; save_("settings", S.settings); render(); },
  "draft-cover": (el) => { const v = el.dataset.v || ""; if (v && !S.keys?.[v]) { toast("Salve a chave dessa IA em Configurações primeiro", true); } S.settings.draft = { ...(S.settings.draft || {}), coverAI: v }; save_("settings", S.settings); render(); },
  "claude-model": (el) => { S.settings.models.claude = el.dataset.v || ""; save_("settings", S.settings); render(); },
  "draft-size": (el) => { S.settings.draft = { ...(S.settings.draft || {}), pages: el.dataset.n }; save_("settings", S.settings); render(); },
  "import-ref": async () => { const r = await open({ multiple: true, filters: [{ name: "Obras", extensions: ["txt", "pdf", "docx", "md"] }] }); if (r) await importPaths(Array.isArray(r) ? r : [r], undefined, "referencia"); },
  "create-book": async () => {
    const d = S.settings.draft || {};
    if (!d.title?.trim() && !d.ideas?.trim()) return toast("Dê um nome ou escreva suas ideias", true);
    const p = newProject();
    p.title = d.title?.trim() || "Sem título"; p.premise = d.ideas || ""; p.names = d.names || ""; p.pages = +(d.pages || 180); p.nChapters = chaptersFor(p.pages);
    p.style = { ...styleOf(null), genres: "", base: authorBooks().length ? (S.settings.useRefs && refWorks().length ? "both" : "author") : "refs" };
    S.projects.unshift(p); S.projId = p.id; S.chap = 0; saveProjects();
    S.view = "estudio"; render();
    S.settings.draft = {}; save_("settings", S.settings);
    if (engineReady()) await buildBook(p, d.writeAll !== false, false, d.coverAI || "");
    else { await makeOutline(p); saveProjects(); render(); toast("Roteiro criado sem IA. Para fichas de personagens e capítulos completos, escolha Local ou Claude", true); }
  },
  "write-chap": async () => { const p = proj(); const c = p?.chapters[S.chap]; if (!p || !c) return; if ((c.done || words(strip(c.html)) >= perChapter(p) * 0.8) && !confirm(tr("Reescrever este capítulo do zero? O texto atual será substituído."))) return; if (words(strip(c.html)) >= perChapter(p) * 0.8) c.done = true; if (!leaveEdit()) return; await writeChapter(p, S.chap); },
  "write-all": async () => {
    const p = proj(); if (!p) return;
    const todo = p.chapters.map((c, i) => [c, i] as const).filter(([c]) => !c.done && words(strip(c.html)) < perChapter(p) * 0.6);
    if (!todo.length) return toast("Todos os capítulos já têm texto");
    S.stopGen = false;
    for (const [, i] of todo) { if (!(await writeChapter(p, i)) || S.stopGen) break; }
    if (!S.stopGen && engineReady()) { S.writing = "world"; render(); await aiWorld(p); S.writing = ""; render(); }
    toast(S.stopGen ? "Geração parada — continue quando quiser com Escrever todos" : "Capítulos escritos — revise e ajuste o que quiser");
  },
  deepen: async () => {
    if (!S.bible || !engineReady()) { S.picker = true; render(); return; }
    const books = await sources();
    const p = { chat: [] } as any;
    let n = 0;
    for (const c of S.bible.characters.slice(0, 10)) {
      S.busy = `Aprofundando personagens… ${++n}/10`; render();
      const ctx = books.map((b) => b.text).join("\n").split(/\n{2,}/).filter((x) => x.includes(c.name)).slice(0, 14).join("\n").slice(0, 5000);
      try { c.summary = (await runAI({ mode: S.settings.mode, models: S.settings.models, system: "You analyze fiction. Answer in English, max 70 words, no preamble.", history: p.chat, prompt: `From these excerpts, describe the character ${c.name}: personality, appearance, role in the story, relationships, arc.\n\n${ctx}`, maxTokens: 160, onDelta: () => {} })).trim(); } catch { break; }
    }
    n = 0;
    const chs = S.bible.chapters;
    for (const c of chs) {
      S.busy = `Resumindo capítulos… ${++n}/${chs.length}`; const b = $("#busy"); if (b) b.textContent = S.busy; else render();
      const book = books.find((x) => x.title === c.book); if (!book) continue;
      const k = book.text.indexOf(c.opening.slice(0, 40)); const txt = k >= 0 ? book.text.slice(k, k + 9000) : "";
      if (!txt) continue;
      try { c.aiSummary = (await runAI({ mode: S.settings.mode, models: S.settings.models, system: "You summarize fiction chapters. Max 60 words, English, no preamble.", history: [], prompt: `Summarize this chapter: key events, twist, emotional beat.\n\n${txt}`, maxTokens: 140, onDelta: () => {} })).trim(); } catch { break; }
    }
    await save_("bible", S.bible); S.busy = ""; render(); toast("Bíblia aprofundada");
  },
  "backup-export": async () => {
    const out = await save({ defaultPath: `book-studio-backup-${new Date().toISOString().slice(0, 10)}.zip`, filters: [{ name: "Backup", extensions: ["zip"] }] });
    if (!out) return;
    const withKeys = confirm("Incluir as chaves de API no backup? (OK = sim, Cancelar = não)");
    S.busy = "Gerando backup…"; render();
    try { const n = await invoke<number>("backup_export", { out, withKeys }); toast(`Backup salvo (${n} arquivos)`); invoke("reveal", { path: out }); } catch (e) { toast(String(e), true); }
    S.busy = ""; render();
  },
  "backup-import": async () => {
    const r = await open({ filters: [{ name: "Backup", extensions: ["zip"] }] });
    if (!r || !confirm("Restaurar este backup? Arquivos com o mesmo nome serão substituídos.")) return;
    S.busy = "Restaurando backup…"; render();
    try { const n = await invoke<number>("backup_import", { src: r }); toast(`Backup restaurado (${n} arquivos)`); setTimeout(() => location.reload(), 900); } catch (e) { toast(String(e), true); S.busy = ""; render(); }
  },
  view: (el) => { if (!leaveEdit()) return; if (el.dataset.v !== "mapa") { mapCtl?.stop(); mapCtl = null; } S.view = el.dataset.v!; S.settings.lastView = S.view; save_("settings", S.settings); render(); },
  import: async () => { const r = await open({ multiple: true, filters: [{ name: "Livros e imagens", extensions: ["pdf", "docx", "txt", "md", "png", "jpg", "jpeg", "webp"] }] }); if (r) importPaths(Array.isArray(r) ? r : [r]); },
  read: (el) => { S.openId = el.dataset.id!; S.view = "leitor"; render(); },
  reveal: (el) => invoke("reveal", { path: el.dataset.path }),
  "del-item": async (el) => {
    const i = S.lib.find((x) => x.id === el.dataset.id); if (!i || !confirm(`Remover “${i.title}” do acervo?`)) return;
    const gone = S.lib.filter((x) => x === i || (x.kind === "capa" && x.bookId === i.id));
    S.lib = S.lib.filter((x) => !gone.includes(x)); for (const g of gone) await invoke("remove_file", { path: g.path });
    linkCovers(); await save_("library", S.lib); render();
  },
  "cover-for": async (el) => {
    const r = await open({ filters: [{ name: "Capa (PDF ou imagem)", extensions: ["pdf", "png", "jpg", "jpeg", "webp"] }] });
    if (!r) return;
    const id = el.dataset.id!;
    for (const old of S.lib.filter((x) => x.kind === "capa" && x.bookId === id)) { S.lib = S.lib.filter((x) => x !== old); await invoke("remove_file", { path: old.path }); }
    importPaths([r as string], id);
  },
  rtab: (el) => { S.readTab = el.dataset.t!; render(); },
  font: (el) => { S.settings.readFont = Math.max(14, Math.min(30, S.settings.readFont + +el.dataset.d!)); save_("settings", S.settings); $("#reader")?.style.setProperty("--rf", S.settings.readFont + "px"); },
  rtheme: (el) => { S.settings.readTheme = el.dataset.t; save_("settings", S.settings); render(); },
  "author-fill": async () => {
    for (const b of S.lib.filter((i) => i.kind === "livro")) { const info = findAuthorInfo(await textOf(b.id)); S.author.name ||= info.name; S.author.email ||= info.email; S.author.site ||= info.site; }
    S.author.books = S.lib.filter((i) => i.kind === "livro").map((i) => i.title);
    if (!S.author.genres && S.profile) S.author.genres = S.profile.themes.slice(0, 3).map((t) => t[0]).join(", ");
    await save_("author", S.author); render(); toast("Dados preenchidos a partir do acervo");
  },
  "author-bio-ai": async () => {
    const p = proj() || S.projects[0] || newProject();
    if (!leaveEdit()) return; S.writing = "bio"; render();
    const out = await ask(`Write a professional third-person author bio (120-180 words, English) for the Amazon Author Central page of ${S.author.name}. Books: ${(S.author.books || []).join(", ")}. Known facts: ${S.author.bio || ""} ${S.author.country || ""}. Output only the bio.`, p, { record: false });
    S.writing = "";
    if (out) { S.edit = { kind: "a-bio", id: "a-bio", draft: { bio: out.trim() }, dirty: true }; toast(tr("Bio pronta — revise e clique em Salvar")); }
    render();
  },
  analyze: () => runAnalysis(),
  check: () => { const t = $<HTMLTextAreaElement>("#chk").value; if (!S.profile || words(t) < 30) return toast("Cole pelo menos 30 palavras", true); S.check = checkStyle(t, S.profile); render(); },
  "new-proj": () => { S.trashView = false; S.projId = ""; S.settings.lastProj = ""; save_("settings", S.settings); S.view = "estudio"; render(); document.querySelector(".wizard")?.scrollIntoView({ behavior: "smooth" }); },
  "sel-proj": (el) => { S.trashView = false; S.projId = el.dataset.id!; S.chap = 0; const sp = S.projects.find((x) => x.id === el.dataset.id); S.settings.lastProj = el.dataset.id; save_("settings", S.settings); S.ptab = el.dataset.t || (sp && projWords(sp) ? "write" : "idea"); S.view = "estudio"; render(); },
  ptab: (el) => { if (!leaveEdit()) return; if (el.dataset.t === "read") return ACT["read-proj"](el); S.ptab = el.dataset.t!; S.settings.ptab = S.ptab; save_("settings", S.settings); render(); },
  "cast-add": () => { if (!leaveEdit()) return; const p = proj()!; const x = newCast(); castOf(p).push(x); S.castOpen = x.id; S.edit = { kind: "cast", id: x.id, draft: { ...x }, dirty: false, isNew: true }; render(); setTimeout(() => $<HTMLInputElement>('[data-ed="name"]')?.focus(), 30); },
  "cast-del": (el) => { const p = proj()!; const x = castOf(p).find((c) => c.id === el.dataset.id); if (!x || !confirm(`Remover “${x.name || "personagem"}”?`)) return; S.edit = null; p.cast = castOf(p).filter((c) => c !== x); p.names = p.cast.map((c) => c.name).filter(Boolean).join(", "); saveProjects(); render(); },
  "cast-ai": async () => { const p = proj()!; if (!engineReady()) { S.picker = true; render(); return; } S.writing = "cast"; S.acts = []; render(); try { await aiCast(p); } catch (e: any) { toast(String(e?.message || e), true); } S.writing = ""; S.busy = ""; render(); },
  "cast-fill": async (el) => {
    const p = proj()!; const x = castOf(p).find((c) => c.id === el.dataset.id); if (!x) return; if (!engineReady()) { S.picker = true; render(); return; }
    S.writing = "cast"; render();
    const act = actStart("fingerprint", L(`Completando a ficha de ${x.name || "personagem"}`, `Completing ${x.name || "character"}'s sheet`), L("preenchendo os campos vazios", "filling the empty fields"));
    try {
      const out = await gen("Personagem", `Novel "${p.title}". Premise: ${p.premise.slice(0, 2000)}\n${castText(p)}\n\nComplete the character sheet of ${x.name || "a new character"} — keep everything already written about them and fill in every missing field, consistent with the premise and the other characters. Output ONLY this one block.\n\n${CAST_FORMAT}`, p.premise + " " + x.name, 1200, undefined, act);
      const got = parseCast(out); if (got[0] && !x.name) x.name = got[0].name!;
      if (got[0]) { got[0].name = x.name; mergeCast(p, [got[0]]); }
      saveProjects(); actEnd(act, got[0] ? L("ficha completa", "sheet complete") : L("resposta fora do formato", "answer out of format"), !!got[0]);
    } catch (e: any) { actEnd(act, String(e?.message || e), false); }
    S.writing = ""; S.busy = ""; render();
  },
  "edit-chap": (el) => { const p = S.projects.find((x) => x.id === S.openId); if (!p) return; S.projId = p.id; S.chap = +(el.dataset.i || 0); S.ptab = "write"; S.view = "estudio"; render(); },
  "del-proj": (el) => { const p = el.dataset.id ? S.projects.find((x) => x.id === el.dataset.id) : proj(); if (!p) return; p.trashed = Date.now(); if (S.projId === p.id) S.projId = ""; saveProjects(); toast(L(`“${p.title || "Sem título"}” foi para a lixeira (Estúdio › Lixeira para restaurar)`, `“${p.title || "Untitled"}” moved to Trash (Studio › Trash to restore)`)); render(); },
  "proj-status": (el) => { const p = proj(); if (!p) return; const v = el.dataset.v as any; p.status = v || undefined; if (v !== "approved" && S.ptab === "publish") S.ptab = "idea"; saveProjects(); toast(v === "approved" ? L("Aprovado: agora aparece no Acervo e no Leitor", "Approved: now shows in the Library and Reader") : v === "rejected" ? L("Rejeitado: some do Acervo e do Leitor (continua no Estúdio)", "Rejected: hidden from the Library and Reader (stays in the Studio)") : L("Voltou para rascunho", "Back to draft")); render(); },
  "trash-view": () => { S.trashView = !S.trashView; S.view = "estudio"; render(); },
  "trash-restore": (el) => { const p = S.projects.find((x) => x.id === el.dataset.id); if (!p) return; delete p.trashed; saveProjects(); toast(L(`“${p.title}” restaurado`, `“${p.title}” restored`)); render(); },
  "trash-kill": (el) => { const p = S.projects.find((x) => x.id === el.dataset.id); if (!p) return; if (!confirm(L(`Excluir “${p.title || "Sem título"}” definitivamente? Ele sai da lixeira e não dá para restaurar por aqui.`, `Delete “${p.title || "Untitled"}” forever? It leaves the Trash and can't be restored from here.`))) return; S.projects = S.projects.filter((x) => x !== p); saveProjects(); toast(L("Excluído definitivamente", "Deleted forever")); render(); },
  "trash-empty": () => { const n = S.projects.filter((x) => x.trashed).length; if (!n || !confirm(L(`Excluir definitivamente ${n} livro(s) da lixeira?`, `Delete ${n} book(s) in the Trash forever?`))) return; S.projects = S.projects.filter((x) => !x.trashed); saveProjects(); render(); },
  "sel-chap": (el) => { if (!leaveEdit()) return; S.chap = +el.dataset.i!; render(); },
  "add-chap": () => { const p = proj()!; p.chapters.push({ id: uid(), title: `Chapter ${p.chapters.length + 1}`, html: "<p></p>" }); S.chap = p.chapters.length - 1; saveProjects(); render(); },
  "chap-del": () => { const p = proj()!; if (!confirm("Apagar este capítulo?")) return; p.chapters.splice(S.chap, 1); S.chap = Math.max(0, S.chap - 1); saveProjects(); render(); },
  "chap-up": () => { const p = proj()!; if (S.chap < 1) return; const [c] = p.chapters.splice(S.chap, 1); p.chapters.splice(--S.chap, 0, c); saveProjects(); render(); },
  "scene-break": () => { document.execCommand("insertHTML", false, "<hr><p></p>"); },
  outline: () => {
    const p = proj()!;
    if (p.chapters.some((c) => strip(c.html).trim()) && !confirm("Substituir os capítulos atuais pelo novo esboço?")) return;
    p.chapters = outline({ premise: p.premise, chapters: p.nChapters, names: castOf(p).map((x) => x.name).filter(Boolean), profile: S.profile }).map((o) => ({ id: uid(), title: o.title, plan: `${o.beat}: ${o.summary} (~${o.target} words)`, html: "<p></p>" }));
    S.chap = 0; saveProjects(); render(); toast("Esboço criado — edite os títulos e planos à vontade");
  },
  scaffold: async () => {
    const p = proj()!; const ch = p.chapters[S.chap]; if (!ch) return;
    ch.html = sceneScaffold(S.profile, await corpus(), ch.plan || p.premise, p.names.split(",").map((s) => s.trim()).filter(Boolean)) + ch.html;
    saveProjects(); render();
  },
  "check-chap": () => {
    const p = proj()!; const t = strip(p.chapters[S.chap]?.html || "");
    if (!S.profile || words(t) < 30) return toast("Escreva pelo menos 30 palavras no capítulo", true);
    const r = checkStyle(t, S.profile); const c = craftCheck(t);
    alert(`${tr("Soa humano (StoryScope/sepia)")}: ${c.score}/100\n• ${c.tips.map(tr).join("\n• ")}\n\nAfinidade com o estilo: ${r.score}/100\n\n• ${r.tips.join("\n• ")}\n\nSeu texto: ${r.q.avgSentence} palavras/frase, ${r.q.dialoguePct}% diálogo.\nAutor: ${S.profile.avgSentence} palavras/frase, ${S.profile.dialoguePct}% diálogo.`);
  },
  quick: async (el) => {
    const p = proj(); if (!p) return;
    const q = QUICK.find((x) => x.id === el.dataset.q)!;
    if (["chapter", "continue", "revise"].includes(q.id) && !p.chapters[S.chap]) return toast("Crie/escolha um capítulo primeiro", true);
    const chN = `${L("capítulo", "chapter")} ${S.chap + 1}${p.chapters[S.chap]?.title ? ` (${p.chapters[S.chap].title})` : ""}`;
    const eff: Record<string, string> = { chapter: L(`Escreve o ${chN} e coloca o texto no livro (o texto atual fica no histórico de versões).`, `Writes ${chN} and puts the text in the book (the current text stays in the version history).`), continue: L(`Continua o texto do ${chN}; a resposta aparece no chat.`, `Continues the text of ${chN}; the answer shows up in the chat.`), revise: L(`Revisa o ${chN} no estilo do autor; a resposta aparece no chat.`, `Revises ${chN} in the author's style; the answer shows up in the chat.`) };
    if (!(await confirmAI({ to: engName(), what: `${q.label}?`, effect: eff[q.id] || L("A resposta aparece no chat, ao lado.", "The answer shows up in the chat."), ok: L("Confirmar", "Confirm") }))) return;
    if (q.id === "chapter") { S.ptab = "write"; S.stopGen = false; await writeChapter(p, S.chap); return; }
    const out = await ask(q.prompt(ctx(p)), p);
    if (!out) return;
    if (q.id === "outline") applyOutline(out, p);
    else if (q.id === "chapter") { p.chapters[S.chap].html = marked.parse(out) as string; saveProjects(); render(); }
    else if (q.id === "continue") { p.chapters[S.chap].html += marked.parse(out) as string; saveProjects(); render(); }
    else if (q.id === "kdp") { parseKdp(out, p); saveProjects(); render(); }
  },
  send: async () => { const t = $<HTMLTextAreaElement>("#ask").value.trim(); const p = proj(); if (!t || !p || S.busy === "ai") return;
    if (!engineReady()) { S.picker = true; render(); return; }
    if (!(await confirmAI({ to: engName(), what: L("Enviar pedido para a IA?", "Send this request to the AI?"), text: t, effect: L(`A resposta aparece no chat, ao lado. Nada no livro "${p.title}" muda sozinho.`, `The answer shows up in the chat. Nothing in "${p.title}" changes by itself.`) }))) return;
    ask(t, p); },
  stop: () => cancelAI(),
  "gen-book": async () => {
    const p = proj()!; if (!engineReady()) { S.picker = true; render(); return toast("Escolha Local ou Claude para escrever o livro", true); }
    p.pages ||= 180; p.nChapters = chaptersFor(p.pages); S.ptab = "write"; saveProjects();
    await buildBook(p, true);
  },
  chview: (el) => { if (!leaveEdit()) return; S.chview = el.dataset.v!; render(); },
  "open-chap": (el) => { if (!leaveEdit()) return; S.chap = +el.dataset.i!; S.chview = "editor"; render(); },
  "write-chap-i": async (el) => { const p = proj()!; const c = p.chapters[+el.dataset.i!]; if (c && (c.done || words(strip(c.html)) >= perChapter(p) * 0.8) && !confirm(tr("Reescrever este capítulo do zero? O texto atual será substituído."))) return; if (c && words(strip(c.html)) >= perChapter(p) * 0.8) c.done = true; S.stopGen = false; S.chview = "editor"; await writeChapter(p, +el.dataset.i!); },
  "wrap-open": () => wrapStudio(),
  "wrap-guides": (el) => { wrapGuides = (el as HTMLInputElement).checked; wrapRedraw(); },
  "wrap-noart": () => { const p = proj()!; keepAllArts(p); p.wrapArt = undefined; saveProjects(); wrapStudio(); finishCover(p, false); },
  "wrap-file": async () => { const r = await open({ filters: [{ name: "Imagem", extensions: ["jpg", "jpeg", "png", "webp"] }] }); if (!r) return; const p = proj()!; const wide = confirm(tr("Essa imagem é a arte da capa inteira (panorâmica)? OK = capa inteira · Cancelar = só a frente")); keepAllArts(p); keepArt(p, wide ? "wrap" : "front", r as string); if (wide) p.wrapArt = r as string; else p.cover = r as string; saveProjects(); wrapStudio(); finishCover(p, false); },
  "wrap-art": async (el) => {
    const p = proj()!; const prov = imgProv();
    if (el.dataset.k !== "wrap") return artDialog({ prov, what: el.dataset.k === "back" ? "back" : "front" });
    if (!confirm(prov === "local" ? L("Gerar a arte panorâmica (capa inteira) neste computador? Leva uns 5 minutos e deixa o computador mais lento enquanto isso.", "Generate the panoramic art (whole cover) on this computer? It takes about 5 minutes and slows the computer down meanwhile.") : L("Gerar a arte panorâmica? A imagem é cobrada pela sua chave.", "Generate the panoramic art? The image is billed to your key."))) return;
    if (prov === "local" ? !S.imgLocal.ok : !S.keys?.[prov]) return toast(prov === "local" ? L("Instale o gerador local em Configurações", "Install the local generator in Settings") : "Salve a chave do ChatGPT ou do Gemini em Configurações", true);
    el.setAttribute("disabled", ""); el.innerHTML = `<span class="spin"></span> ${tr("Gerando… (até 1 min)")}`;
    await makeCover(p, prov, el.dataset.k as any); S.busy = ""; wrapStudio();
  },
  "wrap-text-ai": async (el) => {
    const p = proj()!; if (!engineReady()) return toast("Escolha uma IA de texto (Claude, Local…) no Estúdio", true);
    el.setAttribute("disabled", ""); el.innerHTML = `<span class="spin"></span> ${tr("Escrevendo…")}`;
    try { await coverTextsAI(p); toast("Textos da capa prontos"); finishCover(p, false); } catch (e: any) { toast(String(e?.message || e), true); }
    S.busy = ""; wrapStudio();
  },
  "wrap-pdf": async (el) => {
    const p = coverProj(el); const out = await save({ defaultPath: `${(p.title || "cover").replace(/[^\w\s-]/g, "")} - paperback cover.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] }); if (!out) return;
    toast("Gerando a capa em 300 dpi…"); await syncPrintPages(p);
    const { cv, m } = await wrapCanvas(300, p);
    await invoke("write_pdf_image", { path: out, b64: cv.toDataURL("image/jpeg", 0.95), wIn: m.W, hIn: m.H, pxW: cv.width, pxH: cv.height });
    toast("PDF da capa pronto para a KDP"); invoke("reveal", { path: out });
  },
  "wrap-psd": async (el) => {
    const p = coverProj(el); const out = await save({ defaultPath: `${(p.title || "cover").replace(/[^\w\s-]/g, "")} - cover (editable).psd`, filters: [{ name: "PSD", extensions: ["psd"] }] }); if (!out) return;
    toast(L("Montando o PSD em camadas (300 dpi)…", "Building the layered PSD (300 dpi)…"));
    try {
      await syncPrintPages(p); const { wrapPsd, b64 } = await import("./psd");
      const bytes = wrapPsd(wrapOf(p), { front: await bitmap(p.cover), wrap: await bitmap(p.wrapArt), back: await bitmap(p.backArt) }, 300, (s) => tr(s));
      await invoke("write_b64", { path: out, b64: b64(bytes) });
      toast(L("PSD pronto: abra no PhotoCraft, Photopea ou Photoshop", "PSD ready: open it in PhotoCraft, Photopea or Photoshop")); invoke("reveal", { path: out });
    } catch (e) { toast(L("Não deu para gerar o PSD: ", "Couldn't build the PSD: ") + String(e)); }
  },
  "wrap-final": async () => {
    const r = await open({ filters: [{ name: "Imagem", extensions: ["png", "jpg", "jpeg", "webp"] }] }); if (!r) return;
    const p = proj()!; const d = wrapOf(p), m = kdpDims(d.trim, d.pages, d.paper); const b = await bitmap(r as string);
    if (b && Math.abs(b.width / b.height - m.W / m.H) > 0.03 && !confirm(L(`Essa imagem não tem a proporção da capa completa (${m.W.toFixed(2)}" × ${m.H.toFixed(2)}"). Ela será esticada. Usar mesmo assim?`, `This image doesn't match the full cover's proportions (${m.W.toFixed(2)}" × ${m.H.toFixed(2)}"). It will be stretched. Use it anyway?`))) return;
    if (b && b.width < m.W * 250 && !confirm(L("A imagem tem baixa resolução para impressão (menos de 250 dpi). Usar mesmo assim?", "The image is low resolution for print (under 250 dpi). Use it anyway?"))) return;
    p.wrapFinal = r as string; saveProjects(); toast(L("Capa editada em uso", "Edited cover in use")); wrapStudio(); finishCover(p, false);
  },
  "cover-ebook-save": async (el) => {
    const p = coverProj(el); if (!p.ebookCover) await finishCover(p, false); if (!p.ebookCover) return;
    const out = await save({ defaultPath: `${(p.title || "cover").replace(/[^\w\s-]/g, "")} - ebook cover.jpg`, filters: [{ name: "JPG", extensions: ["jpg"] }] }); if (!out) return;
    await invoke("copy_file", { src: p.ebookCover, dest: out }).catch(async () => { const b = await bitmap(p.ebookCover); const c = document.createElement("canvas"); c.width = b!.width; c.height = b!.height; c.getContext("2d")!.drawImage(b!, 0, 0); await invoke("write_b64", { path: out, b64: c.toDataURL("image/jpeg", 0.92) }); });
    toast(L("Capa do ebook exportada (1600×2560)", "Ebook cover exported (1600×2560)")); invoke("reveal", { path: out });
  },
  "arts-toggle": (el) => { setTimeout(() => { S.artsOpen = !!el.closest("details")?.open; }, 0); },
  "art-use": (el) => { const p = proj(); const a = p?.arts?.[+el.dataset.i!]; if (!p || !a) return; keepAllArts(p); const as = el.dataset.as!;
    if (as === "wrap") p.wrapArt = a.path; else if (as === "back") p.backArt = a.path; else p.cover = a.path;
    saveProjects(); toast(L("Arte trocada — remontando a capa completa…", "Artwork swapped — rebuilding the full cover…")); render(); finishCover(p, false); },
  "art-del": (el) => { const p = proj(); const i = +el.dataset.i!; const a = p?.arts?.[i]; if (!p || !a) return; if (!confirm(L("Remover esta arte da lista do livro? (o arquivo continua guardado na pasta de imagens)", "Remove this artwork from the book's list? (the file stays saved in the images folder)"))) return; p.arts!.splice(i, 1); saveProjects(); render(); },
  "cover-back": () => artDialog({ prov: imgProv(), what: "back" }),
  "wrap-final-x": () => { const p = proj()!; p.wrapFinal = undefined; saveProjects(); wrapStudio(); finishCover(p, false); },
  "wrap-png": async (el) => {
    const p = coverProj(el); const out = await save({ defaultPath: `${(p.title || "cover").replace(/[^\w\s-]/g, "")} - paperback cover.png`, filters: [{ name: "PNG", extensions: ["png"] }] }); if (!out) return;
    await syncPrintPages(p); const { cv } = await wrapCanvas(300, p); await invoke("write_b64", { path: out, b64: cv.toDataURL("image/png") }); toast("Capa exportada"); invoke("reveal", { path: out });
  },
  "wrap-ebook": async () => {
    const p = proj()!; const { cv, m, r } = await wrapCanvas(300);
    const e = document.createElement("canvas"); e.width = 1600; e.height = 2560; const x = e.getContext("2d")!;
    const sx = r.frontX, sy = BLEED * 300, sw = m.trimW * 300, sh = m.trimH * 300, s = Math.max(1600 / sw, 2560 / sh);
    x.drawImage(cv, sx + (sw - 1600 / s) / 2, sy + (sh - 2560 / s) / 2, 1600 / s, 2560 / s, 0, 0, 1600, 2560);
    p.ebookCover = await invoke<string>("save_b64", { name: `ebook-${p.id}-${Date.now()}.jpg`, b64: e.toDataURL("image/jpeg", 0.92) });
    saveProjects(); toast("Frente salva como capa do ebook (usada no EPUB)"); render();
  },
  "cast-open": (el) => { if (S.edit?.id === el.dataset.id) return; if (!leaveEdit()) return; S.castOpen = S.castOpen === el.dataset.id ? "" : el.dataset.id || ""; render(); },
  "world-open": (el) => { if (S.edit?.id === el.dataset.id) return; if (!leaveEdit()) return; S.worldOpen = S.worldOpen === el.dataset.id ? "" : el.dataset.id || ""; render(); },
  "world-add": (el) => { if (!leaveEdit()) return; const p = proj()!; const x: World = { id: uid(), kind: el.dataset.k || "Local", name: "", desc: "", details: "", links: "" }; worldOf(p).push(x); S.worldOpen = x.id; S.edit = { kind: "world", id: x.id, draft: { ...x }, dirty: false, isNew: true }; render(); setTimeout(() => $<HTMLInputElement>('[data-ed="name"]')?.focus(), 30); },
  "cover-gen": (el) => artDialog({ prov: el.dataset.v || "local" }),
  "art-edit": (el) => { const a = proj()?.arts?.[+el.dataset.i!]; if (a) artDialog({ prov: imgProv(), from: "edit", base: a.path, what: a.kind === "back" ? "back" : "front" }); },
  "ad-set": (el) => { const d = S.artDlg; if (!d) return; (d as any)[el.dataset.k!] = el.dataset.v; if (d.from === "edit" && d.what === "both") d.what = "front"; artDialog(); },
  "ad-check": async () => { if (S.artDlg) { S.artDlg.pf = await invoke<any>("img_local_preflight").catch(() => null); artDialog(); } },
  "ad-upload": async () => { const r = await open({ filters: [{ name: "Imagem", extensions: ["png", "jpg", "jpeg", "webp"] }] }); const p = proj(); if (!r || !p || !S.artDlg) return; keepArt(p, S.artDlg.what === "back" ? "back" : "front", r as string); saveProjects(); S.artDlg.base = r as string; artDialog(); },
  "ad-go": async () => {
    const p = proj(); const d: ArtDlg = S.artDlg; if (!p || !d) return;
    if (d.prov === "local") { const pf = await invoke<any>("img_local_preflight").catch(() => null); if (pf && (!pf.ok || pf.running)) { d.pf = pf; return artDialog(); } }
    document.getElementById("overlay")?.remove(); S.artDlg = null;
    const o: ArtOpts = { extra: d.extra, init: d.from === "edit" ? d.base : undefined, strength: AMOUNT[d.amount][0], chainBack: d.what === "both" };
    S.writing = "cover"; S.stopGen = false; render();
    try { await makeCover(p, d.prov, d.what === "back" ? "back" : "front", o); } finally { S.writing = ""; S.busy = ""; render(); }
  },
  "style-base": (el) => { if (S.edit?.kind !== "style") return; S.edit.draft.base = el.dataset.v; S.edit.dirty = true; render(); },
  "notes-all": () => { S.notesAll = !S.notesAll; render(); },
  "key-info": () => { S.keyInfo = !S.keyInfo; render(); },
  "cover-prompt-copy": () => { const p = proj(); if (p?.coverPrompt) { navigator.clipboard.writeText(p.coverPrompt); toast(L("Prompt copiado", "Prompt copied")); } },
  "cover-prompt": async () => {
    const p = proj()!; if (!engineReady()) { S.picker = true; render(); return; }
    S.writing = "cprompt"; render();
    const act = actStart("image", L("Escrevendo o prompt da capa", "Writing the cover prompt"), engName());
    try {
      const st = styleOf(p);
      const out = (await gen("Capa", QUICK.find((q) => q.id === "cover")!.prompt({ title: p.title, premise: p.premise.slice(0, 1500) + "\n" + castText(p).slice(0, 1000) }) + (st.coverStyle ? ` Art style: ${st.coverStyle}.` : ""), p.premise, 500, undefined, act)).trim();
      p.coverPrompt = out; saveProjects(); await navigator.clipboard.writeText(out); actEnd(act, L("copiado para a área de transferência", "copied to the clipboard")); toast(L("Prompt copiado — cole no ChatGPT ou Gemini", "Prompt copied — paste it into ChatGPT or Gemini"));
    } catch (e: any) { actEnd(act, String(e?.message || e), false); toast(String(e?.message || e), true); }
    S.writing = ""; S.busy = ""; render();
  },
  "map-book": (el) => { S.mapId = el.dataset.id!; S.mapSel = null; S.anChap = -1; document.querySelectorAll("details.menu[open]").forEach((d) => d.removeAttribute("open")); render(); },
  "map-all": (el) => { S.mapAll = el.dataset.v === "1"; render(); },
  "map-tab": (el) => { S.mapTab = el.dataset.t!; S.settings.mapTab = S.mapTab; save_("settings", S.settings); render(); },
  "map-layer": (el) => { const k = el.dataset.k!; S.mapHidden = S.mapHidden.includes(k) ? S.mapHidden.filter((x) => x !== k) : [...S.mapHidden, k]; el.classList.toggle("off"); mapCtl?.setHidden(new Set(S.mapHidden)); },
  "map-ai": async () => { if (!engineReady()) { S.picker = true; render(); return; } await buildLedger(S.mapId); },
  "map-open-ch": (el) => { const i = +el.dataset.i!; const p = S.projects.find((x) => x.id === S.mapId); if (p) { S.projId = p.id; S.chap = i; S.ptab = "write"; S.chview = "editor"; S.view = "estudio"; } else { S.openId = S.mapId; S.readTab = "texto"; S.view = "leitor"; } render(); },
  "an-contra": () => runContradictions(S.mapId),
  "hist-restore": async (el) => { const sum = await histSummary(el.dataset.ms!); if (!confirm(L(`Voltar os livros do Estúdio para esta versão?\n\n${sum}\n\nA versão atual também fica guardada no histórico.`, `Restore the Studio books to this version?\n\n${sum}\n\nThe current version is also kept in the history.`))) return; await invoke("history_restore", { key: "projects", ms: el.dataset.ms }); location.reload(); },
  "imgl-dl": async () => { S.imgLocal.dl = true; S.imgLocal.err = ""; render(); try { await invoke("img_local_download"); } catch (e: any) { S.imgLocal.dl = false; S.imgLocal.err = String(e?.message || e); render(); } },
  "imgl-how": () => { S.imgHow = !S.imgHow; render(); },
  "imgl-folder": () => invoke("reveal", { path: S.imgLocal.dir }),
  "cfg-tab": (el) => { S.cfgTab = el.dataset.t || ""; render(); },
  "style-tab": (el) => { S.styleTab = el.dataset.t || ""; render(); },
  "plist-toggle": () => { S.settings.plistMin = S.settings.plistMin === false; save_("settings", S.settings); render(); },
  "img-engine": () => { S.imgPicker = true; render(); },
  "img-picker-close": () => { S.imgPicker = false; render(); },
  "img-pick": (el) => { S.settings.img.provider = el.dataset.v; save_("settings", S.settings); render(); },
  "img-keys": () => { S.imgPicker = false; S.view = "config"; S.cfgTab = "ia"; render(); setTimeout(() => document.querySelector(".keysbox")?.setAttribute("open", ""), 30); setTimeout(() => document.querySelector(".keysbox")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); },
  "imgl-cancel": () => { S.stopGen = true; invoke("img_local_cancel"); S.imgLocal.dl = false; render(); },
  "dock-x": (el) => { dockSeen.add(el.dataset.id!); paintDock(); },
  "an-ch": (el) => { S.anChap = +el.dataset.i!; S.mapSel = null; render(); $(".mmain")?.scrollIntoView({ block: "start" }); },
  "an-goto": (el) => { S.mapTab = el.dataset.t!; S.anChap = +el.dataset.i!; if (el.dataset.g !== undefined) S.elGroup = el.dataset.g; S.settings.mapTab = S.mapTab; save_("settings", S.settings); render(); },
  "el-group": (el) => { S.elGroup = el.dataset.g || ""; render(); },
  "map-unsel": () => { mapCtl?.select(null); },
  "el-more": (el) => { (S.elAll ||= {})[el.dataset.g!] = !S.elAll[el.dataset.g!]; render(); },
  "el-world": (el) => { const p = S.projects.find((x) => x.id === (S.view === "estudio" ? S.projId : S.mapId)); if (!p) return; const n = addToWorld(p, [{ name: el.dataset.n!, group: el.dataset.g as ElGroup, chapters: storyEls(p.id).find((e) => elKey(e.name) === elKey(el.dataset.n!))?.chapters || [] }]); toast(n ? L("Adicionado ao Mundo do livro", "Added to the book's World") : L("Já está no Mundo", "Already in the World")); if (S.view === "mapa" && S.mapTab === "mapa") { const ins = $("#mapins"); if (ins && S.mapSel) ins.innerHTML = mapInspector(S.mapSel); } else render(); },
  "el-world-all": () => { const p = S.projects.find((x) => x.id === (S.view === "estudio" ? S.projId : S.mapId)); if (!p) return; const n = addToWorld(p, storyEls(p.id)); toast(L(`${n} elementos adicionados ao Mundo — complete-os com IA ou edite`, `${n} elements added to the World — complete them with AI or edit`)); render(); },
  "ledger-proj": async () => { if (!engineReady()) { S.picker = true; render(); return; } const p = proj(); if (p) { await buildLedger(p.id); render(); } },
  "an-endings": () => runEndings(S.mapId),
  "an-improve": () => runImprove(S.mapId, S.anChap),
  "an-fix": (el) => fixContradiction(S.mapId, +el.dataset.k!),
  "an-ignore": (el) => { const f = anOf(S.mapId).contradictions?.[+el.dataset.k!]; if (f) { f.status = f.status === "ignored" ? "open" : "ignored"; saveAn(); render(); } },
  "an-copy": (el) => { const f = anOf(S.mapId).improve?.[S.anChap]?.findings[+el.dataset.k!]; if (f?.suggestion) { navigator.clipboard.writeText(f.suggestion); toast(L("Sugestão copiada", "Suggestion copied")); } },
  "an-apply": (el) => { const p = S.projects.find((x) => x.id === S.mapId); const f = anOf(S.mapId).improve?.[S.anChap]?.findings[+el.dataset.k!]; const ch = p?.chapters[S.anChap]; if (!p || !f || !ch) return;
    if (replaceInChapter(ch, f.quote!, f.suggestion!)) { f.status = "fixed"; p.updated = Date.now(); saveProjects(); saveAn(); toast(L("Aplicado no capítulo", "Applied to the chapter")); render(); } else { navigator.clipboard.writeText(f.suggestion!); toast(L("Não achei o trecho exato (o texto mudou?) — a sugestão foi copiada", "Couldn't find the exact passage (did the text change?) — the suggestion was copied"), true); } },
  "an-word": (el) => { const p = S.projects.find((x) => x.id === S.mapId); const w = anOf(S.mapId).improve?.[S.anChap]?.words[+el.dataset.k!]; const ch = p?.chapters[S.anChap]; if (!p || !w || !ch) return;
    const re = new RegExp(`\\b${w[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"); const n = (ch.html.match(re) || []).length; if (!n) return toast(L("Palavra não encontrada no capítulo", "Word not found in the chapter"), true);
    if (!confirm(L(`Trocar “${w[0]}” por “${w[1]}” (${n}x) no capítulo ${S.anChap + 1}?`, `Replace “${w[0]}” with “${w[1]}” (${n}x) in chapter ${S.anChap + 1}?`))) return; ch.html = ch.html.replace(re, w[1]); p.updated = Date.now(); saveProjects(); toast(L("Trocado", "Replaced")); },
  "an-use-end": (el) => { const p = S.projects.find((x) => x.id === S.mapId); const e = anOf(S.mapId).endings?.[+el.dataset.k!]; if (!p || !e || !p.chapters.length) return; const last = p.chapters[p.chapters.length - 1];
    if (!confirm(L(`Usar “${e.title}” como plano do último capítulo? Depois é só reescrevê-lo com a IA no Estúdio.`, `Use “${e.title}” as the plan for the last chapter? Then rewrite it with AI in the Studio.`))) return;
    last.plan = `${e.summary}${e.changes ? ` (Earlier changes: ${e.changes})` : ""}`; last.done = false; saveProjects(); S.projId = p.id; S.chap = p.chapters.length - 1; S.ptab = "write"; S.chview = "editor"; S.view = "estudio"; render(); toast(L("Plano trocado — clique em Reescrever com IA", "Plan replaced — click Rewrite with AI")); },
  "lib-info": () => { S.libInfo = !S.libInfo; render(); },
  "text-edit": () => { const p = proj()!; const ch = p.chapters[S.chap]; if (!ch || !leaveEdit()) return; S.edit = { kind: "text", id: ch.id, draft: { html: ch.html }, dirty: false }; render(); setTimeout(() => { const ed = $("#ed"); ed?.focus(); }, 30); },
  "plan-all": () => { S.planAll = !S.planAll; render(); },
  "theme-set": (el) => { const k = el.dataset.k!, v = el.dataset.v!; S.settings[k] = v; if (k === "tBase") S.settings.tBg = BGS[v][0]; save_("settings", S.settings); applyTheme(); render(); },
  "chat-size": (el) => { S.settings.chatSize = el.dataset.v; save_("settings", S.settings); render(); },
  "sec-toggle": (el) => { const k = el.dataset.k!; if (S.edit?.kind === k) return; (S.secs ||= {})[k] = !secOpen(k); render(); },
  "ch-open": (el) => { if (S.edit?.id === el.dataset.id) return; if (!leaveEdit()) return; S.chOpen = S.chOpen === el.dataset.id ? "" : el.dataset.id; render(); },
  "edit-start": (el) => { if (!leaveEdit()) return; const p = proj()!; const k = el.dataset.kind as any;
    if (k === "idea") { S.edit = { kind: k, id: "idea", draft: { subtitle: p.subtitle, genre: p.genre, premise: p.premise }, dirty: false }; return render(); }
    if (k.startsWith("a-")) { S.edit = { kind: k, id: k, draft: { ...S.author }, dirty: false }; return render(); }
    if (k === "style") { S.edit = { kind: k, id: "style", draft: JSON.parse(JSON.stringify(styleOf(p))), dirty: false }; return render(); }
    if (k === "size") { S.edit = { kind: k, id: "size", draft: { pages: p.pages || 180 }, dirty: false }; return render(); }
    if (k === "arch") { S.edit = { kind: k, id: "arch", draft: { ...archDefaults(), ...(p.arch || {}) }, dirty: false }; return render(); }
    if (k === "chap") { const c = p.chapters.find((x) => x.id === el.dataset.id); if (c) { S.chOpen = c.id; S.edit = { kind: k, id: c.id, draft: { title: c.title, plan: c.plan || "" }, dirty: false }; } return render(); } const x = k === "cast" ? castOf(p).find((c) => c.id === el.dataset.id) : worldOf(p).find((w) => w.id === el.dataset.id); if (!x) return; S.edit = { kind: k, id: x.id, draft: { ...x }, dirty: false }; render(); },
  "edit-cancel": () => { if (S.edit) S.edit.dirty = false; leaveEdit(); render(); },
  "edit-save": () => {
    const e = S.edit, p = proj();
    if (e?.kind.startsWith("a-")) { Object.assign(S.author, e.draft); save_("author", S.author); S.edit = null; render(); toast(tr("Salvo")); return; }
    if (!e || !p) return;
    if (e.kind === "style") { p.style = { ...e.draft }; if (e.draft.genres && !p.genre) p.genre = e.draft.genres; }
    if (e.kind === "text" || e.kind === "style" || e.kind === "idea" || e.kind === "arch" || e.kind === "size" || e.kind === "chap") {
      if (e.kind === "idea") Object.assign(p, e.draft);
      if (e.kind === "arch") p.arch = { ...e.draft };
      if (e.kind === "size") { const n = Math.max(20, Math.min(600, +e.draft.pages || 180)); p.pages = n; p.nChapters = chaptersFor(n); }
      if (e.kind === "chap") { const c = p.chapters.find((x) => x.id === e.id); if (c) Object.assign(c, e.draft); }
      if (e.kind === "text") { const c = p.chapters.find((x) => x.id === e.id); if (c) c.html = e.draft.html; }
      p.updated = Date.now(); saveProjects(); S.edit = null; render(); toast(tr("Salvo")); return;
    }
    const x: any = e.kind === "cast" ? castOf(p).find((c) => c.id === e.id) : worldOf(p).find((w) => w.id === e.id); if (!x) { S.edit = null; return render(); }
    Object.assign(x, e.draft); if (e.kind === "cast") p.names = castOf(p).map((c) => c.name).filter(Boolean).join(", ");
    p.updated = Date.now(); saveProjects(); S.edit = null; render(); toast(tr("Salvo") + ": " + (x.name || "—"));
  },
  "world-del": (el) => { const p = proj()!; const x = worldOf(p).find((w) => w.id === el.dataset.id); if (!x || !confirm(`Remover “${x.name || "elemento"}”?`)) return; S.edit = null; p.world = worldOf(p).filter((w) => w !== x); S.worldOpen = ""; saveProjects(); render(); },
  "world-ai": async () => { const p = proj()!; if (!engineReady()) { S.picker = true; render(); return; } S.writing = "world"; render(); await aiWorld(p); S.writing = ""; S.busy = ""; render(); },
  "w-ch": (el) => { S.chap = +el.dataset.i!; S.ptab = "write"; S.chview = "editor"; render(); },
  "world-fill": async (el) => {
    const p = proj()!; const x = worldOf(p).find((w) => w.id === el.dataset.id); if (!x || !engineReady()) return;
    S.writing = "world"; render();
    const act = actStart("globe", L(`Completando ${x.name || "elemento"}`, `Completing ${x.name || "element"}`), "");
    try {
      const out = await gen("Mundo", `Novel "${p.title}". Premise: ${p.premise.slice(0, 1500)}\n${worldText(p).slice(0, 1500)}\nComplete this world element, keeping what is written: [${x.kind}] ${x.name}: ${x.desc} ${x.details}\nOutput ONLY one block.\n\n${WORLD_FORMAT}`, p.premise + " " + x.name, 600, undefined, act);
      const g = parseWorld(out)[0];
      if (g) { for (const k of ["desc", "details", "links"] as const) if (g[k] && !x[k]) x[k] = g[k]!; if (!x.name) x.name = g.name!; }
      saveProjects(); actEnd(act, g ? L("pronto", "done") : L("resposta fora do formato", "answer out of format"), !!g);
    } catch (e: any) { actEnd(act, String(e?.message || e), false); }
    S.writing = ""; S.busy = ""; render();
  },
  "usage-refresh": async () => { if (S.usage.pinging) return; S.usage.pinging = true; paintUsage(); try { await invoke("claude_ping"); } catch (e) { toast(String(e), true); } S.usage.pinging = false; render(); paintUsage(); },
  "stop-gen": () => { S.stopGen = true; cancelAI(); toast("Parando…"); },
  "ai-outline": async () => { const p = proj()!; if (!engineReady()) { S.picker = true; render(); return; } if (p.chapters.some((c) => strip(c.html).trim()) && !confirm("Refazer o roteiro? Os textos já escritos ficam nos capítulos de mesma posição.")) return; if (p.pages) p.nChapters = chaptersFor(p.pages); await buildBook(p, false, true); render(); },
  "chat-idea": (el) => { const t = $<HTMLTextAreaElement>("#ask"); if (t) { t.value = el.dataset.t || ""; t.focus(); } },
  "clear-chat": () => { const p = proj()!; if (confirm("Limpar a conversa?")) { p.chat = []; saveProjects(); render(); } },
  ins: (el) => { const p = proj()!; const ch = p.chapters[S.chap]; if (!ch) return toast("Escolha um capítulo", true); ch.html += marked.parse(p.chat[+el.dataset.i!].content) as string; saveProjects(); render(); toast("Inserido no capítulo"); },
  "apply-outline": (el) => { const p = proj()!; applyOutline(p.chat[+el.dataset.i!].content, p); },
  copy: (el) => { navigator.clipboard.writeText(proj()!.chat[+el.dataset.i!].content); toast("Copiado"); },
  "read-proj": (el) => { S.openId = el.dataset.id || S.projId; S.readTab = "texto"; S.view = "leitor"; render(); },
  "go-kdp": () => { S.view = "estudio"; S.ptab = "publish"; render(); },
  "mode-edit": () => { if (S.ptab !== "publish") return; S.ptab = "idea"; S.kdpEdit = null; render(); },
  "pub-toggle": () => { const p = proj(); if (!p) return; if (p.status !== "approved") { toast(L("Aprove o livro primeiro (etiqueta no topo) para liberar o modo Amazon", "Approve the book first (status tag at the top) to unlock Amazon mode"), true); const m = document.querySelector<HTMLDetailsElement>(".stmenu"); if (m) m.open = true; return; } if (S.ptab === "publish") return; S.ptab = "publish"; S.kdpEdit = null; render(); document.querySelector(".pedit")?.scrollTo?.({ top: 0 }); },
  // sugestões nunca gravam direto: abrem a edição com os campos preenchidos, e você salva se quiser
  "kdp-offline": () => { const p = proj()!; const r = kdpOffline(p.title, p.premise, S.profile, S.author.pen || S.author.name || "the author"); const e = kdpDraft(p); e.keywords = r.keywords; e.categories = r.categories; if (!e.description.trim()) e.description = r.description; S.kdpEdit = e; render(); toast(L("Sugestões colocadas na edição — revise e clique em Salvar", "Suggestions placed in the editor — review and click Save")); },
  "kdp-ai": async () => {
    const p = proj()!; if (!engineReady()) { S.picker = true; render(); return; }
    if (!(await confirmAI({ to: engName(), what: L("Sugerir descrição, palavras-chave e categorias?", "Suggest description, keywords and categories?"), effect: L("A IA escreve sugestões. Elas aparecem na edição para você revisar — nada é salvo sem você clicar em Salvar.", "The AI writes suggestions. They show up in the editor for you to review — nothing is saved until you click Save."), ok: L("Sugerir", "Suggest") }))) return;
    const out = await ask(QUICK.find((q) => q.id === "kdp")!.prompt(ctx(p)), p); if (!out) return;
    const tmp: any = { ...p, kdp: { ...p.kdp, keywords: [...p.kdp.keywords], categories: [...p.kdp.categories] } }; parseKdp(out, tmp);
    const e = kdpDraft(p); e.description = tmp.kdp.description; e.keywords = tmp.kdp.keywords; e.categories = tmp.kdp.categories; if (tmp.subtitle && !e.subtitle) e.subtitle = tmp.subtitle;
    S.kdpEdit = e; S.view = "estudio"; S.ptab = "publish"; render(); toast(L("Sugestões prontas — revise e clique em Salvar", "Suggestions ready — review and click Save"));
  },
  "kdp-edit": () => { S.kdpEdit = kdpDraft(proj()!); render(); },
  "kdp-cancel": () => { if (S.kdpEdit && !confirm(L("Descartar as alterações?", "Discard the changes?"))) return; S.kdpEdit = null; render(); },
  "kdp-save": async () => {
    const p = proj(); const e = S.kdpEdit as KdpDraft | null; if (!p || !e) return;
    if (!(await confirmAI({ icon: "book", toLabel: L("Livro", "Book"), to: e.title || p.title, what: L("Salvar as alterações?", "Save the changes?"), effect: L("Atualiza título, autor, preço, descrição, palavras-chave, categorias e formato do impresso. A versão anterior fica no histórico de versões.", "Updates title, author, price, description, keywords, categories and paperback format. The previous version stays in the version history."), ok: L("Salvar", "Save") }))) return;
    p.title = e.title; p.subtitle = e.subtitle; Object.assign(p.kdp, { series: e.series, lang: e.lang, price: e.price, description: e.description, keywords: e.keywords.map((x) => x.trim()), categories: e.categories.map((x) => x.trim()).filter(Boolean) });
    const d = wrapOf(p); const fmt = d.trim !== e.trim || d.paper !== e.paper || d.title !== e.title || d.author !== e.author; d.trim = e.trim; d.paper = e.paper; d.title = e.title; d.subtitle = e.subtitle; d.author = e.author;
    if (e.author !== (S.author.pen || S.author.name || "")) { S.author.pen = e.author; save_("author", S.author); }
    saveProjects(); S.kdpEdit = null; render(); toast(L("Dados salvos", "Details saved")); if (fmt) finishCover(p, false);
  },
  "kdp-interior": async () => { const p = proj()!; S.openId = p.id; const b = document.createElement("button"); b.dataset.v = "print"; await ACT["export-pdf"](b); },
  "kdp-site": () => invoke("open_url", { url: "https://kdp.amazon.com" }),
  "kdp-copy": () => { const p = proj()!; navigator.clipboard.writeText(`Title: ${p.title}\nSubtitle: ${p.subtitle}\nSeries: ${p.kdp.series}\nAuthor: ${S.author.pen || S.author.name}\nPrice: US$ ${p.kdp.price}\n\nDescription:\n${p.kdp.description}\n\nKeywords:\n${p.kdp.keywords.join("\n")}\n\nCategories:\n${p.kdp.categories.join("\n")}`); toast("Metadados copiados"); },
  "cover-file": async () => { const r = await open({ filters: [{ name: "Imagem", extensions: ["jpg", "jpeg", "png"] }] }); if (r) { const p = proj()!; keepAllArts(p); keepArt(p, "front", r as string); p.cover = r as string; saveProjects(); render(); finishCover(p); } },
  "kdp-pack": async () => {
    const p = proj(); if (!p) return;
    if (!p.chapters.some((c) => strip(c.html).trim())) return toast(L("O livro ainda não tem texto", "The book has no text yet"), true);
    const miss = [p.kdp.keywords.filter(Boolean).length < 7 && L("palavras-chave", "keywords"), !p.kdp.categories.filter(Boolean).length && L("categorias", "categories"), !p.kdp.description.trim() && L("descrição", "description"), !(p.cover || p.wrapArt) && L("capa", "cover")].filter(Boolean);
    if (miss.length && !confirm(L(`Ainda falta: ${miss.join(", ")}. Dá para preencher com os botões “Preencher” desta tela. Gerar o pacote mesmo assim?`, `Still missing: ${miss.join(", ")}. You can fill them with the “Fill” buttons on this screen. Make the package anyway?`))) return;
    const dir = await open({ directory: true, title: L("Escolha a pasta onde salvar os arquivos da KDP", "Choose the folder for the KDP files") }); if (!dir) return;
    const base = `${dir}/${(p.title || "book").replace(/[^\w\s-]/g, "").trim()}`;
    const a = actStart("rocket", L("Pacote para a KDP", "KDP package"), L("montando os arquivos…", "building the files…")); a.ai = L("sem IA (só exporta)", "no AI (export only)"); paintAct(a);
    const step = (t: string) => { a.detail = t; paintAct(a); return new Promise((r) => setTimeout(r, 30)); };
    try {
      await step(L("livro impresso: miolo em PDF…", "paperback: interior PDF…"));
      const pdf = printPdf(p); await invoke("write_b64", { path: `${base} - paperback interior.pdf`, b64: pdf.b64 });
      if (p.cover || p.wrapArt || p.wrapFinal) {
        await step(L("livro impresso: capa completa (300 dpi)…", "paperback: full cover (300 dpi)…"));
        const { cv, m } = await wrapCanvas(300, p);
        await invoke("write_pdf_image", { path: `${base} - paperback cover.pdf`, b64: cv.toDataURL("image/jpeg", 0.95), wIn: m.W, hIn: m.H, pxW: cv.width, pxH: cv.height });
        await step(L("ebook: capa…", "ebook: cover…"));
        await finishCover(p, false);
        if (p.ebookCover) await invoke("copy_file", { src: p.ebookCover, dest: `${base} - kindle cover.jpg` });
      }
      await step(L("ebook: EPUB…", "ebook: EPUB…"));
      await invoke("export_epub", { out: `${base} - kindle.epub`, book: { title: p.title, author: S.author.pen || S.author.name || "", lang: p.kdp.lang, description: p.kdp.description, publisher: S.author.pen || S.author.name, cover: p.ebookCover || p.cover || null, front: p.subtitle ? `<p style="text-align:center">${esc(p.subtitle)}</p>` : "", chapters: p.chapters.filter((c) => strip(c.html).trim()).map((c) => ({ title: c.title, html: cleanCh(c.html) })) } });
      await step(L("ficha com os dados para copiar…", "details sheet to copy from…"));
      await invoke("write_text_file", { path: `${base} - KDP details.txt`, text: kdpSheet(p, pdf.pages) });
      actEnd(a, L(`pronto: 5 arquivos · ${pdf.pages} páginas`, `ready: 5 files · ${pdf.pages} pages`)); toast(L("Pacote da KDP pronto", "KDP package ready")); invoke("reveal", { path: `${base} - KDP details.txt` }); render();
    } catch (e: any) { actEnd(a, String(e?.message || e), false); toast(String(e?.message || e), true); }
  },
  "kdp-cover": (el) => { S.projId = el.dataset.id || S.projId; S.ptab = "idea"; S.view = "estudio"; S.secs = { ...(S.secs || {}), cover: true }; render(); },
  "cover-ai": async () => {
    const p = proj()!;
    let prompt: string | null = prompt_(`Descreva a arte da capa (em inglês funciona melhor). Sem texto na imagem — título e autor entram depois.`, `Dark psychological horror book cover art for "${p.title}": ${p.premise}. Cinematic, moody lighting, high detail, empty space at top for title and bottom for author name, no text.`);
    if (!prompt) return;
    const lib = S.lib.filter((i) => i.kind === "capa" && i.bookId);
    const useRefs = lib.length > 0 && confirm(`Usar as ${lib.length} capas do acervo como referência de estilo (cores, tipo de arte, clima)?`);
    S.busy = "Gerando capa com IA…"; render();
    try {
      const refs = useRefs ? await Promise.all(lib.map(frontOf)) : [];
      if (useRefs) prompt += " Match the visual style, color palette, mood and illustration technique of the reference book covers by the same author, but create a completely new composition for this story. Do not copy their characters or text.";
      p.cover = await invoke<string>("image_generate", { provider: S.settings.img.provider, model: S.settings.img.model || "", prompt, portrait: true, refs }); saveProjects(); toast("Capa gerada"); finishCover(p); }
    catch (e: any) { toast(String(e), true); }
    S.busy = ""; render();
  },
  epub: async () => {
    const p = proj()!;
    if (!p.chapters.length) return toast("O livro não tem capítulos", true);
    const out = await save({ defaultPath: `${(p.title || "livro").replace(/[^\w\s-]/g, "")}.epub`, filters: [{ name: "EPUB", extensions: ["epub"] }] });
    if (!out) return;
    const clean = (h: string) => h.replace(/<p><em>\[(Plano|Inspira|Scene plan|Inspiration)[\s\S]*?<\/p>/g, "");
    try {
      await invoke("export_epub", { out, book: { title: p.title, author: S.author.pen || S.author.name || "", lang: p.kdp.lang, description: strip(p.kdp.description), publisher: S.author.pen || S.author.name, cover: p.ebookCover || p.cover || null, front: p.subtitle ? `<p style="text-align:center">${esc(p.subtitle)}</p>` : "", chapters: p.chapters.map((c) => ({ title: c.title, html: clean(c.html) })) } });
      toast("EPUB exportado — pronto para subir na KDP"); invoke("reveal", { path: out });
    } catch (e: any) { toast(String(e), true); }
  },
  key: async (el) => { const prov = el.dataset.p!; const v = $<HTMLInputElement>(`#key-${prov}`).value; await invoke("secret_set", { provider: prov, key: v }); S.keys = await invoke("secret_status"); toast(v ? "Chave salva" : "Chave removida"); render(); },
  models: async (el) => { const prov = el.dataset.p as "openai" | "gemini"; try { S.models[prov] = await invoke<string[]>("ai_models", { provider: prov }); toast(`Chave OK — ${S.models[prov].length} modelos`); render(); } catch (e: any) { toast(String(e), true); } },
  "reveal-data": async () => invoke("reveal", { path: await invoke<string>("data_dir") + "/data" }),
};
const prompt_ = (msg: string, def: string) => window.prompt(msg, def);

// ---------- eventos ----------
document.addEventListener("click", (e) => {
  document.querySelectorAll("details.menu[open]").forEach((d) => { if (!d.contains(e.target as Node)) d.removeAttribute("open"); });
  if ((e.target as HTMLElement).id === "overlay") { if (S.picker) { S.picker = false; render(); } else (e.target as HTMLElement).remove(); return; }
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act],[data-cmd]");
  if (!el) return;
  if (el.dataset.cmd) { e.preventDefault(); document.execCommand(el.dataset.cmd); return; }
  ACT[el.dataset.act!]?.(el);
});
document.addEventListener("mousedown", (e) => { if ((e.target as HTMLElement).closest("[data-cmd],[data-act=scene-break]")) e.preventDefault(); });
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.target as HTMLElement).matches?.("textarea.ttl")) { e.preventDefault(); (e.target as HTMLElement).blur(); return; } if (S.edit && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); (document.activeElement as HTMLElement)?.blur?.(); ACT["edit-save"](document.body); return; } if (S.edit && e.key === "Escape" && !document.querySelector(".overlay")) { ACT["edit-cancel"](document.body); return; } if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && (e.target as HTMLElement).id === "ask") ACT.send(e.target as HTMLElement); });
document.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  const d = el.dataset;
  if (d.anChap !== undefined) { S.anChap = +el.value; render(); return; }
  if (d.edl && S.edit) { const k = d.edl, all = (k === "books" ? authorBooks() : refWorks()).map((b) => b.id); const cur: string[] = S.edit.draft[k] || all; const next = el.checked ? [...new Set([...cur, el.value])] : cur.filter((x) => x !== el.value); S.edit.draft[k] = next.length === all.length ? null : next; S.edit.dirty = true; return; }
  if (d.ed && S.edit) { S.edit.draft[d.ed] = el.value; S.edit.dirty = true; if (el.tagName === "SELECT") render(); return; }
  if (d.thumbPos) { const c = S.lib.find((x) => x.id === d.thumbPos)!; c.thumbPos = +el.value; c.thumbFit = "front"; save_("library", S.lib); render(); return; }
  if (d.draftCheck) { S.settings.draft = { ...(S.settings.draft || {}), [d.draftCheck]: el.checked }; save_("settings", S.settings); return; }
  if (d.refUse) { const i: any = S.lib.find((x) => x.id === d.refUse); i.use = el.checked; save_("library", S.lib); return; }
  if (d.arch) { const p = proj(); if (p) { p.arch = { ...archDefaults(), ...(p.arch || {}), [d.arch]: el.value }; saveProjects(); } return; }
  if (d.effort !== undefined) { S.settings.models.claudeEffort = el.value; save_("settings", S.settings); render(); toast(tr("Esforço do Claude") + ": " + tr(EFFORTS.find((x) => x[0] === el.value)![1])); return; }
  if (d.cast === "mbti") { const p = proj(); const x = p && castOf(p).find((c) => c.id === d.id); if (x) { x.mbti = el.value; saveProjects(); render(); } return; }
  if (d.setMode !== undefined) { S.settings.mode = el.value; save_("settings", S.settings); render(); if (el.value === "local" && !localReady()) { S.picker = true; refreshLocal().then(render); } return; }
  if (d.themeColor) { S.settings[d.themeColor] = el.value; save_("settings", S.settings); applyTheme(); return; }
  if (d.set) { S.settings[d.set] = el.value; if (d.set === "lang") setLang(el.value || undefined); save_("settings", S.settings); render(); }
  else if (d.actChange === "open") { S.openId = el.value; render(); }
  else if (d.actChange === "kdp-proj") { S.projId = el.value; S.kdpEdit = null; render(); }
  else if (d.linkCover) { const c = S.lib.find((x) => x.id === d.linkCover)!; if (el.value) { for (const o of S.lib.filter((x) => x.kind === "capa" && x.bookId === el.value)) o.bookId = undefined; c.bookId = el.value; c.title = S.lib.find((b) => b.id === el.value)!.title; linkCovers(); save_("library", S.lib); render(); } }
  else if (d.editItem) { const i = S.lib.find((x) => x.id === d.editItem) as any; i[d.f!] = el.value; linkCovers(); save_("library", S.lib); render(); }
  else if (d.model) { S.settings.models[d.model] = el.value; save_("settings", S.settings); }
  else if (d.img) { S.settings.img[d.img] = el.value; save_("settings", S.settings); render(); }
});
document.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  const d = el.dataset; const p = proj();
  if (d.ed && S.edit) { S.edit.draft[d.ed] = el.value; S.edit.dirty = true; if (d.ed === "bio") { const w = $("#biowc"); if (w) w.textContent = String((el.value.match(/\S+/g) || []).length); } return; }
  if (d.thumbPos) { const c = S.lib.find((x) => x.id === d.thumbPos)!; c.thumbPos = +el.value; c.thumbFit = "front"; $("#tprev")?.setAttribute("style", thumbStyle(c)); return; }
  if (d.world && p) { const x = worldOf(p).find((w) => w.id === d.id); if (x) { (x as any)[d.world] = el.value; saveProjects(); } return; }
  if (d.wrap && p) { const w: any = wrapOf(p); w[d.wrap] = ["pages", "titleSize", "darkBack"].includes(d.wrap) ? +el.value : el.value; saveProjects(); clearTimeout((S as any)._wr); (S as any)._wr = setTimeout(wrapRedraw, 60); clearTimeout((S as any)._wf); (S as any)._wf = setTimeout(() => finishCover(p, false), 2500); return; }
  if (d.draft === "pages") { const n = +el.value || 0; const wl = $("#wlimit"); if (wl && n >= 20) wl.textContent = tr(engineLimits(S.settings.mode, n)); const w = $("#wsize"); if (w && n >= 20) w.textContent = tr(`≈ ${(n * wpp()).toLocaleString(locale())} palavras · ${chaptersFor(n)} capítulos de ~${Math.round((n * wpp()) / chaptersFor(n)).toLocaleString(locale())} palavras (padrão dos livros do autor: ${wpp()} palavras por página)`); }
  if (d.draft) { S.settings.draft = { ...(S.settings.draft || {}), [d.draft]: el.value }; clearTimeout(saveT); saveT = setTimeout(() => save_("settings", S.settings), 400); return; }
  if (d.author) { S.author[d.author] = el.value; clearTimeout(saveT); saveT = setTimeout(() => save_("author", S.author), 400); }
  else if (d.proj && p) { (p as any)[d.proj] = d.proj === "nChapters" || d.proj === "pages" ? +el.value || undefined : el.value; if (d.proj === "pages" && p.pages && p.pages >= 20) p.nChapters = chaptersFor(p.pages); saveProjects(); const si = $("#sizeinfo"); if (si) si.textContent = tr(sizeInfo(p)); const b = document.querySelector(`.pitem.on b`); if (b && d.proj === "title") b.textContent = el.value || "Sem título"; }
  else if (d.cast && p) { const x = castOf(p).find((c) => c.id === d.id); if (x) { (x as any)[d.cast] = el.value; if (d.cast === "name") p.names = castOf(p).map((c) => c.name).filter(Boolean).join(", "); saveProjects(); } }
  else if (d.chapI !== undefined && p) { (p.chapters[+d.chapI] as any)[d.f!] = el.value; saveProjects(); }
  else if (d.chap && p) { (p.chapters[S.chap] as any)[d.chap] = el.value; saveProjects(); }
  else if (d.kd && S.kdpEdit) { const e = S.kdpEdit; if (d.kd.startsWith("kw")) e.keywords[+d.kd.slice(2)] = el.value; else if (d.kd === "categories") e.categories = el.value.split("\n"); else e[d.kd] = el.value; }
  else if (d.kdp && p) { (p.kdp as any)[d.kdp] = d.kdp === "categories" ? el.value.split("\n") : el.value; saveProjects(); }
  else if (d.kw && p) { p.kdp.keywords[+d.kw] = el.value; saveProjects(); }
});

// ---------- início ----------
(async () => {
  const [lib, author, profile, projects, settings, bible] = await Promise.all(["library", "author", "profile", "projects", "settings", "bible"].map((k) => invoke<any>("store_get", { key: k })));
  S.bible = bible;
  S.analysis = (await invoke<any>("store_get", { key: "analysis" })) || {};
  S.lib = lib || []; linkCovers(); S.author = author || {}; S.profile = profile; S.projects = projects || [];
  const seed = await invoke<any>("store_get", { key: "worldseed" }).catch(() => null);
  if (seed && typeof seed === "object" && S.projects.length) { let merged = 0; for (const [pid, list] of Object.entries<any[]>(seed)) { const p = S.projects.find((x) => x.id === pid); if (!p) continue; merged++; for (const g of list) { const x = worldOf(p).find((w) => elKey(w.name) === elKey(g.name)); if (x) { for (const k of ["desc", "details", "links"] as const) if (g[k] && !x[k]) x[k] = g[k]; } else worldOf(p).push({ id: uid(), kind: g.kind, name: g.name, desc: g.desc || "", details: g.details || "", links: g.links || "" }); } } if (merged) { save_("projects", S.projects); save_("worldseed", null); } }
  for (const x of S.projects) if (!x.pages) { x.pages = 180; x.nChapters = chaptersFor(180); }
  S.settings = { ...S.settings, ...(settings || {}) };
  setLang(S.settings.lang); applyTheme();
  S.projId = S.projects.some((x) => x.id === S.settings.lastProj) ? S.settings.lastProj : "";
  for (const x of S.projects) { keepAllArts(x); fillKdpBlurb(x); }
  setTimeout(() => { for (const x of liveProjs()) if ((x.cover || x.wrapArt) && (!x.coverFull || (x.coverV || 0) < 2)) { x.coverV = 2; finishCover(x); } }, 1500);
  if (S.projId) S.ptab = projWords(proj()!) ? "write" : "idea";
  render();
  S.settings.models = { claude: "", openai: "", gemini: "", local: "", ...(S.settings.models || {}) };
  if (!S.lib.length) S.view = "acervo"; else if (S.settings.lastView && VIEWS[S.settings.lastView]) S.view = S.settings.lastView; if (S.settings.mapTab) S.mapTab = S.settings.mapTab; if (S.settings.ptab && S.settings.ptab !== "read") S.ptab = S.settings.ptab; else if (!S.projects.length) S.view = "estudio";
  render();
  for (const it of S.lib.filter((i) => !i.thumb && !i.preview && i.kind !== "capa")) { it.preview = (await textOf(it.id)).slice(0, 600); }
  if (S.view === "acervo") render();
  S.claude = await invoke("claude_status"); S.keys = await invoke("secret_status"); await refreshLocal(); render();
  if (S.lib.some((i) => i.kind === "livro") && (!S.profile || !S.bible)) runAnalysis(true);
  listen<any>("claude-usage", (e) => {
    const x = e.payload, u = S.usage;
    if (x.limits) { u.limits = x.limits; u.lastAt = Date.now(); }
    if (x.model) u.model = x.model;
    if (x.usage) { u.calls++; u.inTok += (x.usage.input_tokens || 0) + (x.usage.cache_creation_input_tokens || 0) + (x.usage.cache_read_input_tokens || 0); u.outTok += x.usage.output_tokens || 0; }
    paintUsage();
  });
  setInterval(() => { if (S.settings.mode === "claude" && S.claude?.ok && !S.usage.pinging && Date.now() - S.usage.lastAt > 5 * 60000 && document.visibilityState === "visible") ACT["usage-refresh"](document.body); else paintUsage(); }, 60000);
  if (S.settings.mode === "claude") setTimeout(() => ACT["usage-refresh"](document.body), 4000);
  imgLocalStatus().then(() => render());
  listen<any>("imglocal-dl", (e) => { const d = e.payload; if (d.finished !== undefined) { S.imgLocal.dl = false; S.imgLocal.err = d.error || ""; imgLocalStatus().then(render); if (d.finished) toast(L("Gerador de capas local instalado", "Local cover generator installed")); return; } S.imgLocal.dl = true; S.imgLocal.got = d.done; S.imgLocal.total = d.total; S.imgLocal.file = d.file; const pc = Math.round((d.done / d.total) * 100);
    document.querySelectorAll<HTMLElement>(".imgprog i").forEach((b) => (b.style.width = pc + "%"));
    document.querySelectorAll<HTMLElement>(".imgpct").forEach((t) => (t.textContent = `${gb(d.done)} / ${gb(d.total)} · ${pc}% · ${d.file}`));
    document.querySelectorAll<HTMLElement>(".imgpct-txt").forEach((t) => (t.textContent = "● " + L(`Baixando ${pc}%`, `Downloading ${pc}%`)));
    if (!document.querySelector(".imgprog") && (S.view === "config" || S.view === "estudio")) render(); });
  listen<any>("imglocal-gen", (e) => { const a = (S as any).imgAct as Act | null; if (!a) return; const d = e.payload; a.detail = d.step ? L(`desenhando: passo ${d.step} de ${d.total}`, `drawing: step ${d.step} of ${d.total}`) : d.phase === "load" ? L("carregando o modelo…", "loading the model…") : d.phase === "text" ? L("lendo a descrição…", "reading the description…") : d.phase === "decode" ? L("finalizando a imagem…", "finishing the image…") : a.detail; paintAct(a); });
  listen<any>("model-progress", async (e) => {
    const x = e.payload;
    if (x.finished !== undefined) { delete S.dl[x.id]; if (x.error && x.error !== "cancelado") toast(`Download: ${x.error}`, true); if (x.finished) { toast("Modelo pronto para usar!"); S.settings.models.local = x.id; S.settings.mode = "local"; save_("settings", S.settings); } await refreshLocal(); render(); return; }
    S.dl[x.id] = { done: x.done, total: x.total };
    const now = Date.now(); if (S.picker && now - ((S as any)._lastDl || 0) > 500) { (S as any)._lastDl = now; render(); }
  });
  getCurrentWebview().onDragDropEvent((ev) => { if (ev.payload.type === "drop" && ev.payload.paths.length) { S.view = "acervo"; importPaths(ev.payload.paths); } });
})();
