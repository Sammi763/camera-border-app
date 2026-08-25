#!/bin/bash
# 下载随包分发的 Java Runtime（Temurin JRE）到 runtime/<platform>-<arch>/。
#
# 用法：
#   bash scripts/fetch-runtime.sh                 # 下载当前平台架构
#   TARGETS="macos-arm64 macos-x64 win-x64" bash scripts/fetch-runtime.sh
#
# 运行时布局（与 electron/src/engine/engineRuntime.ts 的解析一致）：
#   runtime/macos-*/Contents/Home/bin/java        （macOS JDK 目录结构）
#   runtime/win-x64/bin/java.exe                  （Windows）
#
# 干净机器产物不依赖本机 Java：打包前必须先执行本脚本。
#
# SHA-256 校验：
#   正式发布建议为每个目标预先提供 SHA-256（来源：Temurin release 页 checksum 文件）。
#   通过环境变量 RUNTIME_SHA256_<target>（target 中的 - 替换为 _）传入；启用后会
#   校验下载归档的哈希，不匹配则中止，防止下载内容被替换或损坏。
#   示例：RUNTIME_SHA256_MACOS_ARM64=abc... bash scripts/fetch-runtime.sh
#   开发期未提供时允许跳过；发布流水线应设置 REQUIRE_RUNTIME_SHA256=1，
#   未提供任何目标 hash 时脚本会直接失败。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_ROOT="$ROOT/runtime"

# shellcheck source=lib/runtime-extract.sh
source "$ROOT/scripts/lib/runtime-extract.sh"

# Temurin JRE 11（与 java-engine pom.xml 的 Java 版本一致）的最新 GA 版本号
# 如需固定版本，覆盖以下变量即可
JRE_VERSION="${JRE_VERSION:-11.0.25+9}"
JRE_RELEASE="${JRE_RELEASE:-jdk11u}"

# 平台 -> Temurin 归档名映射
archive_name() {
  case "$1" in
    macos-arm64) echo "OpenJDK11U-jre_aarch64_mac_hotspot_$(echo "$JRE_VERSION" | tr '+' '_')" ;;
    macos-x64)   echo "OpenJDK11U-jre_x64_mac_hotspot_$(echo "$JRE_VERSION" | tr '+' '_')" ;;
    win-x64)     echo "OpenJDK11U-jre_x64_windows_hotspot_$(echo "$JRE_VERSION" | tr '+' '_')" ;;
    *) echo "未知平台: $1" >&2; return 1 ;;
  esac
}

download_one() {
  local target="$1"
  local name dir url archive
  name="$(archive_name "$target")" || return 1
  dir="$RUNTIME_ROOT/$target"

  if [ -d "$dir" ] && [ -n "$(ls -A "$dir" 2>/dev/null)" ]; then
    echo "[runtime] $target 已存在，跳过下载（删除目录可强制重新下载）"
    return 0
  fi

  url="https://github.com/adoptium/temurin11-binaries/releases/download/jdk-${JRE_VERSION}/${name}.tar.gz"
  [ "$target" = "win-x64" ] && url="${url%.tar.gz}.zip"

  archive="$RUNTIME_ROOT/$(basename "$url")"
  mkdir -p "$RUNTIME_ROOT"
  echo "[runtime] 下载 $url"
  curl -fSL --retry 3 -o "$archive" "$url"

  verify_runtime_archive "$archive" "$target"

  echo "[runtime] 解压到 $dir"
  mkdir -p "$dir"
  # 解压并去掉压缩包顶层目录（Temurin 归档内含 jdk-xx-jre/ 一层目录），
  # 最终布局必须与 electron/src/engine/engineRuntime.ts 的解析一致：
  #   macos-*: runtime/<target>/Contents/Home/bin/java
  #   win-x64: runtime/<target>/bin/java.exe
  if [ "$target" = "win-x64" ]; then
    extract_dir="$RUNTIME_ROOT/.extract-$target"
    rm -rf "$extract_dir"
    mkdir -p "$extract_dir"
    unzip -q "$archive" -d "$extract_dir"
    strip_top_level_dir "$extract_dir" "$dir"
    rm -rf "$extract_dir"
  else
    tar -xzf "$archive" -C "$dir" --strip-components=1
  fi
  rm -f "$archive"

  verify_runtime_layout "$target" "$dir"

  # macOS 移除隔离属性，避免 Gatekeeper 拦截随包 java 可执行文件
  if [ "$target" = "macos-arm64" ] || [ "$target" = "macos-x64" ]; then
    xattr -cr "$dir" 2>/dev/null || true
  fi

  echo "[runtime] $target 就绪"
}

TARGETS="${TARGETS:-}"
if [ -z "$TARGETS" ]; then
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) TARGETS="macos-arm64" ;;
    Darwin-x86_64) TARGETS="macos-x64" ;;
    MINGW*|MSYS*|Windows*) TARGETS="win-x64" ;;
    *) echo "[runtime] 无法识别的平台 $(uname -s)-$(uname -m)，请用 TARGETS= 显式指定" >&2; exit 1 ;;
  esac
fi

for t in $TARGETS; do
  download_one "$t"
done

echo "[runtime] 完成。可用运行时："
ls -1 "$RUNTIME_ROOT" 2>/dev/null || true
