//! IAs: Claude (via Claude Code CLI, usa a assinatura do usuário), OpenAI e Gemini (API compatível OpenAI),
//! com streaming por eventos `ai-delta` {job, delta} e `ai-done` {job, error}.
//! Geração de imagens (capas/ilustrações) com OpenAI Images e Gemini Image/Imagen.
//! As chaves ficam em <dados do app>/secrets.json e nunca voltam ao frontend.

use std::{
    collections::HashSet,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::Mutex,
    time::Duration,
};

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{err, now_ms, AppState, CmdResult};

static CANCELLED: Mutex<Option<HashSet<String>>> = Mutex::new(None);
const GEMINI: &str = "https://generativelanguage.googleapis.com/v1beta";

fn base(provider: &str) -> CmdResult<&'static str> {
    match provider {
        "openai" => Ok("https://api.openai.com/v1"),
        "gemini" => Ok("https://generativelanguage.googleapis.com/v1beta/openai"),
        _ => Err(format!("provedor desconhecido: {provider}")),
    }
}

// ---------- chaves ----------

fn secrets_path(root: &PathBuf) -> PathBuf { root.join("secrets.json") }

fn secrets(root: &PathBuf) -> Value {
    std::fs::read_to_string(secrets_path(root)).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(json!({}))
}

fn key_of(root: &PathBuf, provider: &str) -> Option<String> {
    secrets(root)[provider].as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from)
}

