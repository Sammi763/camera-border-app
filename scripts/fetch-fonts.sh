#!/bin/bash
# 下载并校验随包字体。字体只在构建阶段访问网络，运行时从安装包读取。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FONTS_ROOT="${FONTS_ROOT:-$ROOT/professional-tools/fonts}"
LICENSE_ROOT="${LICENSE_ROOT:-$ROOT/professional-tools/licenses/fonts}"
CACHE_ROOT="${FONT_CACHE_ROOT:-$ROOT/.cache/fonts}"

mkdir -p "$FONTS_ROOT" "$LICENSE_ROOT" "$CACHE_ROOT"

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

download_verified() {
  local url="$1"
  local expected="$2"
  local destination="$3"
  local archive="$CACHE_ROOT/$(basename "$destination")"

  if [ ! -f "$archive" ] || [ "$(sha256_file "$archive")" != "$expected" ]; then
    echo "[fonts] 下载 $url"
    curl -fSL --retry 3 -o "$archive" "$url"
  fi

  local actual
  actual="$(sha256_file "$archive")"
  if [ "$actual" != "$expected" ]; then
    echo "[fonts] SHA-256 校验失败：$destination" >&2
    echo "  expected=$expected" >&2
    echo "  actual=$actual" >&2
    exit 1
  fi
  cp "$archive" "$destination"
}

LXGW_COMMIT="50f4b182415a8c33d9a456df220b66a284e2509b"
LXGW_FONT_SHA256="39ad71264b588165b469e35e6afb162a378dacd1f95348160240ba9038ac3009"
LXGW_LICENSE_SHA256="1a25e35da1031c6c3436fde545bb9cb5aca954e9873afe510c834b8b79bd21a0"
CAVEAT_COMMIT="5e35378e6bda803962ee6fd257e444a7d459660d"
CAVEAT_FONT_SHA256="0bdb6b660482d31531b3945849fba5916b3ef8695da7024a9e6b9ee3c4157988"
CAVEAT_LICENSE_SHA256="1f9d81d094273d82f3898a1ee8b598a717d050ecbf5ff7bede105b704880157b"

download_verified \
  "https://raw.githubusercontent.com/lxgw/LxgwWenKai/${LXGW_COMMIT}/fonts/TTF/LXGWWenKai-Regular.ttf" \
  "$LXGW_FONT_SHA256" \
  "$FONTS_ROOT/LXGWWenKai-Regular.ttf"
download_verified \
  "https://raw.githubusercontent.com/lxgw/LxgwWenKai/${LXGW_COMMIT}/OFL.txt" \
  "$LXGW_LICENSE_SHA256" \
  "$LICENSE_ROOT/LXGW-WenKai-OFL.txt"
download_verified \
  "https://raw.githubusercontent.com/google/fonts/${CAVEAT_COMMIT}/ofl/caveat/Caveat%5Bwght%5D.ttf" \
  "$CAVEAT_FONT_SHA256" \
  "$FONTS_ROOT/Caveat-wght.ttf"
download_verified \
  "https://raw.githubusercontent.com/google/fonts/${CAVEAT_COMMIT}/ofl/caveat/OFL.txt" \
  "$CAVEAT_LICENSE_SHA256" \
  "$LICENSE_ROOT/Caveat-OFL.txt"

cat > "$FONTS_ROOT/fonts.json" <<EOF
{
  "schemaVersion": 1,
  "fonts": [
    {
      "id": "lxgw-wenkai",
      "family": "LXGW WenKai",
      "file": "LXGWWenKai-Regular.ttf",
      "license": "SIL OFL 1.1",
      "licenseFile": "licenses/fonts/LXGW-WenKai-OFL.txt",
      "sha256": "${LXGW_FONT_SHA256}",
      "source": "https://github.com/lxgw/LxgwWenKai/tree/${LXGW_COMMIT}"
    },
    {
      "id": "caveat",
      "family": "Caveat",
      "file": "Caveat-wght.ttf",
      "license": "SIL OFL 1.1",
      "licenseFile": "licenses/fonts/Caveat-OFL.txt",
      "sha256": "${CAVEAT_FONT_SHA256}",
      "source": "https://github.com/google/fonts/tree/${CAVEAT_COMMIT}/ofl/caveat"
    }
  ]
}
EOF

echo "[fonts] 已准备随包字体：$FONTS_ROOT"
