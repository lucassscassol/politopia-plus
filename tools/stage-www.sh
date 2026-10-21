#!/usr/bin/env bash
# Chamas de Vardren — copia o jogo para dentro de um app Android: os mesmos arquivos da versão web, com as fontes
# locais no lugar do Google Fonts (o app funciona offline). Usado por tools/build-apk.sh (APK avulso) e pelo projeto
# Gradle da Play Store (android/play).
#
# Uso: tools/stage-www.sh <pasta de destino>   (a pasta é recriada; o jogo fica em <destino>/index.html)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AND="$ROOT/android"
WWW="${1:?uso: tools/stage-www.sh <pasta de destino>}"

rm -rf "$WWW"
mkdir -p "$WWW/fonts"
cp -R "$ROOT/index.html" "$ROOT/manifest.webmanifest" "$ROOT/css" "$ROOT/js" "$ROOT/assets" "$WWW/"
cp "$AND"/fonts/*.woff2 "$AND"/fonts/fonts.css "$AND"/fonts/OFL-*.txt "$WWW/fonts/"
python3 - "$WWW/index.html" <<'PY'
import re, sys
p = sys.argv[1]
html = open(p, encoding='utf-8').read()
html, n = re.subn(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com/[^"]*">', '<link rel="stylesheet" href="fonts/fonts.css">', html)
if n != 1: sys.exit('index.html: link do Google Fonts não encontrado')
html = re.sub(r'\s*<link rel="preconnect" href="https://fonts\.[^"]*"( crossorigin)?>', '', html)
html = re.sub(r'\s*<link rel="manifest" href="[^"]*">', '', html)
if 'https://' in re.sub(r'<!--.*?-->', '', html, flags=re.S).split('<body')[0]:
    sys.exit('index.html: ainda há recursos remotos no <head>')
open(p, 'w', encoding='utf-8').write(html)
PY
