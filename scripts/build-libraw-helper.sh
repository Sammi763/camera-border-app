#!/bin/bash
# 构建随包 LibRaw helper（仅 macOS arm64 正式目标）。
#
# 版本、源码 URL 与 SHA-256 固定；构建产物写入 professional-tools/libraw/macos-arm64/。
# 运行时不下载、不搜索系统 PATH；开发机构建需要 clang、make、curl、tar、shasum。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="0.22.3"
SOURCE_SHA256="789f3c33466210a1a0907f747a97c715d21bbf4af712f257fcbbd90111b227e4"
URL="https://www.libraw.org/data/LibRaw-${VERSION}.tar.gz"
CACHE_ROOT="${LIBRAW_CACHE_ROOT:-$ROOT/.cache/libraw}"
SOURCE_DIR="$CACHE_ROOT/LibRaw-${VERSION}"
ARCH="${ARCH:-$(uname -m)}"
TOOLS_ROOT="$ROOT/professional-tools"
DESTINATION="$TOOLS_ROOT/libraw/macos-${ARCH}"
LICENSE_ROOT="$TOOLS_ROOT/licenses"
HELPER="$DESTINATION/film-raw-helper"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "[libraw] 当前脚本只支持 macOS 构建" >&2
  exit 1
fi
export MACOSX_DEPLOYMENT_TARGET=11.0
export CFLAGS="-O2 -g -mmacosx-version-min=11.0"
export CXXFLAGS="-O2 -g -mmacosx-version-min=11.0"
if [ "$ARCH" != "arm64" ]; then
  echo "[libraw] 本轮只登记 macOS arm64（收到 $ARCH）；x64 需单独验证" >&2
  exit 1
fi

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

download_verified() {
  local url="$1"
  local expected="$2"
  local archive="$3"
  mkdir -p "$(dirname "$archive")"
  if [ ! -f "$archive" ] || [ "$(sha256_file "$archive")" != "$expected" ]; then
    echo "[libraw] 下载固定源码 $url"
    curl -fSL --retry 3 -o "$archive" "$url"
  fi
  local actual
  actual="$(sha256_file "$archive")"
  if [ "$actual" != "$expected" ]; then
    echo "[libraw] 源码 SHA-256 校验失败" >&2
    echo "  expected=$expected" >&2
    echo "  actual=$actual" >&2
    exit 1
  fi
}

mkdir -p "$CACHE_ROOT" "$DESTINATION" "$LICENSE_ROOT"
ARCHIVE="$CACHE_ROOT/LibRaw-${VERSION}.tar.gz"
download_verified "$URL" "$SOURCE_SHA256" "$ARCHIVE"

if [ ! -f "$SOURCE_DIR/.camborder-built" ]; then
  rm -rf "$SOURCE_DIR"
  tar -xzf "$ARCHIVE" -C "$CACHE_ROOT"
  (
    cd "$SOURCE_DIR"
    ./configure \
      --prefix="$SOURCE_DIR/install" \
      --disable-shared \
      --disable-lcms \
      --disable-jpeg \
      CC=clang CXX=clang++ > configure.log 2>&1
    make -j4 lib/libraw.la > make.log 2>&1
    touch .camborder-built
  )
fi

MACOSX_DEPLOYMENT_TARGET=11.0 clang++ -std=c++17 -O2 \
  -I "$SOURCE_DIR" \
  "$ROOT/java-engine/src/main/native/film_raw_helper.cpp" \
  "$SOURCE_DIR/lib/.libs/libraw.a" -lz \
  -o "$HELPER"
chmod 755 "$HELPER"

VERSION_OUTPUT="$("$HELPER" --version)"
if [[ "$VERSION_OUTPUT" != film-raw-helper\ 1.1.0\ libraw\ ${VERSION}* ]]; then
  echo "[libraw] helper 版本输出不符合预期：$VERSION_OUTPUT" >&2
  exit 1
fi

cp "$SOURCE_DIR/LICENSE.LGPL" "$LICENSE_ROOT/LibRaw-LICENSE.LGPL.txt"
cp "$SOURCE_DIR/LICENSE.CDDL" "$LICENSE_ROOT/LibRaw-LICENSE.CDDL.txt"
if [ -f "$SOURCE_DIR/COPYRIGHT" ]; then
  cp "$SOURCE_DIR/COPYRIGHT" "$LICENSE_ROOT/LibRaw-COPYRIGHT.txt"
fi

BINARY_SHA256="$(sha256_file "$HELPER")"
cat > "$DESTINATION/helper.json" <<JSON
{
  "schemaVersion": 1,
  "component": "libraw",
  "helperVersion": "1.1.0",
  "librawVersion": "${VERSION}",
  "architecture": "macos-${ARCH}",
  "source": "${URL}",
  "sourceSha256": "${SOURCE_SHA256}",
  "binarySha256": "${BINARY_SHA256}",
  "license": "LGPL-2.1-only OR CDDL-1.0",
  "features": {
    "probe": true,
    "outputColor": "linear-camera-rgb",
    "outputBits": 16,
    "cropModes": ["vendor-inset", "full-sensor"],
    "orientationReported": true
  }
}
JSON

echo "[libraw] helper: $HELPER"
echo "[libraw] version: $VERSION_OUTPUT"
echo "[libraw] sha256: $BINARY_SHA256"
