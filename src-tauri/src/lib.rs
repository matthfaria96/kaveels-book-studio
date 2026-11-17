//! Kaveel's Book Studio — backend.
//! Guarda o acervo (arquivos + textos extraídos + JSON) na pasta de dados do app,
//! conversa com as IAs (Claude Code CLI, OpenAI, Gemini), gera imagens e exporta EPUB para a KDP.

mod ai;
mod epub;
mod local;
mod backup;
mod imglocal;

use std::path::PathBuf;
use std::sync::Mutex;
use std::process::Child;
use serde_json::Value;
use tauri::{Manager, State};

pub type CmdResult<T> = Result<T, String>;
pub fn err<E: std::fmt::Display>(e: E) -> String { e.to_string() }

pub struct AppState {
    pub root: PathBuf,
    pub claude: Mutex<Option<Child>>,
}

fn safe(key: &str) -> CmdResult<String> {
    if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || "-_".contains(c)) {
        return Err(format!("nome inválido: {key}"));
    }
    Ok(key.to_string())
}

pub fn now_ms() -> u128 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

#[tauri::command]
fn data_dir(state: State<AppState>) -> String { state.root.to_string_lossy().to_string() }

/// JSON genérico: data/<key>.json
#[tauri::command]
fn store_get(state: State<AppState>, key: String) -> CmdResult<Value> {
    let p = state.root.join("data").join(format!("{}.json", safe(&key)?));
    Ok(std::fs::read_to_string(p).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(Value::Null))
}

#[tauri::command]
fn store_set(state: State<AppState>, key: String, value: Value) -> CmdResult<()> {
    let dir = state.root.join("data");
    std::fs::create_dir_all(&dir).map_err(err)?;
    let p = dir.join(format!("{}.json", safe(&key)?));
    let bytes = serde_json::to_vec_pretty(&value).map_err(err)?;
    snapshot(&state.root, &key, &p, bytes.len());
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, bytes).map_err(err)?;
    std::fs::rename(tmp, p).map_err(err)
}

// ---------- histórico: nada do que foi gerado se perde ----------
fn hist_dir(root: &PathBuf, key: &str) -> PathBuf { root.join("data").join("history").join(key) }
fn hist_list_ms(dir: &PathBuf) -> Vec<u128> {
    let mut v: Vec<u128> = std::fs::read_dir(dir).map(|r| r.filter_map(|e| e.ok()?.file_name().to_str()?.strip_suffix(".json")?.parse().ok()).collect()).unwrap_or_default();
    v.sort(); v
}
/// Antes de sobrescrever data/<key>.json guarda a versão anterior em data/history/<key>/<ms>.json.
/// Sempre guarda quando o arquivo encolhe muito (apagou algo); senão no máximo uma cópia a cada 3 minutos.
/// Mantém as 120 mais recentes e, das antigas, uma por dia — para sempre.
fn snapshot(root: &PathBuf, key: &str, p: &PathBuf, new_len: usize) {
    if key == "settings" { return; }
    let Ok(old) = std::fs::read(p) else { return };
    if old.len() < 8 { return; }
    let dir = hist_dir(root, key);
    if std::fs::create_dir_all(&dir).is_err() { return; }
    let list = hist_list_ms(&dir);
    let now = now_ms();
    let shrink = new_len * 10 < old.len() * 9;
    if !shrink { if let Some(last) = list.last() { if now.saturating_sub(*last) < 180_000 { return; } } }
    let _ = std::fs::write(dir.join(format!("{now}.json")), &old);
    let mut list = hist_list_ms(&dir);
    if list.len() > 120 {
        let keep_from = list.len() - 120;
        let mut seen_days = std::collections::HashSet::new();
        for ms in list.drain(..keep_from) { if !seen_days.insert(ms / 86_400_000) { let _ = std::fs::remove_file(dir.join(format!("{ms}.json"))); } }
    }
}
#[derive(serde::Serialize)]
struct HistEntry { ms: String, size: u64 }
#[tauri::command]
fn history_list(state: State<AppState>, key: String) -> CmdResult<Vec<HistEntry>> {
    let dir = hist_dir(&state.root, &safe(&key)?);
    Ok(hist_list_ms(&dir).into_iter().rev().map(|ms| HistEntry { ms: ms.to_string(), size: std::fs::metadata(dir.join(format!("{ms}.json"))).map(|m| m.len()).unwrap_or(0) }).collect())
}
#[tauri::command]
fn history_get(state: State<AppState>, key: String, ms: String) -> CmdResult<Value> {
    let f = hist_dir(&state.root, &safe(&key)?).join(format!("{}.json", safe(&ms)?));
    serde_json::from_str(&std::fs::read_to_string(f).map_err(err)?).map_err(err)
}
/// Volta uma versão: a atual também vai para o histórico antes.
#[tauri::command]
fn history_restore(state: State<AppState>, key: String, ms: String) -> CmdResult<()> {
    let key = safe(&key)?;
    let src = hist_dir(&state.root, &key).join(format!("{}.json", safe(&ms)?));
    let data = std::fs::read(&src).map_err(err)?;
    let p = state.root.join("data").join(format!("{key}.json"));
    if let Ok(cur) = std::fs::read(&p) { if cur.len() >= 8 { let d = hist_dir(&state.root, &key); let _ = std::fs::create_dir_all(&d); let _ = std::fs::write(d.join(format!("{}.json", now_ms())), cur); } }
    std::fs::write(p, data).map_err(err)
}
/// Tudo que a IA gera fica gravado em generated/<dia>/<hora>-<rótulo>.md (nunca é apagado pelo app).
#[tauri::command]
fn gen_log(state: State<AppState>, label: String, prompt: String, text: String) -> CmdResult<()> {
    let ms = now_ms();
    let (y, m, d) = civil((ms / 86_400_000) as i64);
    let secs = (ms / 1000) % 86_400;
    let dir = state.root.join("generated").join(format!("{y:04}-{m:02}-{d:02}"));
    std::fs::create_dir_all(&dir).map_err(err)?;
    let name: String = label.chars().map(|c| if c.is_alphanumeric() { c } else { '-' }).collect::<String>().split('-').filter(|x| !x.is_empty()).take(8).collect::<Vec<_>>().join("-");
    let f = dir.join(format!("{:02}{:02}{:02}-{}-{}.md", secs / 3600, secs / 60 % 60, secs % 60, ms % 1000, if name.is_empty() { "ia".into() } else { name }));
    std::fs::write(f, format!("<!-- prompt (início) -->\n{}\n\n<!-- resposta da IA -->\n{}\n", prompt.chars().take(3000).collect::<String>(), text)).map_err(err)
}
fn civil(z: i64) -> (i64, u32, u32) { let z = z + 719_468; let era = z.div_euclid(146_097); let doe = z - era * 146_097; let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; let y = yoe + era * 400; let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); let mp = (5 * doy + 2) / 153; let d = (doy - (153 * mp + 2) / 5 + 1) as u32; let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; (if m <= 2 { y + 1 } else { y }, m, d) }

