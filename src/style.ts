import { isEn } from "./i18n";
// "Cérebro" sem IA: mede o jeito de escrever do autor e gera esboços/rascunhos a partir do próprio acervo.

const STOP = new Set(`a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves said says one back like know get got going go went come came see saw look looked us oh yes yeah okay ok don't didn't i'm it's that's can't won't i'll you're he's she's there's what's let's wasn't couldn't wouldn't isn't aren't i've i'd you'll we're they're also even still well much many way something nothing anything everything someone anyone thing things time just really right never ever always away around o a os as um uma de do da dos das em no na nos nas por para com sem que e é se não mais mas como foi ele ela eles elas eu você meu minha seu sua isso isto esse essa este esta ao à já há ser ter está estava era`.split(/\s+/));

const THEMES: Record<string, string[]> = {
  "medo/terror": ["fear", "afraid", "terror", "scream", "screamed", "horror", "dark", "darkness", "shadow", "shadows", "nightmare", "trembling", "panic", "medo", "terror", "grito", "escuro"],
  "morte/violência": ["death", "dead", "die", "died", "kill", "killed", "blood", "body", "corpse", "knife", "murder", "grave", "morte", "morto", "sangue", "matar"],
  "amor/romance": ["love", "loved", "kiss", "kissed", "heart", "beautiful", "romance", "lips", "embrace", "amor", "beijo", "coração"],
  "obsessão/ciúme": ["obsession", "obsessed", "jealous", "jealousy", "possess", "mine", "envy", "desire", "obsessão", "ciúme"],
  "sobrenatural": ["spell", "spells", "magic", "curse", "cursed", "witch", "ghost", "spirit", "ritual", "demon", "soul", "feitiço", "maldição", "espírito"],
  "amizade/família": ["friend", "friends", "friendship", "mother", "father", "family", "sister", "brother", "amigo", "família", "mãe", "pai"],
  "traição/segredo": ["betray", "betrayal", "lie", "lied", "lies", "secret", "secrets", "truth", "trust", "traição", "mentira", "segredo"],
  "luto/tristeza": ["grief", "tears", "cried", "cry", "sad", "pain", "loss", "mourn", "lágrimas", "dor", "luto"],
};
const DIALOGUE_TAGS = ["said", "asked", "replied", "whispered", "shouted", "yelled", "screamed", "muttered", "laughed", "cried", "snapped", "added", "continued", "answered", "murmured", "exclaimed", "disse", "perguntou", "respondeu", "sussurrou", "gritou"];

export interface Profile {
  books: number; words: number; sentences: number; paragraphs: number;
  avgSentence: number; shortPct: number; longPct: number; avgParagraph: number;
  dialoguePct: number; firstPersonPct: number; pastPct: number; richness: number;
  punct: Record<string, number>; topWords: [string, number][]; phrases: [string, number][];
  names: [string, number][]; tags: [string, number][]; themes: [string, number][];
  chapters: number; avgChapterWords: number; openings: string[]; samples: { dialogue: string; narrative: string; opening: string };
  lang: "en" | "pt"; perBook: { title: string; words: number; avgSentence: number; dialoguePct: number }[];
  updated: number;
}

