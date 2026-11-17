//! IA local: llama.cpp embutido no app (GPU via Metal no Mac, CPU no Windows).
//! Os modelos (.gguf) são baixados pelo próprio app e ficam em <dados>/models.
//! A geração usa os mesmos eventos `ai-delta` / `ai-done` das outras IAs.

use std::{
    io::{Read, Write},
    num::NonZeroU32,
    path::PathBuf,
    sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex, OnceLock},
    time::Duration,
};

use llama_cpp_2::{
    context::params::LlamaContextParams,
    llama_backend::LlamaBackend,
    llama_batch::LlamaBatch,
    model::{params::LlamaModelParams, LlamaChatMessage, LlamaModel},
    sampling::LlamaSampler,
};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::{ai::{cancelled, finish}, err, AppState, CmdResult};

pub struct Spec { id: &'static str, name: &'static str, desc: &'static str, file: &'static str, url: &'static str, size: u64, ram: u32 }

pub const MODELS: &[Spec] = &[
    Spec { id: "rapido", name: "Rápido", desc: "Qwen 2.5 · 3B — leve, roda em qualquer máquina", file: "Qwen2.5-3B-Instruct-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf", size: 1_929_903_264, ram: 8 },
    Spec { id: "equilibrado", name: "Equilibrado", desc: "Qwen 2.5 · 7B — boa escrita, recomendado", file: "Qwen2.5-7B-Instruct-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf", size: 4_683_074_240, ram: 12 },
    Spec { id: "escritor", name: "Escritor", desc: "Mistral Nemo · 12B — a melhor prosa de ficção", file: "Mistral-Nemo-Instruct-2407-Q4_K_M.gguf",
        url: "https://huggingface.co/bartowski/Mistral-Nemo-Instruct-2407-GGUF/resolve/main/Mistral-Nemo-Instruct-2407-Q4_K_M.gguf", size: 7_477_208_192, ram: 16 },
];

static BACKEND: OnceLock<LlamaBackend> = OnceLock::new();
static LOADED: Mutex<Option<(String, Arc<LlamaModel>)>> = Mutex::new(None);
static DL_CANCEL: AtomicBool = AtomicBool::new(false);

fn dir(state: &AppState) -> PathBuf { state.root.join("models") }

fn path_of(state: &AppState, id: &str) -> PathBuf {
    match MODELS.iter().find(|m| m.id == id) {
        Some(m) => dir(state).join(m.file),
        None => dir(state).join(format!("{id}.gguf")), // modelo importado pelo usuário
    }
}

#[tauri::command]
pub fn local_models(state: State<AppState>) -> Value {
    let ram = total_ram_gb();
    let mut list: Vec<Value> = MODELS.iter().map(|m| {
        let p = dir(&state).join(m.file);
        let part = std::fs::metadata(p.with_extension("part")).map(|x| x.len()).unwrap_or(0);
        json!({ "id": m.id, "name": m.name, "desc": m.desc, "size": m.size, "ram": m.ram, "ready": p.is_file(), "partial": part, "fits": ram == 0 || ram >= m.ram })
    }).collect();
    if let Ok(rd) = std::fs::read_dir(dir(&state)) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if n.ends_with(".gguf") && !MODELS.iter().any(|m| m.file == n) {
                let id = n.trim_end_matches(".gguf").to_string();
                list.push(json!({ "id": id, "name": id, "desc": "Modelo importado", "size": e.metadata().map(|m| m.len()).unwrap_or(0), "ready": true, "fits": true, "custom": true }));
            }
        }
    }
    json!({ "models": list, "ram": ram, "gpu": cfg!(target_os = "macos") })
}

fn total_ram_gb() -> u32 {
    #[cfg(target_os = "macos")]
    {
        if let Ok(o) = std::process::Command::new("sysctl").args(["-n", "hw.memsize"]).output() {
            return (String::from_utf8_lossy(&o.stdout).trim().parse::<u64>().unwrap_or(0) / (1 << 30)) as u32;
        }
    }
    0
}

