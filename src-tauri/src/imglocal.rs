//! Imagens 100% locais e gratuitas: stable-diffusion.cpp (Metal) + Z-Image-Turbo (Apache 2.0).
//! Baixa o programa e os modelos uma vez (~6,7 GB) para models/image e gera capas sem internet.
use crate::{err, now_ms, AppState, CmdResult};
use serde_json::json;
use std::io::{BufRead, Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

const REL: &str = "https://github.com/leejet/stable-diffusion.cpp/releases/download/master-1106-532d2c1/";
/// Programa certo para cada sistema: (arquivo do release, tamanho, aceleração)
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
const BIN: Option<(&str, u64, &str)> = Some(("sd-master-532d2c1-bin-Darwin-macOS-26.7.2-arm64.zip", 38_331_254, "Apple Metal"));
#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
const BIN: Option<(&str, u64, &str)> = Some(("sd-master-532d2c1-bin-win-vulkan-x64.zip", 30_312_081, "Vulkan (NVIDIA / AMD / Intel)"));
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
const BIN: Option<(&str, u64, &str)> = Some(("sd-master-532d2c1-bin-Linux-Ubuntu-26.04-x86_64-vulkan.zip", 42_212_329, "Vulkan"));
#[cfg(not(any(all(target_os = "macos", target_arch = "aarch64"), all(target_os = "windows", target_arch = "x86_64"), all(target_os = "linux", target_arch = "x86_64"))))]
const BIN: Option<(&str, u64, &str)> = None;
fn bin_size() -> u64 { BIN.map(|b| b.1).unwrap_or(0) }
fn ram_gb() -> u64 { let mut m = sysinfo::System::new(); m.refresh_memory(); m.total_memory() / 1_073_741_824 }
/// Memória que dá para usar agora (GB, com 1 casa).
fn avail_gb() -> f64 {
    let mut m = sysinfo::System::new(); m.refresh_memory();
    // no Mac o "nível de memória" do sistema é o número mais fiel (conta a memória comprimida/liberável)
    if let Some(l) = mem_level() { return m.total_memory() as f64 * l as f64 / 100.0 / 1_073_741_824.0; }
    m.available_memory() as f64 / 1_073_741_824.0
}
/// No Mac: nível de memória livre do sistema (0–100). Abaixo de ~12 o Mac começa a travar.
fn mem_level() -> Option<u32> {
    #[cfg(target_os = "macos")] { if let Ok(o) = Command::new("/usr/sbin/sysctl").args(["-n", "kern.memorystatus_level"]).output() { return String::from_utf8_lossy(&o.stdout).trim().parse().ok(); } }
    None
}
/// Mata qualquer gerador nosso que tenha ficado rodando (ex.: depois de travar ou fechar o app).
pub fn kill_strays(st_root: &std::path::Path) {
    if let Some(mut c) = RUNNING.lock().unwrap().take() { let _ = c.kill(); let _ = c.wait(); }
    let bin_dir = st_root.join("models").join("image").join("bin");
    #[cfg(unix)] { let _ = Command::new("pkill").arg("-9").arg("-f").arg(bin_dir.join("sd-cli").to_string_lossy().to_string()).status(); }
    #[cfg(windows)] { use std::os::windows::process::CommandExt; let _ = bin_dir; let _ = Command::new("taskkill").args(["/F", "/IM", "sd-cli.exe"]).creation_flags(0x08000000).status(); }
}
/// Precisa de ~7 GB para o modelo; abaixo disso não começa (evita travar o computador).
const NEED_GB: f64 = 7.0;
/// Medido num Mac de 16 GB: começando com 44% livres, o pior momento chegou a 11%. Abaixo de ~6 GB livres não começa.
#[cfg(target_os = "macos")] const MIN_GB: f64 = 6.0;
#[cfg(not(target_os = "macos"))] const MIN_GB: f64 = 4.0;
#[tauri::command]
pub fn img_local_preflight() -> serde_json::Value {
    let a = avail_gb(); let running = RUNNING.lock().unwrap().is_some();
    json!({ "ram": ram_gb(), "avail": (a * 10.0).round() / 10.0, "need": NEED_GB, "min": MIN_GB, "running": running, "ok": !running && a >= MIN_GB, "tight": a < NEED_GB })
}
/// Extrai o zip (mesmo código no Mac, Windows e Linux).
fn unzip(zip: &PathBuf, to: &PathBuf) -> Result<(), String> {
    let mut a = zip::ZipArchive::new(std::fs::File::open(zip).map_err(err)?).map_err(err)?;
    for i in 0..a.len() {
        let mut f = a.by_index(i).map_err(err)?;
        let Some(rel) = f.enclosed_name() else { continue };
        let out = to.join(rel);
        if f.is_dir() { std::fs::create_dir_all(&out).map_err(err)?; continue; }
        if let Some(p) = out.parent() { std::fs::create_dir_all(p).map_err(err)?; }
        let mut w = std::fs::File::create(&out).map_err(err)?; std::io::copy(&mut f, &mut w).map_err(err)?;
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; let _ = std::fs::set_permissions(&out, std::fs::Permissions::from_mode(0o755)); }
    }
    Ok(())
}
/// (arquivo, url, tamanho aproximado em bytes)
const FILES: [(&str, &str, u64); 3] = [
    ("z_image_turbo-Q4_K.gguf", "https://huggingface.co/leejet/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q4_K.gguf", 3_860_000_000),
    ("Qwen3-4B-Instruct-2507-Q4_K_M.gguf", "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf", 2_500_000_000),
    ("ae.safetensors", "https://huggingface.co/Comfy-Org/Z-Image-Turbo/resolve/main/split_files/vae/ae.safetensors", 335_000_000),
];
static CANCEL: AtomicBool = AtomicBool::new(false);
static LOWMEM: AtomicBool = AtomicBool::new(false);
static RUNNING: Mutex<Option<Child>> = Mutex::new(None);

