// Arquitetura narrativa baseada em StoryScope (Russell et al., 2026 — MIT) e sepia (Nanako Tsai — MIT).
// StoryScope mediu onde a ficção de IA se diferencia da humana (estrutura, não só palavras);
// sepia transformou isso numa ficha de arquitetura + regras. Aqui fica a versão compacta (poucos tokens).

export interface ArchField { key: string; label: string; options: [string, string][]; def: string }
export const ARCH: ArchField[] = [
  { key: "theme", label: "Tema", def: "implied", options: [["implied", "Implícito (os fatos mostram)"], ["withheld", "Escondido (o leitor deduz)"], ["stated", "Dito com todas as letras"]] },
  { key: "subplot", label: "Subtrama", def: "parallel", options: [["parallel", "Uma subtrama paralela ao tema"], ["contrasting", "Subtrama em contraste"], ["independent", "Subtrama independente"], ["none", "Sem subtrama"]] },
  { key: "time", label: "Tempo", def: "moderate", options: [["moderate", "Linear com alguns flashbacks"], ["braided", "Passado e presente entrelaçados"], ["linear", "Totalmente linear"]] },
  { key: "reveal", label: "Revelações", def: "back", options: [["back", "No fim (obriga a reler o começo)"], ["even", "Distribuídas"], ["front", "Logo no início"]] },
  { key: "emotion", label: "Emoções", def: "mix", options: [["mix", "Mistura: nomeadas, comportamento, corpo só nos picos"], ["behavior", "Pelo comportamento"], ["embodied", "Pelo corpo (bem IA)"]] },
  { key: "intro", label: "Apresentação do protagonista", def: "dialogue", options: [["dialogue", "Falando, numa conversa"], ["action", "Em ação"], ["others", "Pelo que os outros dizem"], ["description", "Descrição física (bem IA)"]] },
  { key: "moral", label: "Moral do protagonista", def: "ambivalent", options: [["ambivalent", "Ambígua, com falhas"], ["flaw", "Falha trágica"], ["antihero", "Anti-herói"], ["good", "Herói correto"]] },
  { key: "resolution", label: "Quem resolve o final", def: "mixed", options: [["mixed", "Escolha + acaso/outros"], ["external", "Forças externas"], ["protagonist", "Só a escolha do protagonista"]] },
  { key: "ending", label: "Tipo de final", def: "partial", options: [["partial", "Resolvido em parte, com custo"], ["open", "Aberto, com gancho"], ["catastrophic", "Catastrófico"], ["external", "Um ato concreto"], ["acceptance", "Aceitação interior (bem IA)"]] },
  { key: "anchors", label: "Mundo real", def: "named", options: [["named", "Citar lugares, marcas, músicas e obras reais"], ["some", "Poucas referências"], ["none", "Nenhuma"]] },
  { key: "reader", label: "Narrador e leitor", def: "rare", options: [["rare", "Narrador fala com o leitor de vez em quando"], ["never", "Nunca"]] },
];
export const archDefaults = () => Object.fromEntries(ARCH.map((a) => [a.key, a.def]));

const ARCH_EN: Record<string, Record<string, string>> = {
  theme: { implied: "theme carried by events, never stated", withheld: "theme withheld, reader infers it", stated: "theme may be stated" },
  subplot: { parallel: "one subplot that mirrors the theme", contrasting: "one contrasting subplot", independent: "one independent subplot", none: "no subplot" },
  time: { moderate: "mostly linear with a few flashbacks/flash-forwards", braided: "braided past and present timelines", linear: "strictly linear" },
  reveal: { back: "back-loaded revelations that recontextualize earlier chapters", even: "revelations spread evenly", front: "key facts revealed early" },
  emotion: { mix: "mix emotion modes: sometimes name the feeling plainly, mostly show behaviour, bodily sensations only at peaks", behavior: "emotion through behaviour", embodied: "embodied emotion" },
  intro: { dialogue: "introduce the protagonist mid-conversation", action: "introduce the protagonist in action", others: "introduce the protagonist through what others say", description: "introduce with description" },
  moral: { ambivalent: "morally ambivalent protagonist with real flaws", flaw: "protagonist with a tragic flaw", antihero: "antihero protagonist", good: "upright protagonist" },
  resolution: { mixed: "the ending is driven by a mix of choice, chance and other people", external: "the ending is driven by external forces", protagonist: "the protagonist's choice resolves it" },
  ending: { partial: "partial resolution at a cost", open: "open ending with a hook", catastrophic: "catastrophic ending", external: "ending on a concrete external act", acceptance: "ending in inner acceptance" },
  anchors: { named: "name real places, brands, songs and works", some: "a few real-world references", none: "no real-world references" },
  reader: { rare: "the narrator may address the reader once or twice", never: "no reader address" },
};

