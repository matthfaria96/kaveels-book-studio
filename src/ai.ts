// Ponte com as IAs (Claude Code, OpenAI, Gemini) e montagem do contexto do autor.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Profile } from "./style";
import { describe } from "./style";
import { getLang } from "./i18n";
const uiLang = () => (getLang() === "pt" ? "Portuguese (Brazil)" : "English");

export type Mode = "offline" | "local" | "claude" | "openai" | "gemini";
export interface Msg { role: "user" | "assistant"; content: string; by?: string }

const handlers = new Map<string, { delta: (d: string) => void; done: (e?: string) => void; status?: (s: string) => void }>();
listen<{ job: string; delta: string; status?: string }>("ai-delta", (e) => { const h = handlers.get(e.payload.job); if (e.payload.status) h?.status?.(e.payload.status); else if (e.payload.delta) h?.delta(e.payload.delta); });
listen<{ job: string; error?: string }>("ai-done", (e) => { const h = handlers.get(e.payload.job); handlers.delete(e.payload.job); h?.done(e.payload.error || undefined); });

let current = "";
export function cancelAI() { if (current) invoke("ai_cancel", { job: current }); }

/** Versão compacta para modelos locais (contexto menor): estilo + bíblia + trechos reais parecidos com o pedido. */
export function localSystem(author: any, profile: Profile | null, bible: string, examples: { src: string; text: string }[]) {
  const name = author?.name || "the author";
  return `You are a fiction ghostwriter who writes EXACTLY like ${name}. Imitate the voice of the example passages: same rhythm, sentence length, dialogue style, inner thoughts and tone. Never copy them.

## Style profile
${profile ? describe(profile, true) : ""}

${bible}

## Example passages by ${name}
${examples.map((e, i) => `[${i + 1}] (${e.src})\n${e.text}`).join("\n\n")}

## Rules
- Write in ${profile?.lang === "pt" ? "Portuguese" : "English"} unless asked otherwise. Write explanations to the user in ${uiLang()}, but story text in the book's language.
- For story text output only clean prose (paragraphs, dialogue in quotes, *** for scene breaks). No titles, notes or commentary.`;
}

export function systemPrompt(author: any, profile: Profile | null, notes: string) {
  const name = author?.name || "the author";
  return `You are the dedicated ghostwriting partner of ${name}. Your job is to help create NEW original stories that read exactly as if ${name} wrote them — same voice, rhythm, vocabulary, dialogue habits and themes — organized for publishing as an ebook on Amazon KDP.

# About the author
${author?.bio || "(no bio yet)"}
${author?.genres ? `Genres: ${author.genres}` : ""}

# Measured style profile (from the author's books)
${profile ? describe(profile, true) : "(not analyzed yet)"}
${profile?.names.length ? `Recurring character names in past books (do not reuse unless asked): ${profile.names.slice(0, 12).map((n) => n[0]).join(", ")}` : ""}

# Editorial notes about the author's style
${(notes || "").slice(0, 7000)}

# Real excerpts (imitate the voice, never copy)
## Dialogue
${profile?.samples.dialogue || ""}
## Narration
${profile?.samples.narrative || ""}

# Rules
- Write fiction in the book's language (${profile?.lang === "pt" ? "Portuguese" : "English"}) unless asked otherwise; talk to the user in ${uiLang()}.
- When writing chapters, output only clean prose in Markdown (paragraphs, dialogue in quotes, "***" for scene breaks). No commentary before or after the text.
- Keep chapters near ${profile?.avgChapterWords || 2500} words unless told otherwise.`;
}

export async function runAI(o: { mode: Mode; models: any; system: string; history: Msg[]; prompt: string; onDelta: (d: string) => void; onStatus?: (s: string) => void; maxTokens?: number }): Promise<string> {
  const job = "j" + Date.now();
  current = job;
  let full = "";
  const p = new Promise<string>((res, rej) => handlers.set(job, { delta: (d) => { full += d; o.onDelta(d); }, done: (e) => { if (full.length > 200) invoke("gen_log", { label: o.prompt.replace(/\s+/g, " ").slice(0, 70), prompt: o.prompt, text: full }).catch(() => {}); e ? rej(new Error(e)) : res(full); }, status: o.onStatus }));
  try {
    if (o.mode === "local") {
      const messages = [{ role: "system", content: o.system }, ...o.history.slice(-4).map((m) => ({ ...m, content: m.content.slice(-4000) })), { role: "user", content: o.prompt }];
      await invoke("local_chat", { modelId: o.models?.local || "", messages, job, maxTokens: o.maxTokens || 2600, temperature: 0.85 });
    } else if (o.mode === "claude") {
      const hist = o.history.slice(-8).map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}:\n${m.content.slice(0, 6000)}`).join("\n\n");
      const prompt = (hist ? `Previous conversation:\n${hist}\n\n---\n` : "") + o.prompt;
      await invoke("claude_chat", { system: o.system, prompt, model: o.models?.claude || null, effort: o.models?.claudeEffort || "medium", job });
    } else {
      const messages = [{ role: "system", content: o.system }, ...o.history.slice(-12), { role: "user", content: o.prompt }];
      await invoke("ai_chat", { provider: o.mode, model: o.models?.[o.mode] || "", messages, job });
    }
  } catch (e) { handlers.delete(job); throw e; }
  return p;
}

export const QUICK: { id: string; label: string; prompt: (ctx: any) => string }[] = [
  { id: "ideas", label: "5 ideias de livro", prompt: () => `Give me 5 original book ideas in my style (title, logline, 3-line hook, main cast). Answer in ${uiLang()}, titles in English.` },
  { id: "synopsis", label: "Sinopse", prompt: (c) => `Write a full synopsis (beginning, twists, ending) for this book: "${c.title}". Premise: ${c.premise}. Answer in ${uiLang()}.` },
  { id: "outline", label: "Esboço de capítulos", prompt: (c) => `Create a chapter-by-chapter outline with ${c.chapters || 15} chapters for "${c.title}". Premise: ${c.premise}. Format strictly as lines: "## Chapter N: Title" followed by a 2-3 sentence summary.` },
  { id: "chapter", label: "Escrever capítulo atual", prompt: (c) => `Write the full text of "${c.chapterTitle}" for the book "${c.title}". Premise: ${c.premise}. Chapter plan: ${c.chapterPlan || "(free)"}.\nPrevious chapter ends with: ${c.prevTail || "(this is the first chapter)"}` },
  { id: "continue", label: "Continuar o texto", prompt: (c) => `Continue this chapter naturally for about 800 words, same voice:\n\n${c.tail}` },
  { id: "revise", label: "Revisar no meu estilo", prompt: (c) => `Rewrite this passage so it sounds exactly like me, keeping the plot. Output only the revised text:\n\n${c.selection || c.tail}` },
  { id: "kdp", label: "Descrição + keywords KDP", prompt: (c) => `For the Amazon KDP listing of "${c.title}" (premise: ${c.premise}) write: 1) a compelling book description (max 3800 chars, simple HTML <b><i><br>), 2) exactly 7 keyword phrases, 3) 3 suggested KDP categories, 4) a subtitle. Use the headings DESCRIPTION, KEYWORDS, CATEGORIES, SUBTITLE.` },
  { id: "cover", label: "Prompt de capa", prompt: (c) => `Write one detailed image-generation prompt (in English) for the FRONT COVER artwork of "${c.title}" (premise: ${c.premise}), portrait 1600x2560, genre-appropriate, leave clear space at top for the title and bottom for the author name, no text in the image. Output only the prompt.` },
];