#[tauri::command]
pub fn secret_set(state: State<AppState>, provider: String, key: String) -> CmdResult<()> {
    base(&provider)?;
    let mut s = secrets(&state.root);
    s[provider.as_str()] = json!(key.trim());
    let p = secrets_path(&state.root);
    std::fs::write(&p, serde_json::to_vec(&s).map_err(err)?).map_err(err)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

#[tauri::command]
pub fn secret_status(state: State<AppState>) -> Value {
    json!({ "openai": key_of(&state.root, "openai").is_some(), "gemini": key_of(&state.root, "gemini").is_some() })
}

pub(crate) fn http_err(e: ureq::Error) -> String {
    match e {
        ureq::Error::Status(code, resp) => {
            let body = resp.into_string().unwrap_or_default();
            let v: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
            let msg = v["error"]["message"].as_str().or(v[0]["error"]["message"].as_str()).map(String::from)
                .unwrap_or_else(|| body.chars().take(300).collect());
            let hint = match code {
                401 | 403 => " (chave inválida ou sem permissão)",
                404 => " (modelo não encontrado: escolha outro em Configurações)",
                429 => " (limite de uso ou sem créditos)",
                _ => "",
            };
            format!("HTTP {code}{hint}: {msg}")
        }
        other => format!("Falha de conexão: {other}"),
    }
}

/// Modelos de chat da chave salva (também testa a chave).
#[tauri::command]
pub async fn ai_models(state: State<'_, AppState>, provider: String) -> CmdResult<Vec<String>> {
    let key = key_of(&state.root, &provider).ok_or("Chave não configurada")?;
    tauri::async_runtime::spawn_blocking(move || {
        let v: Value = ureq::get(&format!("{}/models", base(&provider)?))
            .set("Authorization", &format!("Bearer {key}"))
            .timeout(Duration::from_secs(20)).call().map_err(http_err)?.into_json().map_err(err)?;
        let bad = ["embedding", "audio", "realtime", "tts", "transcribe", "image", "search", "moderation", "dall-e", "whisper", "aqa", "imagen", "veo"];
        let mut ids: Vec<String> = v["data"].as_array().into_iter().flatten()
            .filter_map(|m| m["id"].as_str())
            .map(|s| s.trim_start_matches("models/").to_string())
            .filter(|id| !bad.iter().any(|b| id.contains(b)))
            .filter(|id| if provider == "openai" { id.starts_with("gpt-") || id.starts_with('o') } else { id.contains("gemini") })
            .collect();
        ids.sort();
        ids.dedup();
        Ok(ids)
    }).await.map_err(err)?
}

pub(crate) fn cancelled(job: &str) -> bool {
    CANCELLED.lock().unwrap().as_ref().is_some_and(|s| s.contains(job))
}

pub(crate) fn finish(app: &AppHandle, job: &str, res: Result<(), String>) {
    if let Some(set) = CANCELLED.lock().unwrap().as_mut() { set.remove(job); }
    let _ = app.emit("ai-done", json!({ "job": job, "error": res.err() }));
}

#[tauri::command]
pub fn ai_cancel(app: AppHandle, job: String) {
    CANCELLED.lock().unwrap().get_or_insert_with(HashSet::new).insert(job);
    if let Some(c) = app.state::<AppState>().claude.lock().unwrap().as_mut() { let _ = c.kill(); }
}

/// OpenAI / Gemini com streaming.
#[tauri::command]
pub fn ai_chat(app: AppHandle, state: State<AppState>, provider: String, model: String, messages: Vec<Value>, job: String) -> CmdResult<()> {
    let key = key_of(&state.root, &provider).ok_or("Chave de API não configurada (Configurações)")?;
    if model.trim().is_empty() { return Err("Escolha um modelo em Configurações".into()); }
    let url = format!("{}/chat/completions", base(&provider)?);
    std::thread::spawn(move || {
        let res = (|| -> Result<(), String> {
            let resp = ureq::post(&url).set("Authorization", &format!("Bearer {key}"))
                .timeout(Duration::from_secs(900))
                .send_json(json!({ "model": model, "messages": messages, "stream": true })).map_err(http_err)?;
            for line in BufReader::new(resp.into_reader()).lines() {
                let line = line.map_err(err)?;
                if cancelled(&job) { break; }
                let Some(data) = line.strip_prefix("data:") else { continue };
                let data = data.trim();
                if data == "[DONE]" { break; }
                if let Ok(v) = serde_json::from_str::<Value>(data) {
                    if let Some(d) = v["choices"][0]["delta"]["content"].as_str().filter(|d| !d.is_empty()) {
                        let _ = app.emit("ai-delta", json!({ "job": job, "delta": d }));
                    }
                }
            }
            Ok(())
        })();
        finish(&app, &job, res);
    });
    Ok(())
}

// ---------- Claude Code CLI ----------

fn full_path() -> String {
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_default();
    let sep = if cfg!(windows) { ";" } else { ":" };
    let extra = if cfg!(windows) {
        vec![format!("{home}\\.local\\bin"), format!("{home}\\AppData\\Roaming\\npm")]
    } else {
        vec![format!("{home}/.local/bin"), "/opt/homebrew/bin".into(), "/usr/local/bin".into(), format!("{home}/.npm-global/bin")]
    };
    format!("{}{sep}{}", extra.join(sep), std::env::var("PATH").unwrap_or_default())
}

fn claude_cmd() -> Command {
    if let Ok(p) = std::env::var("CLAUDE_BIN") { return Command::new(p); }
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_default();
    let candidates = if cfg!(windows) {
        vec![PathBuf::from(&home).join(".local\\bin\\claude.exe"), PathBuf::from(&home).join("AppData\\Roaming\\npm\\claude.cmd")]
    } else {
        vec![PathBuf::from(&home).join(".local/bin/claude"), PathBuf::from("/opt/homebrew/bin/claude"), PathBuf::from("/usr/local/bin/claude")]
    };
    let bin = candidates.into_iter().find(|p| p.exists()).unwrap_or_else(|| PathBuf::from("claude"));
    let mut c = Command::new(bin);
    c.env("PATH", full_path());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x08000000); // sem janela de console
    }
    c
}

#[tauri::command]
pub fn claude_status() -> Value {
    match claude_cmd().arg("--version").output() {
        Ok(o) if o.status.success() => json!({ "ok": true, "version": String::from_utf8_lossy(&o.stdout).trim() }),
        _ => json!({ "ok": false }),
    }
}