/// Baixa um modelo do catálogo (continua de onde parou). Progresso: `model-progress` {id, done, total, finished, error}.
#[tauri::command]
pub fn local_download(app: AppHandle, state: State<AppState>, id: String) -> CmdResult<()> {
    let spec = MODELS.iter().find(|m| m.id == id).ok_or("modelo desconhecido")?;
    let d = dir(&state);
    std::fs::create_dir_all(&d).map_err(err)?;
    let fin = d.join(spec.file);
    let part = fin.with_extension("part");
    DL_CANCEL.store(false, Ordering::SeqCst);
    let (url, total) = (spec.url, spec.size);
    std::thread::spawn(move || {
        let res = (|| -> Result<(), String> {
            let start = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
            let resp = ureq::get(url).set("Range", &format!("bytes={start}-")).call().map_err(|e| e.to_string())?;
            let append = resp.status() == 206;
            let mut f = std::fs::OpenOptions::new().create(true).append(append).write(true).truncate(!append).open(&part).map_err(err)?;
            let mut done = if append { start } else { 0 };
            let mut r = resp.into_reader();
            let mut buf = vec![0u8; 1 << 20];
            let mut last = std::time::Instant::now();
            loop {
                if DL_CANCEL.load(Ordering::SeqCst) { return Err("cancelado".into()); }
                let n = r.read(&mut buf).map_err(err)?;
                if n == 0 { break; }
                f.write_all(&buf[..n]).map_err(err)?;
                done += n as u64;
                if last.elapsed() > Duration::from_millis(300) {
                    last = std::time::Instant::now();
                    let _ = app.emit("model-progress", json!({ "id": id, "done": done, "total": total }));
                }
            }
            drop(f);
            if done < total * 99 / 100 { return Err("download incompleto — clique de novo para continuar".into()); }
            std::fs::rename(&part, &fin).map_err(err)
        })();
        let _ = app.emit("model-progress", json!({ "id": id, "finished": res.is_ok(), "error": res.err() }));
    });
    Ok(())
}

#[tauri::command]
pub fn local_download_cancel() { DL_CANCEL.store(true, Ordering::SeqCst); }

#[tauri::command]
pub fn local_delete(state: State<AppState>, id: String) -> CmdResult<()> {
    let p = path_of(&state, &id);
    *LOADED.lock().unwrap() = None;
    let _ = std::fs::remove_file(p.with_extension("part"));
    let _ = std::fs::remove_file(p);
    Ok(())
}

#[tauri::command]
pub fn local_import(state: State<AppState>, src: String) -> CmdResult<String> {
    let src = PathBuf::from(src);
    let name = src.file_name().ok_or("arquivo inválido")?.to_string_lossy().to_string();
    if !name.to_lowercase().ends_with(".gguf") { return Err("Escolha um arquivo .gguf".into()); }
    std::fs::create_dir_all(dir(&state)).map_err(err)?;
    std::fs::copy(&src, dir(&state).join(&name)).map_err(err)?;
    Ok(name.trim_end_matches(".gguf").to_string())
}

fn model(path: &PathBuf, id: &str) -> Result<Arc<LlamaModel>, String> {
    let backend = BACKEND.get_or_init(|| LlamaBackend::init().expect("llama backend"));
    let mut slot = LOADED.lock().unwrap();
    if let Some((cur, m)) = slot.as_ref() { if cur == id { return Ok(m.clone()); } }
    *slot = None; // libera o anterior antes de carregar outro
    let params = LlamaModelParams::default().with_n_gpu_layers(999);
    let m = Arc::new(LlamaModel::load_from_file(backend, path, &params).map_err(|e| format!("não consegui carregar o modelo: {e}"))?);
    *slot = Some((id.to_string(), m.clone()));
    Ok(m)
}

/// Conversa com o modelo local, com streaming.
#[tauri::command]
pub fn local_chat(app: AppHandle, state: State<AppState>, model_id: String, messages: Vec<Value>, job: String, max_tokens: Option<i32>, temperature: Option<f32>) -> CmdResult<()> {
    let path = path_of(&state, &model_id);
    if !path.is_file() { return Err("Baixe um modelo local primeiro (escolha o motor ‘No meu computador’)".into()); }
    std::thread::spawn(move || {
        let a2 = app.clone();
        let res = generate(&move |v: Value| { let _ = a2.emit("ai-delta", v); }, &path, &model_id, &messages, &job, max_tokens.unwrap_or(3000), temperature.unwrap_or(0.8));
        finish(&app, &job, res);
    });
    Ok(())
}