/// Textos grandes (texto extraído de cada livro): texts/<id>.txt
#[tauri::command]
fn text_get(state: State<AppState>, id: String) -> CmdResult<String> {
    Ok(std::fs::read_to_string(state.root.join("texts").join(format!("{}.txt", safe(&id)?))).unwrap_or_default())
}

#[tauri::command]
fn text_set(state: State<AppState>, id: String, text: String) -> CmdResult<()> {
    let dir = state.root.join("texts");
    std::fs::create_dir_all(&dir).map_err(err)?;
    std::fs::write(dir.join(format!("{}.txt", safe(&id)?)), text).map_err(err)
}

/// Copia um arquivo para o acervo; devolve {id, path, name, ext, size}.
#[tauri::command]
fn import_file(state: State<AppState>, src: String) -> CmdResult<Value> {
    let src = PathBuf::from(src);
    if !src.is_file() { return Err("arquivo não encontrado".into()); }
    let ext = src.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let id = format!("b{}", now_ms());
    let dir = state.root.join("files");
    std::fs::create_dir_all(&dir).map_err(err)?;
    let dest = dir.join(format!("{id}.{ext}"));
    std::fs::copy(&src, &dest).map_err(err)?;
    let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    Ok(serde_json::json!({
        "id": id, "path": dest.to_string_lossy(), "ext": ext, "size": size,
        "name": src.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
    }))
}

/// Salva bytes (ex.: miniatura PNG da capa, vinda do frontend em base64).
#[tauri::command]
fn save_b64(state: State<AppState>, name: String, b64: String) -> CmdResult<String> {
    use base64::Engine;
    let dir = state.root.join("images");
    std::fs::create_dir_all(&dir).map_err(err)?;
    let name: String = name.chars().filter(|c| c.is_ascii_alphanumeric() || "-_.".contains(*c)).collect();
    let p = dir.join(name);
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64.split(',').last().unwrap_or("")).map_err(err)?;
    std::fs::write(&p, bytes).map_err(err)?;
    Ok(p.to_string_lossy().to_string())
}

#[tauri::command]
fn remove_file(state: State<AppState>, path: String) -> CmdResult<()> {
    let p = PathBuf::from(&path);
    if !p.starts_with(&state.root) { return Err("fora do acervo".into()); }
    let _ = std::fs::remove_file(p);
    Ok(())
}