/** Ficha de arquitetura para o roteiro (curta). */
export function archText(a: Record<string, string> = {}) {
  const v = { ...archDefaults(), ...a };
  return "Narrative architecture: " + ARCH.map((f) => ARCH_EN[f.key][v[f.key]]).filter(Boolean).join("; ") + ". Include exactly one structural choice that is unusual for this premise.";
}

/** Regras de escrita de cena (StoryScope 30 core features + sepia passes 1–3), ~700 caracteres. */
export const CRAFT_RULES = `Human-like craft (avoid AI fiction tells):
- Never explain the theme or end a scene with a lesson; dialogue does plot and relationship work, not philosophy.
- Do not render every feeling as body sensation (tight chest, breath catching); sometimes say "she was afraid" plainly. Keep smells and sensory detail sparse.
- Setting is not a mirror of the mood. Introduce people in dialogue or action, not with a description paragraph.
- Let some things stay unexplained; uneven escalation (spikes, lulls, a sudden turn), not a smooth ramp.
- Name real things (streets, brands, songs, shows). Vary sentence length; no rule-of-three lists, no "It wasn't X, it was Y".`;

// ---------- verificação sem IA (custo zero) ----------
const EMBODIED = /\b(chest (tightened|constricted|ached)|breath (caught|hitched)|throat (tightened|closed)|stomach (churned|dropped|knotted|twisted)|heart (pounded|hammered|raced|thundered)|pulse (raced|quickened)|shiver (ran|crawled) down|blood ran cold|jaw clenched|knuckles (turned )?white)\b/gi;
const SMELL = /\b(smell(ed|s)?|scent|odou?r|aroma|stench|reek(ed)?|whiff)\b/gi;
const THEME = /\b(she|he|they|I) (realized|understood|learned|knew) (that|then)\b|\bin the end,|\bwhat (truly|really) mattered\b|\bperhaps that was\b|\bthe (real|true) (meaning|lesson)\b/gi;
const SLOP = /\b(tapestry|testament to|delve|a symphony of|palpable|unspoken|the weight of|it wasn'?t (just )?\w+[,—-]+ it was)\b/gi;

export function craftCheck(text: string) {
  const w = (text.match(/\S+/g) || []).length || 1;
  const per = (re: RegExp) => Math.round(((text.match(re) || []).length / w) * 10000) / 10; // por mil palavras
  const emb = per(EMBODIED), smell = per(SMELL), theme = (text.match(THEME) || []).length, slop = (text.match(SLOP) || []).length;
  const paras = text.split(/\n{2,}/).filter((p) => p.trim());
  const dlg = paras.filter((p) => /["“]/.test(p)).length / (paras.length || 1);
  const sents = text.match(/[^.!?…]+[.!?…]+/g) || [];
  const lens = sents.map((s) => s.split(/\s+/).length);
  const avg = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - avg) ** 2, 0) / (lens.length || 1));
  const tips: string[] = [];
  if (emb > 1.5) tips.push(`Muitas emoções pelo corpo (${emb}/mil palavras): troque algumas por ação ou pelo nome da emoção.`);
  if (smell > 2) tips.push(`Cheiros demais (${smell}/mil): a IA exagera no olfato; mantenha só um ou dois.`);
  if (theme) tips.push(`${theme} frase(s) explicando a lição ou o tema: corte ou troque por um fato concreto.`);
  if (slop) tips.push(`${slop} expressão(ões) típicas de IA (tapestry, testament, the weight of, "não era X, era Y").`);
  if (dlg < 0.25) tips.push(`Pouco diálogo (${Math.round(dlg * 100)}% dos parágrafos): humanos usam mais conversa.`);
  if (sd < avg * 0.45) tips.push("Ritmo uniforme: varie mais — frases curtíssimas ao lado de longas.");
  const score = Math.max(0, Math.round(100 - emb * 8 - Math.max(0, smell - 1) * 6 - theme * 6 - slop * 5 - (dlg < 0.25 ? 10 : 0) - (sd < avg * 0.45 ? 8 : 0)));
  if (!tips.length) tips.push("Nenhum vício típico de IA encontrado.");
  return { score, tips };
}