fn dir(st: &AppState) -> PathBuf { st.root.join("models").join("image") }
fn bin(st: &AppState) -> Option<PathBuf> {
    let b = dir(st).join("bin");
    let names = ["sd-cli", "sd", "sd-cli.exe", "sd.exe"];
    names.iter().map(|n| b.join(n)).find(|p| p.is_file())
        .or_else(|| walk(&b, 3).into_iter().find(|p| p.file_name().and_then(|n| n.to_str()).map(|n| names.contains(&n)).unwrap_or(false)))
}
fn walk(d: &PathBuf, depth: u32) -> Vec<PathBuf> {
    let mut out = vec![]; if depth == 0 { return out; }
    if let Ok(r) = std::fs::read_dir(d) { for e in r.flatten() { let p = e.path(); if p.is_dir() { out.extend(walk(&p, depth - 1)); } else { out.push(p); } } }
    out
}
fn have(st: &AppState, f: &str, size: u64) -> bool { std::fs::metadata(dir(st).join(f)).map(|m| m.len() >= size * 97 / 100).unwrap_or(false) }

#[tauri::command]
pub fn img_local_status(state: State<AppState>) -> serde_json::Value {
    let files: Vec<_> = FILES.iter().map(|(f, _, s)| { let got = std::fs::metadata(dir(&state).join(f)).or_else(|_| std::fs::metadata(dir(&state).join(format!("{f}.part")))).map(|m| m.len()).unwrap_or(0); json!({ "file": f, "size": s, "got": got.min(*s), "ok": have(&state, f, *s) }) }).collect();
    let ok = bin(&state).is_some() && FILES.iter().all(|(f, _, s)| have(&state, f, *s));
    let os = if cfg!(target_os = "macos") { "mac" } else if cfg!(target_os = "windows") { "windows" } else { "linux" };
    let free = fs_free(&state.root);
    json!({ "ok": ok, "bin": bin(&state).is_some(), "files": files, "total": FILES.iter().map(|x| x.2).sum::<u64>() + bin_size(), "binSize": bin_size(), "running": RUNNING.lock().unwrap().is_some(),
        "supported": BIN.is_some(), "accel": BIN.map(|b| b.2).unwrap_or(""), "os": os, "ram": ram_gb(), "free": free, "dir": dir(&state).to_string_lossy() })
}
/// Espaço livre no disco (GB); 0 se não souber.
fn fs_free(p: &PathBuf) -> u64 {
    #[cfg(unix)] { if let Ok(o) = Command::new("df").arg("-k").arg(p).output() { return String::from_utf8_lossy(&o.stdout).lines().nth(1).and_then(|l| l.split_whitespace().nth(3)).and_then(|x| x.parse::<u64>().ok()).unwrap_or(0) / 1_048_576; } }
    #[cfg(windows)] { let drive = p.to_string_lossy().chars().next().unwrap_or('C'); let mut c = Command::new("powershell"); { use std::os::windows::process::CommandExt; c.creation_flags(0x08000000); } if let Ok(o) = c.args(["-NoProfile", "-Command"]).arg(format!("(Get-PSDrive {drive}).Free")).output() { return String::from_utf8_lossy(&o.stdout).trim().parse::<u64>().unwrap_or(0) / 1_073_741_824; } }
    0
}

