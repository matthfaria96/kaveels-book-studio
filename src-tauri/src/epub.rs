//! Exporta um projeto como EPUB 3 (formato aceito pela Amazon KDP para ebooks).

use std::io::Write;
use serde::Deserialize;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

use crate::{err, now_ms, CmdResult};

#[derive(Deserialize)]
pub struct Chapter { title: String, html: String }

#[derive(Deserialize)]
pub struct Book {
    title: String,
    author: String,
    lang: Option<String>,
    description: Option<String>,
    publisher: Option<String>,
    cover: Option<String>,
    front: Option<String>,
    chapters: Vec<Chapter>,
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn page(title: &str, lang: &str, body: &str) -> String {
    format!(r#"<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="{lang}" lang="{lang}">
<head><meta charset="utf-8"/><title>{}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>{body}</body></html>"#, esc(title))
}

/// HTML do editor → XHTML válido (fecha <br>, <hr>, <img>; troca &nbsp;).
fn xhtml(h: &str) -> String {
    let mut s = h.replace("&nbsp;", "&#160;");
    for t in ["br", "hr"] {
        s = s.replace(&format!("<{t}>"), &format!("<{t}/>"));
    }
    s
}

#[tauri::command]
pub fn export_epub(book: Book, out: String) -> CmdResult<()> {
    let lang = book.lang.clone().filter(|l| !l.is_empty()).unwrap_or_else(|| "en".into());
    let uid = format!("urn:uuid:kbs-{}", now_ms());
    let f = std::fs::File::create(&out).map_err(err)?;
    let mut z = ZipWriter::new(f);
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    let def = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    z.start_file("mimetype", stored).map_err(err)?;
    z.write_all(b"application/epub+zip").map_err(err)?;
    z.start_file("META-INF/container.xml", def).map_err(err)?;
    z.write_all(br#"<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"#).map_err(err)?;

    let css = "body{font-family:serif;line-height:1.5;margin:0 5%}h1{text-align:center;margin:2em 0 1.5em;font-size:1.6em}p{text-indent:1.4em;margin:0}h1+p,p.first{text-indent:0}.title{text-align:center;margin-top:30%}.title h1{font-size:2.2em}.title p{text-indent:0;text-align:center}img.cover{max-width:100%}hr{border:0;text-align:center}hr:after{content:'* * *'}";
    z.start_file("OEBPS/style.css", def).map_err(err)?;
    z.write_all(css.as_bytes()).map_err(err)?;

    let mut manifest = String::from(r#"<item id="css" href="style.css" media-type="text/css"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>"#);
    let mut spine = String::new();
    let mut nav = String::new();
    let mut ncx = String::new();

    if let Some(c) = book.cover.as_ref().filter(|c| std::path::Path::new(c).is_file()) {
        let bytes = std::fs::read(c).map_err(err)?;
        let (ext, mime) = if c.to_lowercase().ends_with(".png") { ("png", "image/png") } else { ("jpg", "image/jpeg") };
        z.start_file(format!("OEBPS/cover.{ext}"), def).map_err(err)?;
        z.write_all(&bytes).map_err(err)?;
        manifest.push_str(&format!(r#"<item id="cover-img" href="cover.{ext}" media-type="{mime}" properties="cover-image"/><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>"#));
        spine.push_str(r#"<itemref idref="cover" linear="no"/>"#);
        z.start_file("OEBPS/cover.xhtml", def).map_err(err)?;
        z.write_all(page("Cover", &lang, &format!(r#"<div style="text-align:center"><img class="cover" src="cover.{ext}" alt="cover"/></div>"#)).as_bytes()).map_err(err)?;
    }

    let title_body = format!(r#"<div class="title"><h1>{}</h1><p>{}</p></div>{}"#, esc(&book.title), esc(&book.author), xhtml(book.front.as_deref().unwrap_or("")));
    z.start_file("OEBPS/title.xhtml", def).map_err(err)?;
    z.write_all(page(&book.title, &lang, &title_body).as_bytes()).map_err(err)?;
    manifest.push_str(r#"<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>"#);
    spine.push_str(r#"<itemref idref="title"/>"#);

    for (i, ch) in book.chapters.iter().enumerate() {
        let n = i + 1;
        let file = format!("ch{n:03}.xhtml");
        z.start_file(format!("OEBPS/{file}"), def).map_err(err)?;
        z.write_all(page(&ch.title, &lang, &format!("<h1>{}</h1>{}", esc(&ch.title), xhtml(&ch.html))).as_bytes()).map_err(err)?;
        manifest.push_str(&format!(r#"<item id="ch{n}" href="{file}" media-type="application/xhtml+xml"/>"#));
        spine.push_str(&format!(r#"<itemref idref="ch{n}"/>"#));
        nav.push_str(&format!(r#"<li><a href="{file}">{}</a></li>"#, esc(&ch.title)));
        ncx.push_str(&format!(r#"<navPoint id="n{n}" playOrder="{n}"><navLabel><text>{}</text></navLabel><content src="{file}"/></navPoint>"#, esc(&ch.title)));
    }

    z.start_file("OEBPS/nav.xhtml", def).map_err(err)?;
    z.write_all(page("Contents", &lang, &format!(r#"<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>{nav}</ol></nav>"#)).as_bytes()).map_err(err)?;
    z.start_file("OEBPS/toc.ncx", def).map_err(err)?;
    z.write_all(format!(r#"<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="{uid}"/></head><docTitle><text>{}</text></docTitle><navMap>{ncx}</navMap></ncx>"#, esc(&book.title)).as_bytes()).map_err(err)?;

    let modified = {
        let secs = (now_ms() / 1000) as i64;
        let days = secs / 86400;
        let z = days + 719468;
        let era = z.div_euclid(146097);
        let doe = z - era * 146097;
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        let y = yoe + era * 400 + i64::from(m <= 2);
        format!("{y:04}-{m:02}-{d:02}T00:00:00Z")
    };
    let opf = format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="{lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">{uid}</dc:identifier><dc:title>{}</dc:title><dc:creator>{}</dc:creator><dc:language>{lang}</dc:language>
<dc:publisher>{}</dc:publisher><dc:description>{}</dc:description><meta property="dcterms:modified">{modified}</meta><meta name="cover" content="cover-img"/>
</metadata>
<manifest>{manifest}</manifest>
<spine toc="ncx">{spine}</spine>
</package>"#, esc(&book.title), esc(&book.author), esc(book.publisher.as_deref().unwrap_or(&book.author)), esc(book.description.as_deref().unwrap_or("")));
    z.start_file("OEBPS/content.opf", def).map_err(err)?;
    z.write_all(opf.as_bytes()).map_err(err)?;
    z.finish().map_err(err)?;
    Ok(())
}
