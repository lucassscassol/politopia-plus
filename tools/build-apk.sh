#!/usr/bin/env bash
# Chamas de Vardren — gera o APK Android (WebView em tela cheia com o jogo empacotado, funciona offline).
#
# Não usa Gradle nem o SDK do Google: só as ferramentas Android empacotadas no Ubuntu/Debian.
#   sudo apt-get install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23 openjdk-17-jdk-headless
#
# Uso: tools/build-apk.sh            → dist/ChamasDeVardren-<versão>.apk
# Assinatura: por padrão usa android/vardren-debug.keystore (chave pública de desenvolvimento, senha "vardren"),
# para que versões novas instalem por cima da antiga sem apagar as partidas salvas. Para outra chave:
#   VARDREN_KEYSTORE=/caminho/chave.jks VARDREN_KEY_ALIAS=alias VARDREN_KEY_PASS=senha tools/build-apk.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AND="$ROOT/android"
OUT="$ROOT/build/apk"
DIST="$ROOT/dist"
SDK_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
KEYSTORE="${VARDREN_KEYSTORE:-$AND/vardren-debug.keystore}"
KEY_ALIAS="${VARDREN_KEY_ALIAS:-vardren}"
KEY_PASS="${VARDREN_KEY_PASS:-vardren}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Falta a ferramenta '$1'. Veja o cabeçalho deste script." >&2; exit 1; }; }
for t in aapt zipalign apksigner dalvik-exchange javac python3; do need "$t"; done
[ -f "$SDK_JAR" ] || { echo "android.jar não encontrado em $SDK_JAR (pacote android-sdk-platform-23 ou ANDROID_JAR=...)" >&2; exit 1; }

VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$ROOT/package.json")"
IFS=. read -r MAJ MIN PAT <<<"$VERSION"
VCODE=$(( MAJ * 10000 + MIN * 100 + PAT ))
APK="$DIST/ChamasDeVardren-$VERSION.apk"
echo "Chamas de Vardren $VERSION (versionCode $VCODE)"

rm -rf "$OUT"
mkdir -p "$OUT/assets/www/fonts" "$OUT/classes" "$OUT/dex" "$DIST"

# 1. Jogo: os mesmos arquivos da versão web, com as fontes locais no lugar do Google Fonts
cp -R "$ROOT/index.html" "$ROOT/manifest.webmanifest" "$ROOT/css" "$ROOT/js" "$ROOT/assets" "$OUT/assets/www/"
cp "$AND"/fonts/*.woff2 "$AND"/fonts/fonts.css "$AND"/fonts/OFL-*.txt "$OUT/assets/www/fonts/"
python3 - "$OUT/assets/www/index.html" <<'PY'
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

# 2. Código Java → classes.dex
javac -nowarn -encoding UTF-8 --release 8 -cp "$SDK_JAR" -d "$OUT/classes" \
  $(find "$AND/src" -name '*.java') 2>&1 | grep -v 'bootstrap classpath\|obsolete\|-Xlint:-options' || true
[ -n "$(find "$OUT/classes" -name '*.class')" ] || { echo "javac falhou" >&2; exit 1; }
dalvik-exchange --dex --min-sdk-version=21 --output="$OUT/dex/classes.dex" "$OUT/classes"

# 3. Recursos + manifesto + assets → APK sem assinatura (resources.arsc sem compressão, exigido no Android 11+)
aapt package -f -M "$AND/AndroidManifest.xml" -S "$AND/res" -A "$OUT/assets" -I "$SDK_JAR" \
  --version-code "$VCODE" --version-name "$VERSION" -0 arsc -F "$OUT/unsigned.apk"
(cd "$OUT/dex" && aapt add -f "$OUT/unsigned.apk" classes.dex >/dev/null)

# 4. Alinhamento e assinatura (v1 + v2 + v3)
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
if [ ! -f "$KEYSTORE" ]; then
  echo "Criando a chave $KEYSTORE"
  keytool -genkeypair -keystore "$KEYSTORE" -storetype PKCS12 -alias "$KEY_ALIAS" -keyalg RSA -keysize 2048 \
    -validity 10950 -storepass "$KEY_PASS" -keypass "$KEY_PASS" -dname "CN=Chamas de Vardren, O=Vardren, C=BR"
fi
apksigner sign --ks "$KEYSTORE" --ks-key-alias "$KEY_ALIAS" --ks-pass "pass:$KEY_PASS" --key-pass "pass:$KEY_PASS" \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --out "$APK" "$OUT/aligned.apk"
apksigner verify "$APK"
zipalign -c -p 4 "$APK"

echo "APK pronto: ${APK#$ROOT/} ($(du -h "$APK" | cut -f1))"