fn fetch(app: &AppHandle, url: &str, to: &PathBuf, label: &str, base: u64, total: u64) -> Result<(), String> {
    let part = PathBuf::from(format!("{}.part", to.display()));
    let start = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
    let resp = ureq::get(url).set("Range", &format!("bytes={start}-")).call().map_err(|e| e.to_string())?;
    let append = resp.status() == 206;
    let mut f = std::fs::OpenOptions::new().create(true).append(append).write(true).truncate(!append).open(&part).map_err(err)?;
    let mut done = if append { start } else { 0 };
    let mut r = resp.into_reader(); let mut buf = vec![0u8; 1 << 20]; let mut last = std::time::Instant::now();
    loop {
        if CANCEL.load(Ordering::SeqCst) { return Err("cancelado".into()); }
        let n = r.read(&mut buf).map_err(err)?; if n == 0 { break; }
        f.write_all(&buf[..n]).map_err(err)?; done += n as u64;
        if last.elapsed() > Duration::from_millis(400) { last = std::time::Instant::now(); let _ = app.emit("imglocal-dl", json!({ "file": label, "done": base + done, "total": total })); }
    }
    drop(f);
    std::fs::rename(&part, to).map_err(err)
}

#[tauri::command]
pub fn img_local_download(app: AppHandle, state: State<AppState>) -> CmdResult<()> {
    let Some((bin_file, bin_sz, _)) = BIN else { return Err("O gerador de capas local ainda não funciona neste tipo de computador.".into()) };
    let d = dir(&state); std::fs::create_dir_all(d.join("bin")).map_err(err)?;
    CANCEL.store(false, Ordering::SeqCst);
    let need_bin = bin(&state).is_none();
    let todo: Vec<(String, String, u64, bool)> = FILES.iter().map(|(f, u, s)| (f.to_string(), u.to_string(), *s, have(&state, f, *s))).collect();
    std::thread::spawn(move || {
        let res = (|| -> Result<(), String> {
            let total: u64 = todo.iter().map(|x| x.2).sum::<u64>() + bin_sz;
            let mut base: u64 = todo.iter().filter(|x| x.3).map(|x| x.2).sum();
            if need_bin {
                let zip = d.join("bin").join("sd.zip");
                fetch(&app, &format!("{REL}{bin_file}"), &zip, "stable-diffusion.cpp", base, total)?;
                unzip(&zip, &d.join("bin")).map_err(|e| format!("não consegui descompactar o programa: {e}"))?;
                let _ = std::fs::remove_file(&zip);
                #[cfg(target_os = "macos")] for p in walk(&d.join("bin"), 3) { let _ = Command::new("/usr/bin/xattr").args(["-d", "com.apple.quarantine"]).arg(&p).status(); }
            }
            base += bin_sz;
            for (f, u, s, ok) in &todo { if *ok { continue; } fetch(&app, u, &d.join(f), f, base, total)?; base += s; }
            Ok(())
        })();
        let _ = app.emit("imglocal-dl", json!({ "finished": res.is_ok(), "error": res.err() }));
    });
    Ok(())
}
#[tauri::command]
pub fn img_local_cancel(state: State<AppState>) {
    CANCEL.store(true, Ordering::SeqCst);
    kill_strays(&state.root);
}