/// Envia a conversa ao Claude Code em modo headless, sem ferramentas: só gera texto.
#[tauri::command]
pub fn claude_chat(app: AppHandle, state: State<AppState>, system: String, prompt: String, model: Option<String>, effort: Option<String>, job: String) -> CmdResult<()> {
    if state.claude.lock().unwrap().is_some() { return Err("O Claude já está escrevendo — espere ou cancele".into()); }
    // prompt de sistema por arquivo: no Windows a linha de comando tem limite de ~32 mil caracteres
    let sys_file = std::env::temp_dir().join(format!("kbs-system-{job}.txt"));
    std::fs::write(&sys_file, &system).map_err(err)?;
    let mut cmd = claude_cmd();
    cmd.current_dir(std::env::temp_dir())
        .args(["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--tools", ""])
        .args(["--system-prompt-file", &sys_file.to_string_lossy()])
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(m) = model.filter(|m| !m.is_empty()) { cmd.args(["--model", &m]); }
    let effort = effort.filter(|e| ["low", "medium", "high", "xhigh", "max"].contains(&e.as_str())).unwrap_or_else(|| "medium".into());
    cmd.args(["--effort", &effort]);
    let mut child = cmd.spawn().map_err(|e| format!("Não encontrei o Claude Code instalado ({e}). Instale em claude.com/claude-code e faça login."))?;
    if let Some(mut stdin) = child.stdin.take() { stdin.write_all(prompt.as_bytes()).map_err(err)?; }
    let stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    *state.claude.lock().unwrap() = Some(child);
    std::thread::spawn(move || {
        let mut got = false;
        let mut final_text = String::new();
        let mut error: Option<String> = None;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
            match v["type"].as_str() {
                Some("stream_event") => {
                    if let Some(t) = v["event"]["delta"]["text"].as_str().filter(|_| v["event"]["delta"]["type"] == "text_delta") {
                        got = true;
                        let _ = app.emit("ai-delta", json!({ "job": job, "delta": t }));
                    }
                }
                Some("rate_limit_event") => { let _ = app.emit("claude-usage", json!({ "limits": v["rate_limit_info"] })); }
                Some("system") if v["subtype"] == "init" => { let _ = app.emit("claude-usage", json!({ "model": v["model"], "effort": effort })); }
                Some("result") => {
                    let _ = app.emit("claude-usage", json!({ "usage": v["usage"], "cost": v["total_cost_usd"], "ms": v["duration_ms"] }));
                    if v["is_error"].as_bool() == Some(true) {
                        error = Some(v["result"].as_str().unwrap_or("erro do Claude").to_string());
                    } else if let Some(r) = v["result"].as_str() { final_text = r.to_string(); }
                }
                _ => {}
            }
        }
        if !got && !final_text.is_empty() {
            let _ = app.emit("ai-delta", json!({ "job": job, "delta": final_text }));
        }
        let mut e = String::new();
        let _ = std::io::Read::read_to_string(&mut stderr, &mut e);
        let st = app.state::<AppState>();
        let code = st.claude.lock().unwrap().take().and_then(|mut c| c.wait().ok()).and_then(|s| s.code());
        if error.is_none() && !got && final_text.is_empty() && code != Some(0) && !cancelled(&job) {
            error = Some(if e.trim().is_empty() { "O Claude não respondeu. Verifique se está logado (rode `claude` no terminal)".into() } else { e.chars().take(500).collect() });
        }
        let _ = std::fs::remove_file(&sys_file);
        finish(&app, &job, error.map_or(Ok(()), Err));
    });
    Ok(())
}

/// Chamada mínima (Haiku, esforço baixo) só para ler os limites de uso da assinatura.
#[tauri::command]
pub async fn claude_ping(app: AppHandle) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<()> {
        let mut cmd = claude_cmd();
        cmd.current_dir(std::env::temp_dir())
            .args(["-p", "--output-format", "stream-json", "--verbose", "--tools", "", "--model", "haiku", "--effort", "low", "--system-prompt", "Reply with one word."])
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        let mut child = cmd.spawn().map_err(err)?;
        if let Some(mut stdin) = child.stdin.take() { let _ = stdin.write_all(b"ok"); }
        let stdout = child.stdout.take().unwrap();
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
            if v["type"] == "rate_limit_event" { let _ = app.emit("claude-usage", json!({ "limits": v["rate_limit_info"], "ping": true })); }
        }
        let _ = child.wait();
        Ok(())
    }).await.map_err(err)?
}

// ---------- imagens ----------