const tokenize = (t: string) => t.toLowerCase().match(/[a-zà-ÿ’']+/g) || [];
const sentencesOf = (t: string) => t.replace(/\s+/g, " ").match(/[^.!?…]+[.!?…]+["”’]?/g) || [];
const isDialogue = (p: string) => /^[“"'‘—–-]/.test(p.trim()) || /[“”]/.test(p) || (p.match(/"/g) || []).length >= 2;
const CH_RE = /^(Chapter|CHAPTER|Cap[ií]tulo|CAP[IÍ]TULO|Prologue|PROLOGUE|Epilogue|EPILOGUE|Pr[oó]logo|Ep[ií]logo)(\s+[\w\dÀ-ÿ]+)?(\s*[:.\-–—]\s*[^.!?]{0,50})?$|^(\d{1,3}|[IVXLC]{1,6})\.?$/;

function top<T extends string>(m: Map<T, number>, n: number): [T, number][] {
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export function splitChapters(text: string): { title: string; text: string }[] {
  const paras = text.split(/\n{2,}/);
  const out: { title: string; text: string }[] = [];
  let cur = { title: "Opening", text: "" };
  for (const p of paras) {
    if (CH_RE.test(p.trim()) && p.length < 50) {
      if (cur.text.trim().split(/\s+/).length > 300) out.push(cur);
      cur = { title: p.trim(), text: "" };
    } else cur.text += p + "\n\n";
  }
  if (cur.text.trim()) out.push(cur);
  return out;
}

export function analyze(books: { title: string; text: string }[], exclude: string[] = []): Profile {
  const all = books.map((b) => b.text).join("\n\n");
  const ex = new Set([...exclude, ...books.map((b) => b.title)].join(" ").toLowerCase().split(/\s+/));
  const paras = all.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 1);
  const sents = sentencesOf(all);
  const words = tokenize(all);
  const sLens = sents.map((s) => tokenize(s).length).filter((n) => n > 0);
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const wf = new Map<string, number>();
  for (const w of words) if (!STOP.has(w) && !ex.has(w) && w.length > 2) wf.set(w, (wf.get(w) || 0) + 1);
  const tri = new Map<string, number>();
  for (let i = 0; i + 2 < words.length; i++) {
    const g = words.slice(i, i + 3);
    if (g.filter((w) => STOP.has(w)).length <= 1 && g.every((w) => w.length > 1 && !ex.has(w))) { const k = g.join(" "); tri.set(k, (tri.get(k) || 0) + 1); }
  }
  // nomes: palavras com inicial maiúscula que não começam frase
  const nm = new Map<string, number>();
  for (const s of sents) {
    const toks = s.trim().split(/\s+/).slice(1);
    for (const t of toks) {
      const w = t.replace(/[^A-Za-zÀ-ÿ'’-]/g, "").replace(/['’]s$/, "");
      if (/^[A-Z][a-zà-ÿ]{2,}$/.test(w) && !STOP.has(w.toLowerCase()) && !ex.has(w.toLowerCase())) nm.set(w, (nm.get(w) || 0) + 1);
    }
  }
  const lowerSeen = new Set(all.match(/(?<![.!?”"]\s)\b[a-z][a-z]+\b/g) || []);
  const names = top(new Map([...nm].filter(([w, n]) => n >= 8 && !lowerSeen.has(w.toLowerCase()))), 30);
  const tg = new Map<string, number>();
  for (let i = 0; i < words.length; i++) if (DIALOGUE_TAGS.includes(words[i])) tg.set(words[i], (tg.get(words[i]) || 0) + 1);
  const th = new Map<string, number>();
  const per = words.length / 10000 || 1;
  for (const [k, list] of Object.entries(THEMES)) th.set(k, Math.round(list.reduce((n, w) => n + (wf.get(w) || 0), 0) / per));
  const first = words.filter((w) => ["i", "me", "my", "eu", "meu", "minha"].includes(w)).length;
  const third = words.filter((w) => ["he", "she", "his", "her", "him", "ele", "ela", "dele", "dela"].includes(w)).length;
  const past = words.filter((w) => ["was", "were", "had", "did", "foi", "era", "estava", "tinha"].includes(w) || /ed$/.test(w)).length;
  const pres = words.filter((w) => ["is", "are", "has", "does", "am", "é", "está", "tem"].includes(w)).length;
  const sample = words.slice(0, 50000);
  const k = 1000 / (words.length || 1);
  const count = (re: RegExp) => +((all.match(re) || []).length * k).toFixed(1);
  const chapters = books.flatMap((b) => splitChapters(b.text));
  const dlg = paras.filter(isDialogue);
  const narr = paras.filter((p) => !isDialogue(p) && p.length > 400 && p.length < 1400);
  const dlgBlock = (() => {
    for (let i = 0; i < paras.length - 6; i++) if (paras.slice(i, i + 6).filter(isDialogue).length >= 5) return paras.slice(i, i + 7).join("\n\n");
    return dlg.slice(0, 6).join("\n\n");
  })();
  const openings = chapters.filter((c) => c.title !== "Opening").map((c) => sentencesOf(c.text)[0]?.trim()).filter((s): s is string => !!s && s.length > 15).slice(0, 12);
  const ptHits = words.filter((w) => ["que", "não", "uma", "com", "para"].includes(w)).length;
  return {
    books: books.length, words: words.length, sentences: sents.length, paragraphs: paras.length,
    avgSentence: +avg(sLens).toFixed(1),
    shortPct: Math.round((sLens.filter((n) => n < 8).length / (sLens.length || 1)) * 100),
    longPct: Math.round((sLens.filter((n) => n > 25).length / (sLens.length || 1)) * 100),
    avgParagraph: +avg(paras.map((p) => tokenize(p).length)).toFixed(1),
    dialoguePct: Math.round((dlg.length / (paras.length || 1)) * 100),
    firstPersonPct: Math.round((first / (first + third || 1)) * 100),
    pastPct: Math.round((past / (past + pres || 1)) * 100),
    richness: +((new Set(sample).size / (sample.length || 1)) * 100).toFixed(1),
    punct: { "!": count(/!/g), "?": count(/\?/g), "…": count(/…|\.\.\./g), "—": count(/—|–/g), ";": count(/;/g), "aspas": count(/[“"]/g) },
    topWords: top(new Map([...wf].filter(([w]) => !names.some((n) => n[0].toLowerCase() === w) && !/[’']/.test(w))), 40), phrases: top(new Map([...tri].filter(([, n]) => n >= 3)), 25), names, tags: top(tg, 10),
    themes: top(th, 8), chapters: chapters.length, avgChapterWords: Math.round(words.length / (chapters.length || 1)),
    openings, samples: { dialogue: dlgBlock.slice(0, 2200), narrative: (narr[Math.floor(narr.length / 3)] || "").slice(0, 1500), opening: (chapters[1]?.text || "").slice(0, 1500) },
    lang: ptHits > words.length * 0.02 ? "pt" : "en",
    perBook: books.map((b) => { const s = sentencesOf(b.text).map((x) => tokenize(x).length); const p = b.text.split(/\n{2,}/); return { title: b.title, words: tokenize(b.text).length, avgSentence: +avg(s).toFixed(1), dialoguePct: Math.round((p.filter(isDialogue).length / (p.length || 1)) * 100) }; }),
    updated: Date.now(),
  };
}

/** Resumo do estilo em texto (vai para o prompt da IA e para a tela). */
export function describe(p: Profile, en = true): string {
  if (en) {
    const voice = p.firstPersonPct > 55 ? "first person" : p.firstPersonPct < 30 ? "third person (close to the characters' thoughts)" : "a mix of first and third person";
    const rhythm = p.avgSentence < 12 ? "short, fast sentences" : p.avgSentence < 18 ? "medium-length, direct sentences" : "long, elaborate sentences";
    const TH: Record<string, string> = { "medo/terror": "fear/terror", "morte/violência": "death/violence", "amor/romance": "love/romance", "obsessão/ciúme": "obsession/jealousy", "sobrenatural": "supernatural", "amizade/família": "friendship/family", "traição/segredo": "betrayal/secrets", "luto/tristeza": "grief" };
    return [
      `Narration in ${voice}, ${p.pastPct > 60 ? "past tense" : "present tense"}.`,
      `Rhythm: ${rhythm} (average ${p.avgSentence} words; ${p.shortPct}% short, ${p.longPct}% long). Paragraphs of ~${p.avgParagraph} words.`,
      `Dialogue in ${p.dialoguePct}% of paragraphs${p.tags.length ? `; favourite dialogue tags: ${p.tags.slice(0, 5).map((t) => t[0]).join(", ")}` : ""}.`,
      `Punctuation per 1,000 words: ${Object.entries(p.punct).map(([k, v]) => `${k === "aspas" ? "quotes" : k} ${v}`).join(", ")}.`,
      `Strongest themes: ${p.themes.filter((t) => t[1] > 0).slice(0, 5).map((t) => TH[t[0]] || t[0]).join(", ")}.`,
      `Chapters of ~${p.avgChapterWords} words (${p.chapters} chapters in the library).`,
      `Recurring vocabulary: ${p.topWords.slice(0, 20).map((w) => w[0]).join(", ")}.`,
    ].join("\n");
  }
  const voice = p.firstPersonPct > 55 ? "primeira pessoa" : p.firstPersonPct < 30 ? "terceira pessoa (próxima dos pensamentos dos personagens)" : "mistura de primeira e terceira pessoa";
  const rhythm = p.avgSentence < 12 ? "frases curtas e rápidas" : p.avgSentence < 18 ? "frases de tamanho médio, diretas" : "frases longas e elaboradas";
  return [
    `Narração em ${voice}, ${p.pastPct > 60 ? "no passado" : "no presente"}.`,
    `Ritmo: ${rhythm} (média ${p.avgSentence} palavras; ${p.shortPct}% curtas, ${p.longPct}% longas). Parágrafos de ~${p.avgParagraph} palavras.`,
    `Diálogo em ${p.dialoguePct}% dos parágrafos${p.tags.length ? `; verbos de fala preferidos: ${p.tags.slice(0, 5).map((t) => t[0]).join(", ")}` : ""}.`,
    `Pontuação por mil palavras: ${Object.entries(p.punct).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    `Temas mais fortes: ${p.themes.filter((t) => t[1] > 0).slice(0, 5).map((t) => t[0]).join(", ")}.`,
    `Capítulos de ~${p.avgChapterWords} palavras (${p.chapters} capítulos no acervo).`,
    `Vocabulário recorrente: ${p.topWords.slice(0, 20).map((w) => w[0]).join(", ")}.`,
  ].join("\n");
}

// ---------- gerador sem IA ----------

function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296); }

/** Cadeia de Markov (bigrama de palavras → próxima) treinada no acervo. */
export function markov(text: string, seedWords: string[], length = 220, seed = Date.now()): string {
  const toks = text.replace(/\s+/g, " ").split(" ").filter(Boolean).slice(0, 400000);
  const m = new Map<string, string[]>();
  for (let i = 0; i + 2 < toks.length; i++) {
    const k = toks[i] + " " + toks[i + 1];
    const a = m.get(k); if (a) a.push(toks[i + 2]); else m.set(k, [toks[i + 2]]);
  }
  const r = rng(seed);
  const keys = [...m.keys()];
  const starts = keys.filter((k) => /^[A-Z“"]/.test(k) && seedWords.some((s) => k.toLowerCase().includes(s.toLowerCase())));
  const pool = starts.length ? starts : keys.filter((k) => /^[A-Z“"]/.test(k));
  let key = pool[Math.floor(r() * pool.length)] || keys[0];
  const out = key.split(" ");
  for (let i = 0; i < length; i++) {
    const next = m.get(key);
    if (!next) { key = pool[Math.floor(r() * pool.length)]; out.push(...key.split(" ")); continue; }
    const w = next[Math.floor(r() * next.length)];
    out.push(w); key = out[out.length - 2] + " " + w;
    if (i > length * 0.8 && /[.!?]["”]?$/.test(w)) break;
  }
  return out.join(" ").replace(/\s([.,!?;:])/g, "$1");
}

const BEATS_EN = [
  ["Ordinary world", "Introduce {A} and their circle ({B}, {C}) in everyday situations: friendships, flirting, ambitions. Plant a barely noticeable strange detail."],
  ["Bonds", "Deepen relationships: lively dialogue, teasing, a romance growing between {A} and {B}. Show what each one has to lose."],
  ["The crack", "The first unsettling event tied to {premissa}. {A} tries to explain it rationally."],
  ["Jealousy and desire", "Hidden tensions surface; {C} reveals envy or obsession in thoughts they would never say aloud."],
  ["Point of no return", "A choice by {A} makes everything worse. The threat becomes personal."],
  ["First loss", "A beloved character suffers the consequences — without warning. The group fractures."],
  ["Investigation", "{A} and {B} look for the truth; they uncover a secret from the past tied to {premissa}."],
  ["Betrayal", "Someone they trust lies or betrays them. A dramatic, emotional argument."],
  ["Descent", "Paranoia, guilt and fear; short, tense scenes with shorter sentences."],
  ["Confrontation", "The antagonist is fully revealed. Violence and impossible choices."],
  ["The price", "Victory or defeat at a high cost; whoever survives is changed forever."],
  ["Final echo", "Close on a disturbing image or a hook that leaves doubt."],
];
const BEATS = [
  ["Mundo normal", "Apresente {A} e seu círculo ({B}, {C}) em situações do dia a dia: amizades, flertes, ambições. Plante um detalhe estranho quase imperceptível."],
  ["Laços", "Aprofunde relações: diálogo vivo, provocações, um romance nascendo entre {A} e {B}. Mostre o que cada um tem a perder."],
  ["A rachadura", "O primeiro acontecimento inquietante ligado a {premissa}. {A} tenta explicar racionalmente."],
  ["Ciúme e desejo", "Tensões escondidas vêm à tona; {C} revela inveja ou obsessão em pensamentos que nunca diria em voz alta."],
  ["Ponto sem volta", "Uma escolha de {A} piora tudo. A ameaça fica pessoal."],
  ["Primeira perda", "Um personagem querido sofre as consequências — sem aviso. O grupo se fragmenta."],
  ["Investigação", "{A} e {B} buscam a verdade; descobrem um segredo do passado ligado a {premissa}."],
  ["Traição", "Alguém de confiança mente ou trai. Discussão dramática e emocional."],
  ["Descida", "Paranoia, culpa e medo; cenas curtas e tensas, frases mais curtas."],
  ["Confronto", "O antagonista se revela por completo. Violência e escolhas impossíveis."],
  ["Preço", "Vitória ou derrota com custo alto; quem sobrevive muda para sempre."],
  ["Eco final", "Encerramento com uma imagem perturbadora ou um gancho que deixa dúvida."],
];

export function outline(o: { premise: string; chapters: number; names: string[]; profile?: Profile | null }) {
  const n = Math.max(3, Math.min(60, o.chapters || 12));
  const nm = o.names.length >= 3 ? o.names : [...o.names, ...(o.profile?.names.map((x) => x[0]) || []), "Maya", "Ravi", "Leah"];
  const target = o.profile?.avgChapterWords || 2500;
  return Array.from({ length: n }, (_, i) => {
    const B = BEATS_EN; void BEATS; // conteúdo sempre em inglês
    const b = B[Math.min(B.length - 1, Math.floor((i / n) * B.length))];
    const txt = b[1].replace(/\{A\}/g, nm[0]).replace(/\{B\}/g, nm[1]).replace(/\{C\}/g, nm[2]).replace(/\{premissa\}/g, o.premise || "the central mystery");
    return { title: `Chapter ${i + 1}`, beat: b[0], summary: txt, target };
  });
}

/** Esqueleto de cena com as metas de estilo do autor + trecho de inspiração do próprio acervo. */
export function sceneScaffold(p: Profile | null, corpus: string, summary: string, names: string[]) {
  const opening = p?.openings.length ? p.openings[Math.floor(Math.random() * p.openings.length)] : "";
  const insp = corpus ? markov(corpus, names.concat(summary.split(/\s+/).filter((w) => w.length > 5)).slice(0, 12), 160) : "";
  {
    const g = p ? `Style targets: ~${p.avgSentence} words per sentence, dialogue in ~${p.dialoguePct}% of paragraphs, chapter of ~${p.avgChapterWords} words. Use: ${p.topWords.slice(0, 8).map((w) => w[0]).join(", ")}.` : "";
    return `<p><em>[Scene plan] ${summary}</em></p><p><em>${g}</em></p>${opening ? `<p><em>Example opening by the author: “${opening}”</em></p>` : ""}<p><em>[Inspiration generated from the library — rewrite in your own words]</em> ${insp}</p><hr><p></p>`;
  }
}

/** Compara um texto novo com o perfil: devolve métricas e dicas. */
export function checkStyle(text: string, p: Profile) {
  const q = analyze([{ title: "draft", text }]);
  const tips: string[] = [];
  const diff = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : 0);
  if (diff(q.avgSentence, p.avgSentence) > 25) tips.push(`Frases ${diff(q.avgSentence, p.avgSentence)}% mais longas que o normal do autor: quebre algumas.`);
  if (diff(q.avgSentence, p.avgSentence) < -25) tips.push("Frases bem mais curtas que o normal do autor: junte algumas para recuperar o ritmo.");
  if (q.dialoguePct < p.dialoguePct - 15) tips.push(`Pouco diálogo (${q.dialoguePct}% vs ${p.dialoguePct}%): o autor conta a história conversando.`);
  if (q.dialoguePct > p.dialoguePct + 20) tips.push("Muito diálogo: equilibre com pensamentos e ação.");
  if (Math.abs(q.firstPersonPct - p.firstPersonPct) > 30) tips.push("O ponto de vista (1ª/3ª pessoa) está diferente do habitual.");
  if (!tips.length) tips.push("Bem alinhado com o estilo do autor.");
  if (isEn()) {
    const T: [RegExp, string][] = [[/^Frases (-?\d+)% mais longas.*/, "Sentences $1% longer than the author's usual: break some up."], [/^Frases bem mais curtas.*/, "Sentences much shorter than the author's usual: join some to recover the rhythm."],
      [/^Pouco diálogo \((\d+)% vs (\d+)%\).*/, "Little dialogue ($1% vs $2%): the author tells the story through conversation."], [/^Muito diálogo.*/, "Too much dialogue: balance it with thoughts and action."],
      [/^O ponto de vista.*/, "The point of view (1st/3rd person) differs from the usual."], [/^Bem alinhado.*/, "Well aligned with the author's style."]];
    for (let i = 0; i < tips.length; i++) for (const [re, o] of T) if (re.test(tips[i])) tips[i] = tips[i].replace(re, o);
  }
  const score = Math.max(0, 100 - Math.abs(diff(q.avgSentence, p.avgSentence)) / 2 - Math.abs(q.dialoguePct - p.dialoguePct) - Math.abs(q.firstPersonPct - p.firstPersonPct) / 3);
  return { score: Math.round(score), q, tips };
}

/** Descrição e palavras-chave para a Amazon sem IA. */
export function kdpOffline(title: string, premise: string, p: Profile | null, authorName: string) {
  const themes = p?.themes.filter((t) => t[1] > 0).slice(0, 4).map((t) => t[0]) || [];
  const map: Record<string, string> = { "medo/terror": "psychological horror", "morte/violência": "dark thriller", "amor/romance": "dark romance", "obsessão/ciúme": "obsession thriller", "sobrenatural": "supernatural horror", "amizade/família": "friendship drama", "traição/segredo": "betrayal suspense", "luto/tristeza": "grief and loss" };
  const kw = [...new Set([...themes.map((t) => map[t]), "psychological suspense", "horror novel", "page turner", `books like ${authorName}`].filter(Boolean))].slice(0, 7);
  const desc = `<b>${title}</b>\n\n${premise}\n\nFrom ${authorName}, a story of ${themes.slice(0, 3).map((t) => map[t]).join(", ") || "suspense"} — where every friendship hides a secret and nobody is safe.\n\n<i>Perfect for readers who love dark, emotional page-turners.</i>`;
  return { keywords: kw, description: desc, categories: ["Fiction > Horror > Psychological", "Fiction > Thrillers > Psychological", "Fiction > Horror > Occult"] };
}