/// Gera uma imagem. width/height múltiplos de 16 (capa: 5:8). Emite "imglocal-gen" com o passo atual.
#[tauri::command]
pub async fn img_local_generate(app: AppHandle, state: State<'_, AppState>, prompt: String, width: u32, height: u32, steps: Option<u32>, seed: Option<i64>, init: Option<String>, strength: Option<f32>) -> CmdResult<String> {
    let b = bin(&state).ok_or("Programa de imagem local não instalado (Configurações › Imagens)")?;
    let d = dir(&state);
    for (f, _, s) in FILES.iter() { if !have(&state, f, *s) { return Err(format!("Falta baixar {f} (Configurações › Imagens)")); } }
    let out = state.root.join("images").join(format!("local-{}.png", now_ms()));
    let _ = std::fs::create_dir_all(state.root.join("images"));
    let steps = steps.unwrap_or(8);
    // uma geração por vez — duas juntas esgotam a memória e travam o computador
    if RUNNING.lock().unwrap().is_some() { return Err("Já tem uma imagem sendo gerada. Espere terminar ou cancele no painel de tarefas.".into()); }
    kill_strays(&state.root);
    let a = avail_gb();
    if a < MIN_GB { return Err(format!("Pouca memória livre agora ({a:.1} GB; precisa de uns {NEED_GB:.0} GB). Feche outros programas (navegador, editores de vídeo…) e tente de novo.")); }
    CANCEL.store(false, Ordering::SeqCst);
    LOWMEM.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<String> {
        // prioridade baixa: o computador continua respondendo enquanto gera
        #[cfg(unix)] let mut cmd = { let mut c = Command::new("nice"); c.args(["-n", "15"]).arg(&b); c };
        #[cfg(windows)] let mut cmd = { use std::os::windows::process::CommandExt; let mut c = Command::new(&b); c.creation_flags(0x08000000 | 0x00004000); c };
        cmd.current_dir(b.parent().unwrap())
            .arg("--diffusion-model").arg(d.join(FILES[0].0)).arg("--llm").arg(d.join(FILES[1].0)).arg("--vae").arg(d.join(FILES[2].0))
            .arg("-p").arg(&prompt).args(["--cfg-scale", "1.0", "--steps", &steps.to_string(), "-W", &width.to_string(), "-H", &height.to_string(), "--seed", &seed.unwrap_or(-1).to_string(), "--vae-tiling", "-v"])
            .args(init.as_ref().filter(|p| std::path::Path::new(p).is_file()).map(|p| vec!["-i".to_string(), p.clone(), "--strength".to_string(), format!("{:.2}", strength.unwrap_or(0.55).clamp(0.1, 0.95))]).unwrap_or_default())
            .arg("-o").arg(&out).stdout(Stdio::piped()).stderr(Stdio::piped());
        let mut child = cmd.spawn().map_err(|e| format!("não consegui abrir o gerador local: {e}"))?;
        let so = child.stdout.take().unwrap(); let se = child.stderr.take().unwrap();
        *RUNNING.lock().unwrap() = Some(child);
        // vigia: se a memória do sistema acabar, para na hora para não travar o computador
        let done = std::sync::Arc::new(AtomicBool::new(false)); let d2 = done.clone();
        std::thread::spawn(move || while !d2.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(1500));
            let low = match mem_level() { Some(l) => l <= 6, None => avail_gb() < 0.8 };
            if low { LOWMEM.store(true, Ordering::SeqCst); if let Some(c) = RUNNING.lock().unwrap().as_mut() { let _ = c.kill(); } break; }
        });
        let app2 = app.clone();
        let t = std::thread::spawn(move || { let mut tail = String::new(); for line in std::io::BufReader::new(se).split(b'\r').flatten() { let l = String::from_utf8_lossy(&line).to_string(); emit_line(&app2, &l); tail = (tail + &l).chars().rev().take(1500).collect::<String>().chars().rev().collect(); } tail });
        let mut tail2 = String::new();
        for line in std::io::BufReader::new(so).split(b'\r').flatten() { let l = String::from_utf8_lossy(&line).to_string(); emit_line(&app, &l); tail2 = (tail2 + &l).chars().rev().take(1500).collect::<String>().chars().rev().collect(); }
        let tail = t.join().unwrap_or_default();
        done.store(true, Ordering::SeqCst);
        if LOWMEM.load(Ordering::SeqCst) { let _ = RUNNING.lock().unwrap().take().map(|mut c| c.wait()); let _ = std::fs::remove_file(&out); return Err("Parei a geração para proteger o computador: a memória estava acabando. Feche outros programas e tente de novo.".into()); }
        let status = RUNNING.lock().unwrap().take().map(|mut c| c.wait());
        if CANCEL.load(Ordering::SeqCst) { return Err("cancelado".into()); }
        match status { Some(Ok(s)) if s.success() && out.is_file() => Ok(out.to_string_lossy().to_string()), None => Err("cancelado".into()),
            _ => Err(format!("o gerador local falhou: {}", tail2.lines().chain(tail.lines()).filter(|l| l.contains("error") || l.contains("ERROR") || l.contains("failed")).last().unwrap_or("veja se há memória livre").trim())) }
    }).await.map_err(err)?
}
fn emit_line(app: &AppHandle, l: &str) {
    // barra do sd.cpp: "  |=====>   | 3/8 - 4.21s/it"
    if let Some(i) = l.rfind('|') { let rest = &l[i + 1..]; if let Some((a, b)) = rest.trim().split_whitespace().next().and_then(|x| x.split_once('/')) { if let (Ok(a), Ok(b)) = (a.parse::<u32>(), b.parse::<u32>()) { let _ = app.emit("imglocal-gen", json!({ "step": a, "total": b, "phase": if l.contains("decod") { "decode" } else { "sample" } })); return; } } }
    let low = l.to_lowercase();
    let phase = if low.contains("loading") || low.contains("load ") { "load" } else if low.contains("condition") || low.contains("get_learned") { "text" } else if low.contains("decod") { "decode" } else if low.contains("save") { "save" } else { "" };
    if !phase.is_empty() { let _ = app.emit("imglocal-gen", json!({ "phase": phase })); }
}
