//! Backup: exporta/importa tudo (acervo, textos, projetos, configurações) num .zip.
//! Os modelos de IA local ficam de fora (são grandes e podem ser baixados de novo).

use std::{io::{Read, Write}, path::Path};
use tauri::State;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

use crate::{err, AppState, CmdResult};

fn walk(root: &Path, dir: &Path, out: &mut Vec<std::path::PathBuf>) {
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                if p.file_name().map_or(false, |n| n == "models" || n == "EBWebView") { continue; }
                walk(root, &p, out);
            } else { out.push(p); }
        }
    }
}

#[tauri::command]
pub async fn backup_export(state: State<'_, AppState>, out: String, with_keys: bool) -> CmdResult<u64> {
    let root = state.root.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut files = Vec::new();
        walk(&root, &root, &mut files);
        let mut z = ZipWriter::new(std::fs::File::create(&out).map_err(err)?);
        let opt = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated).large_file(true);
        let mut n = 0;
        for f in files {
            let rel = f.strip_prefix(&root).map_err(err)?.to_string_lossy().replace('\\', "/");
            if rel == "secrets.json" && !with_keys { continue; }
            if rel.ends_with(".part") || rel.ends_with(".tmp") { continue; }
            z.start_file(rel, opt).map_err(err)?;
            z.write_all(&std::fs::read(&f).map_err(err)?).map_err(err)?;
            n += 1;
        }
        z.finish().map_err(err)?;
        Ok(n)
    }).await.map_err(err)?
}

/// Restaura um backup. Os caminhos absolutos gravados nos JSON são trocados para a pasta deste computador.
#[tauri::command]
pub async fn backup_import(state: State<'_, AppState>, src: String) -> CmdResult<u64> {
    let root = state.root.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut z = ZipArchive::new(std::fs::File::open(&src).map_err(err)?).map_err(err)?;
        if z.by_name("data/library.json").is_err() { return Err("Esse arquivo não parece um backup do Book Studio".into()); }
        let mut n = 0;
        for i in 0..z.len() {
            let mut f = z.by_index(i).map_err(err)?;
            let Some(rel) = f.enclosed_name() else { continue };
            let dest = root.join(rel);
            if let Some(d) = dest.parent() { std::fs::create_dir_all(d).map_err(err)?; }
            let mut buf = Vec::new();
            f.read_to_end(&mut buf).map_err(err)?;
            std::fs::write(&dest, buf).map_err(err)?;
            n += 1;
        }
        // corrige caminhos de outro computador: .../files/x.pdf → <root>/files/x.pdf
        let lib = root.join("data/library.json");
        if let Ok(s) = std::fs::read_to_string(&lib) {
            let r = root.to_string_lossy().replace('\\', "/");
            let re_fix = |s: &str, key: &str| -> String {
                let mut out = String::new();
                for (i, part) in s.split(&format!("\"{key}\": \"")).enumerate() {
                    if i == 0 { out.push_str(part); continue; }
                    out.push_str(&format!("\"{key}\": \""));
                    let end = part.find('"').unwrap_or(0);
                    let val = &part[..end];
                    let fixed = ["/files/", "/images/"].iter().find_map(|m| val.rfind(m).map(|k| format!("{r}{}", &val[k..]))).unwrap_or(val.to_string());
                    out.push_str(&fixed);
                    out.push_str(&part[end..]);
                }
                out
            };
            let s = re_fix(&re_fix(&s, "path"), "front");
            let _ = std::fs::write(&lib, s);
        }
        Ok(n)
    }).await.map_err(err)?
}
