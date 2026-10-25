#!/bin/bash
# 下载并校验随包专业组件：TwelveMonkeys 在 Java 依赖中锁定，ExifTool 由本脚本
# 按官方发布归档的 SHA-256 锁定后组装到 professional-tools/。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOLS_ROOT="${TOOLS_ROOT:-$ROOT/professional-tools}"
DOWNLOAD_ROOT="${DOWNLOAD_ROOT:-$ROOT/.cache/professional-tools}"
EXIFTOOL_VERSION="13.59"
MAC_PKG_SHA256="b7c366eaa6ede74451177128b28e28c8df9ed0505e27ce4492cf5d05b4cc6618"
WIN_ZIP_SHA256="44b512b25af500724ba579d0a53c8fc5851628b692dd5e5d94ae4a15c2cba9ec"

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

download_verified() {
  local url="$1"
  local expected="$2"
  local archive="$3"
  mkdir -p "$(dirname "$archive")"
  if [ ! -f "$archive" ] || [ "$(sha256_file "$archive")" != "$expected" ]; then
    echo "[professional-tools] 下载 $url"
    curl -fSL --retry 3 -o "$archive" "$url"
  fi
  local actual
  actual="$(sha256_file "$archive")"
  if [ "$actual" != "$expected" ]; then
    echo "[professional-tools] SHA-256 校验失败：$archive" >&2
    echo "  expected=$expected" >&2
    echo "  actual=$actual" >&2
    exit 1
  fi
}

install_macos() {
  local archive="$DOWNLOAD_ROOT/ExifTool-${EXIFTOOL_VERSION}.pkg"
  local destination="$TOOLS_ROOT/exiftool/macos"
  download_verified \
    "https://sourceforge.net/projects/exiftool/files/ExifTool-${EXIFTOOL_VERSION}.pkg/download" \
    "$MAC_PKG_SHA256" "$archive"
  command -v xar >/dev/null || { echo "macOS 组装 ExifTool 需要 xar" >&2; exit 1; }
  command -v cpio >/dev/null || { echo "macOS 组装 ExifTool 需要 cpio" >&2; exit 1; }
  local extract="$DOWNLOAD_ROOT/pkg-extract"
  rm -rf "$extract" "$destination"
  mkdir -p "$extract" "$destination"
  (cd "$extract" && xar -xf "$archive")
  mkdir -p "$extract/root"
  (cd "$extract/root" && gzip -dc ../Payload | cpio -id >/dev/null 2>&1)
  cp "$extract/root/usr/local/bin/exiftool" "$destination/exiftool"
  cp -R "$extract/root/usr/local/bin/lib" "$destination/lib"
  chmod 755 "$destination/exiftool"
  "$destination/exiftool" -ver | grep -Fx "$EXIFTOOL_VERSION" >/dev/null
}

install_windows() {
  local archive="$DOWNLOAD_ROOT/exiftool-${EXIFTOOL_VERSION}_64.zip"
  local destination="$TOOLS_ROOT/exiftool/win-x64"
  download_verified \
    "https://sourceforge.net/projects/exiftool/files/exiftool-${EXIFTOOL_VERSION}_64.zip/download" \
    "$WIN_ZIP_SHA256" "$archive"
  command -v unzip >/dev/null || { echo "组装 Windows ExifTool 需要 unzip" >&2; exit 1; }
  local extract="$DOWNLOAD_ROOT/win-extract"
  rm -rf "$extract" "$destination"
  mkdir -p "$extract" "$destination"
  unzip -q "$archive" -d "$extract"
  cp -R "$extract/exiftool-${EXIFTOOL_VERSION}_64/exiftool_files" "$destination/exiftool_files"
  cp "$extract/exiftool-${EXIFTOOL_VERSION}_64/exiftool(-k).exe" "$destination/exiftool.exe"
}

TARGETS="${TARGETS:-}"
if [ -z "$TARGETS" ]; then
  case "$(uname -s)" in
    Darwin) TARGETS="macos" ;;
    MINGW*|MSYS*|Windows*) TARGETS="win-x64" ;;
    *) echo "请使用 TARGETS=macos 或 TARGETS=win-x64" >&2; exit 1 ;;
  esac
fi

mkdir -p "$TOOLS_ROOT"
for target in $TARGETS; do
  case "$target" in
    macos|macos-arm64|macos-x64) install_macos ;;
    win-x64) install_windows ;;
    *) echo "不支持的专业组件目标：$target" >&2; exit 1 ;;
  esac
done

cp "$ROOT/third-party/professional-components.json" "$TOOLS_ROOT/components.json"
echo "[professional-tools] 已组装到 $TOOLS_ROOT"