pub fn generate(emit: &dyn Fn(Value), path: &PathBuf, id: &str, messages: &[Value], job: &str, max_tokens: i32, temp: f32) -> Result<(), String> {
    emit(json!({ "job": job, "delta": "", "status": "Carregando o modelo…" }));
    let model = model(path, id)?;
    let backend = BACKEND.get().unwrap();
    let n_ctx: u32 = model.n_ctx_train().min(12288).max(2048);
    let threads = std::thread::available_parallelism().map(|n| n.get() as i32).unwrap_or(4).max(2);
    let cparams = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(n_ctx))
        .with_n_batch(512)
        .with_n_threads(threads)
        .with_n_threads_batch(threads);
    let mut ctx = model.new_context(backend, cparams).map_err(|e| format!("contexto: {e}"))?;

    let chat: Vec<LlamaChatMessage> = messages.iter()
        .filter_map(|m| LlamaChatMessage::new(m["role"].as_str()?.to_string(), m["content"].as_str()?.replace('\0', "")).ok())
        .collect();
    let tmpl = model.chat_template(None).map_err(|e| format!("modelo sem template de chat: {e}"))?;
    let prompt = model.apply_chat_template(&tmpl, &chat, true).map_err(|e| e.to_string())?;
    let vocab = model.vocab();
    let mut tokens = vocab.tokenize(prompt.as_bytes(), true, true);
    let room = n_ctx as usize - (max_tokens as usize).min(n_ctx as usize / 2);
    if tokens.len() > room {
        // mantém o começo (instruções do sistema) e o fim (pedido), corta o meio
        let head = room / 3;
        let tail = room - head;
        let cut = tokens.len() - tail;
        tokens = tokens[..head].iter().chain(tokens[cut..].iter()).cloned().collect();
    }
    let max_tokens = max_tokens.min(n_ctx as i32 - tokens.len() as i32 - 8).max(64);

    emit(json!({ "job": job, "delta": "", "status": "Lendo o contexto…" }));
    let mut batch = LlamaBatch::new(512, 1);
    let last = tokens.len() - 1;
    for (chunk_i, chunk) in tokens.chunks(512).enumerate() {
        if cancelled(job) { return Ok(()); }
        batch.clear();
        for (j, t) in chunk.iter().enumerate() {
            let pos = chunk_i * 512 + j;
            batch.add(*t, pos as i32, &[0], pos == last).map_err(err)?;
        }
        ctx.decode(&mut batch).map_err(|e| format!("decode: {e}"))?;
    }

    let seed = (crate::now_ms() % u32::MAX as u128) as u32;
    let mut sampler = LlamaSampler::chain_simple([
        LlamaSampler::penalties(model.n_vocab(), 256, 1.08, 0.05, 0.0),
        LlamaSampler::top_k(50),
        LlamaSampler::top_p(0.95, 1),
        LlamaSampler::min_p(0.05, 1),
        LlamaSampler::temp(temp),
        LlamaSampler::dist(seed),
    ]);
    let mut pos = tokens.len() as i32;
    let mut pending: Vec<u8> = Vec::new();
    for _ in 0..max_tokens {
        if cancelled(job) { break; }
        let tok = sampler.sample(&ctx, batch.n_tokens() - 1);
        sampler.accept(tok);
        if vocab.is_eog(tok) { break; }
        pending.extend(vocab.token_to_piece(tok, false, None));
        let valid = match std::str::from_utf8(&pending) { Ok(s) => s.len(), Err(e) => e.valid_up_to() };
        if valid > 0 {
            let s = String::from_utf8_lossy(&pending[..valid]).to_string();
            pending.drain(..valid);
            emit(json!({ "job": job, "delta": s }));
        }
        batch.clear();
        batch.add(tok, pos, &[0], true).map_err(err)?;
        pos += 1;
        ctx.decode(&mut batch).map_err(|e| format!("decode: {e}"))?;
    }
    Ok(())
}

/// Teste pela linha de comando: `kaveels-book-studio --local-test <arquivo.gguf> "<pedido>"`
pub fn cli_test(model: &str, prompt: &str) {
    let msgs = vec![json!({"role": "system", "content": "You are a fiction writer."}), json!({"role": "user", "content": prompt})];
    let t = std::time::Instant::now();
    let n = std::cell::Cell::new(0);
    let r = generate(&|v: Value| { if let Some(d) = v["delta"].as_str() { n.set(n.get() + 1); print!("{d}"); let _ = std::io::stdout().flush(); } }, &PathBuf::from(model), "cli", &msgs, "cli", 400, 0.8);
    unload();
    println!("\n--- {:?} | {} pedaços em {:.1}s", r, n.get(), t.elapsed().as_secs_f32());
}

/// Libera o modelo da GPU (chamar antes de sair do app).
pub fn unload() { *LOADED.lock().unwrap() = None; }
