# Kaveel's Book Studio

A desktop app (macOS + Windows, built with Tauri 2 + Rust + TypeScript) for writing horror books in the style of author Kaveel Lilmohun and publishing them on Amazon KDP.

## Features
- **Library**: every book with its cover, status and quick actions.
- **Studio**: an editor with chapters, characters, an idea board, a story map and analysis. A switch flips between **Edit mode** and **Amazon (KDP) mode**.
- **AI writing (optional)**: Claude (through your logged-in Claude Code), ChatGPT or Gemini. The chat always works on the book that is open.
- **Style**: an analysis of the author's voice, vocabulary, characters and structure, plus a checker for new text.
- **KDP export**: EPUB, full-wrap cover (PNG/PDF/layered PSD) and all the listing metadata.
- **Reader**, references, a light/dark/custom theme and an English/Portuguese UI.

All data stays on your computer. API keys are stored locally and never leave the app.

## Download

**macOS (Apple Silicon)**
```bash
curl -L -o ~/Downloads/KaveelsBookStudio.dmg https://github.com/matthfaria96/kaveels-book-studio/releases/latest/download/KaveelsBookStudio-mac.dmg && open ~/Downloads/KaveelsBookStudio.dmg
```
Drag the app to Applications. The app is not signed, so the first time run:
```bash
xattr -cr "/Applications/Kaveel's Book Studio.app"
```

**Windows (PowerShell)**
```powershell
iwr https://github.com/matthfaria96/kaveels-book-studio/releases/latest/download/KaveelsBookStudio-windows-setup.exe -OutFile $env:TEMP\kbs.exe; & $env:TEMP\kbs.exe
```

Or get the files from the [Releases page](https://github.com/matthfaria96/kaveels-book-studio/releases).

## Build from source
Requirements: Node 20+ and Rust (stable).
```bash
npm install
npm run app          # dev mode
npx tauri build      # installer in src-tauri/target/release/bundle
```
On macOS, `npm run install_app` builds and installs the app into /Applications.

Data folder: `~/Library/Application Support/app.kaveels.bookstudio` (macOS) or `%APPDATA%\app.kaveels.bookstudio` (Windows).

## License
MIT