#[tauri::command]
fn write_b64(path: String, b64: String) -> CmdResult<()> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64.split(',').last().unwrap_or("")).map_err(err)?;
    std::fs::write(path, bytes).map_err(err)
}

/// PDF de uma página com uma imagem JPEG ocupando tudo (capa da KDP). Tamanho em polegadas.
#[tauri::command]
fn write_pdf_image(path: String, b64: String, w_in: f64, h_in: f64, px_w: u32, px_h: u32) -> CmdResult<()> {
    use base64::Engine;
    let jpg = base64::engine::general_purpose::STANDARD.decode(b64.split(',').last().unwrap_or("")).map_err(err)?;
    let (w, h) = (w_in * 72.0, h_in * 72.0);
    let content = format!("q {w:.3} 0 0 {h:.3} 0 0 cm /Im0 Do Q");
    let mut out: Vec<u8> = b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n".to_vec();
    let mut offs = vec![];
    let objs: Vec<Vec<u8>> = vec![
        b"<< /Type /Catalog /Pages 2 0 R >>".to_vec(),
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_vec(),
        format!("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w:.3} {h:.3}] /TrimBox [0 0 {w:.3} {h:.3}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>").into_bytes(),
        [format!("<< /Type /XObject /Subtype /Image /Width {px_w} /Height {px_h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {} >>\nstream\n", jpg.len()).into_bytes(), jpg, b"\nendstream".to_vec()].concat(),
        [format!("<< /Length {} >>\nstream\n", content.len()).into_bytes(), content.into_bytes(), b"\nendstream".to_vec()].concat(),
    ];
    for (i, o) in objs.iter().enumerate() {
        offs.push(out.len());
        out.extend(format!("{} 0 obj\n", i + 1).into_bytes()); out.extend(o); out.extend(b"\nendobj\n");
    }
    let x = out.len();
    out.extend(format!("xref\n0 {}\n0000000000 65535 f \n", objs.len() + 1).into_bytes());
    for o in offs { out.extend(format!("{o:010} 00000 n \n").into_bytes()); }
    out.extend(format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n", objs.len() + 1).into_bytes());
    std::fs::write(path, out).map_err(err)
}

#[tauri::command]
fn copy_file(src: String, dest: String) -> CmdResult<()> {
    std::fs::copy(src, dest).map(|_| ()).map_err(err)
}

#[tauri::command]
fn write_text_file(path: String, text: String) -> CmdResult<()> {
    std::fs::write(path, text).map_err(err)
}

/// Abre um site no navegador padrão (só https).
#[tauri::command]
fn open_url(url: String) -> CmdResult<()> {
    if !url.starts_with("https://") { return Err("só links https".into()); }
    #[cfg(target_os = "macos")] let _ = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(target_os = "windows")] { use std::os::windows::process::CommandExt; let _ = std::process::Command::new("cmd").args(["/C", "start", "", &url]).creation_flags(0x08000000).spawn(); }
    #[cfg(target_os = "linux")] let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
    Ok(())
}
#[tauri::command]
fn reveal(path: String) {
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg("-R").arg(&path).spawn();
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer").arg(format!("/select,{path}")).spawn();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--local-test") { local::cli_test(&args[2], &args[3]); return; }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let root = app.path().app_data_dir().expect("pasta de dados");
            std::fs::create_dir_all(&root)?;
            imglocal::kill_strays(&root); // gerador que ficou rodando de uma sessão anterior
            app.manage(AppState { root, claude: Mutex::new(None) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            data_dir, store_get, store_set, history_list, history_get, history_restore, gen_log, text_get, text_set, import_file, save_b64, remove_file, write_text_file, write_b64, write_pdf_image, copy_file, reveal,
            ai::secret_set, ai::secret_status, ai::ai_models, ai::ai_chat, ai::ai_cancel,
            ai::claude_status, ai::claude_chat, ai::claude_ping, ai::image_generate,
            epub::export_epub,
            local::local_models, local::local_download, local::local_download_cancel, local::local_delete, local::local_import, local::local_chat,
            backup::backup_export, backup::backup_import,
            imglocal::img_local_status, imglocal::img_local_download, imglocal::img_local_cancel, imglocal::img_local_generate, imglocal::img_local_preflight, open_url
        ])
        .build(tauri::generate_context!())
        .expect("erro ao iniciar o app")
        .run(|app, e| if let tauri::RunEvent::Exit = e { local::unload(); use tauri::Manager; imglocal::kill_strays(&app.state::<AppState>().root); });
}
