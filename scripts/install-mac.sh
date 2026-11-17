#!/bin/zsh
# Gera o app em release e instala em /Applications.
set -e
cd "$(dirname "$0")/.."
npx tauri build --bundles app
APP=$(ls -d src-tauri/target/release/bundle/macos/*.app | head -1)
NAME=$(basename "$APP")
codesign --force --deep -s - "$APP" || true
osascript -e "quit app \"${NAME%.app}\"" 2>/dev/null || true
rm -rf "/Applications/$NAME"
cp -R "$APP" /Applications/
echo "Instalado: /Applications/$NAME"