#[tauri::command]
pub async fn image_generate(state: State<'_, AppState>, provider: String, model: String, prompt: String, portrait: bool, refs: Option<Vec<String>>) -> CmdResult<String> {
    // imagens de referência (capas do acervo): (bytes, mime)
    let refs: Vec<(Vec<u8>, &'static str)> = refs.unwrap_or_default().iter().take(6)
        .filter_map(|p| std::fs::read(p).ok().map(|b| (b, if p.to_lowercase().ends_with(".png") { "image/png" } else { "image/jpeg" })))
        .collect();
    let key = key_of(&state.root, &provider).ok_or("Sem chave para essa IA de imagem (Configurações)")?;
    let dir = state.root.join("images");
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<String> {
        let bytes = if provider == "openai" {
            let model = if model.is_empty() { "gpt-image-1".into() } else { model };
            let size = if portrait { "1024x1536" } else { "1536x1024" };
            let auth = format!("Bearer {key}");
            let resp = if refs.is_empty() {
                ureq::post("https://api.openai.com/v1/images/generations").set("Authorization", &auth).timeout(Duration::from_secs(300))
                    .send_json(json!({ "model": model, "prompt": prompt, "size": size, "n": 1 }))
            } else {
                let bd = format!("kbs-{}", now_ms());
                let mut b: Vec<u8> = Vec::new();
                for (k, v) in [("model", model.as_str()), ("prompt", prompt.as_str()), ("size", size), ("n", "1")] {
                    let _ = write!(b, "--{bd}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n");
                }
                for (i, (bytes, mime)) in refs.iter().enumerate() {
                    let ext = if *mime == "image/png" { "png" } else { "jpg" };
                    let _ = write!(b, "--{bd}\r\nContent-Disposition: form-data; name=\"image[]\"; filename=\"ref-{i}.{ext}\"\r\nContent-Type: {mime}\r\n\r\n");
                    b.extend_from_slice(bytes);
                    b.extend_from_slice(b"\r\n");
                }
                let _ = write!(b, "--{bd}--\r\n");
                ureq::post("https://api.openai.com/v1/images/edits").set("Authorization", &auth)
                    .set("Content-Type", &format!("multipart/form-data; boundary={bd}")).timeout(Duration::from_secs(300)).send_bytes(&b)
            };
            let v: Value = resp.map_err(http_err)?.into_json().map_err(err)?;
            B64.decode(v["data"][0]["b64_json"].as_str().ok_or("A OpenAI não devolveu imagem")?).map_err(err)?
        } else {
            let model = if model.is_empty() { "gemini-2.5-flash-image".into() } else { model };
            let ratio = if portrait { "2:3" } else { "3:2" };
            let call = |action: &str, body: Value| -> CmdResult<Value> {
                ureq::post(&format!("{GEMINI}/models/{model}:{action}")).set("x-goog-api-key", &key)
                    .timeout(Duration::from_secs(300)).send_json(body).map_err(http_err)?.into_json().map_err(err)
            };
            let b64 = if model.starts_with("imagen") {
                let v = call("predict", json!({ "instances": [{ "prompt": prompt }], "parameters": { "sampleCount": 1, "aspectRatio": if portrait { "3:4" } else { "4:3" } } }))?;
                v["predictions"][0]["bytesBase64Encoded"].as_str().map(String::from).ok_or("O Imagen não devolveu imagem")?
            } else {
                let v = call("generateContent", json!({
                    "contents": [{ "role": "user", "parts": refs.iter().map(|(b, m)| json!({ "inlineData": { "mimeType": m, "data": B64.encode(b) } })).chain([json!({ "text": prompt })]).collect::<Vec<_>>() }],
                    "generationConfig": { "responseModalities": ["TEXT", "IMAGE"], "imageConfig": { "aspectRatio": ratio } }
                }))?;
                let parts = v["candidates"][0]["content"]["parts"].as_array().cloned().unwrap_or_default();
                parts.iter().find_map(|p| p["inlineData"]["data"].as_str().or(p["inline_data"]["data"].as_str())).map(String::from)
                    .ok_or_else(|| format!("O Gemini não devolveu imagem {}", v["promptFeedback"]["blockReason"].as_str().unwrap_or("")))?
            };
            B64.decode(b64.as_bytes()).map_err(err)?
        };
        std::fs::create_dir_all(&dir).map_err(err)?;
        let out = dir.join(format!("ia-{}.png", now_ms()));
        std::fs::write(&out, bytes).map_err(err)?;
        Ok(out.to_string_lossy().to_string())
    }).await.map_err(err)?
}
