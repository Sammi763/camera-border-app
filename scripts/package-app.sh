#!/bin/bash
# 一键打包桌面应用：前端产物 + 引擎 jar + 随包 Java Runtime -> electron-builder。
#
# 用法：
#   bash scripts/package-app.sh              # 当前平台默认架构
#   ARCH=arm64 bash scripts/package-app.sh   # macOS 指定架构（arm64 / x64）
#   TARGET_OS=win ARCH=x64 bash scripts/package-app.sh  # 在 macOS 上交叉构建 Windows x64
#
# 前置条件：
#   - Node/pnpm、JDK+Maven（构建机需要；最终用户不需要）
#   - 已执行 bash scripts/fetch-runtime.sh 下载对应平台的 Java Runtime
#     （TARGETS="macos-arm64 macos-x64 win-x64" 可一次拉全）
#
# 产物：
#   electron/release/*.dmg（macOS arm64/x64）、*.exe（Windows x64）

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$ROOT/electron/runtime-bundle"

# ---- 目标平台/架构 ---------------------------------------------------------
HOST_OS="$(uname -s)"
TARGET_OS="${TARGET_OS:-}"
if [ -z "$TARGET_OS" ]; then
  case "$HOST_OS" in
    Darwin) TARGET_OS="macos" ;;
    MINGW*|MSYS*|Windows*) TARGET_OS="win" ;;
    *) echo "暂不支持的平台：${HOST_OS}（首批目标为 macOS 与 Windows）" >&2; exit 1 ;;
  esac
fi

case "$TARGET_OS" in
  macos|darwin) OS_TAG="macos" ;;
  win|windows) OS_TAG="win" ;;
  *) echo "不支持的目标平台：${TARGET_OS}（可选 macos 或 win）" >&2; exit 1 ;;
esac

ARCH="${ARCH:-}"
if [ -z "$ARCH" ]; then
  if [ "$OS_TAG" = "win" ]; then
    ARCH="x64"
  else
    case "$(uname -m)" in
      arm64) ARCH="arm64" ;;
      x86_64) ARCH="x64" ;;
      *) echo "无法识别的架构：$(uname -m)" >&2; exit 1 ;;
    esac
  fi
fi

if [ "$OS_TAG" = "win" ] && [ "$ARCH" != "x64" ]; then
  echo "Windows 当前只支持 x64 随包运行时，收到架构：${ARCH}" >&2
  exit 1
fi
if [ "$OS_TAG" = "macos" ] && [ "$ARCH" != "arm64" ] && [ "$ARCH" != "x64" ]; then
  echo "macOS 当前只支持 arm64 或 x64，收到架构：${ARCH}" >&2
  exit 1
fi

RUNTIME_KEY="${OS_TAG}-${ARCH}"
RUNTIME_DIR="$ROOT/runtime/$RUNTIME_KEY"

echo "[package] 目标平台：$RUNTIME_KEY"

# ---- 前置检查 --------------------------------------------------------------
if [ ! -d "$RUNTIME_DIR" ] || [ -z "$(ls -A "$RUNTIME_DIR")" ]; then
  echo "[package] 缺少 Java Runtime：$RUNTIME_DIR" >&2
  echo "  请先执行 TARGETS=$RUNTIME_KEY bash scripts/fetch-runtime.sh" >&2
  exit 1
fi

# ---- 1. 前端产物 -----------------------------------------------------------
echo "[package] 构建前端产物..."
pnpm --filter frontend build

# ---- 2. 引擎 jar ----------------------------------------------------------
bash "$ROOT/scripts/build-engine.sh"

# ---- 3. 组装打包资源目录 ---------------------------------------------------
echo "[package] 组装打包资源目录：$BUNDLE"
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE"

cp -R "$ROOT/frontend/dist" "$BUNDLE/frontend"
cp "$ROOT/java-engine/target/camera-border-engine.jar" "$BUNDLE/java-engine.jar"
cp -R "$RUNTIME_DIR" "$BUNDLE/java-runtime"

# 随包 LibRaw 原生程序（RAW 真实显影）；只取与当前目标平台-架构匹配的产物，
# 避免先构建 arm64 再打 x64 包时把错误架构的二进制带进安装包。
# 产物约定：scripts/build-libraw.sh 输出到 dist-libraw/<platform>-<arch>/。
LIBRAW_BIN_NAME="camborder-libraw-sampler"
[ "$OS_TAG" = "win" ] && LIBRAW_BIN_NAME="${LIBRAW_BIN_NAME}.exe"
LIBRAW_SRC_DIR="$ROOT/dist-libraw/${RUNTIME_KEY}"
LIBRAW_BIN="$LIBRAW_SRC_DIR/$LIBRAW_BIN_NAME"
if [ -f "$LIBRAW_BIN" ]; then
  mkdir -p "$BUNDLE/libraw"
  cp "$LIBRAW_BIN" "$BUNDLE/libraw/"
  echo "[package] 携带 LibRaw 原生程序：$RUNTIME_KEY ($LIBRAW_BIN)"
else
  # 防御性扫描：检测旧版扁平目录或非匹配架构的产物，避免漏装/错装
  STALE_FOUND=0
  for d in "$ROOT"/dist-libraw/*/; do
    [ -d "$d" ] || continue
    dir_name="$(basename "$d")"
    if [ "$dir_name" != "$RUNTIME_KEY" ] && [ -f "$d/$LIBRAW_BIN_NAME" ]; then
      STALE_FOUND=1
      echo "[package] 警告：dist-libraw/$dir_name/ 存在 LibRaw 产物但与当前目标 $RUNTIME_KEY 不匹配，已忽略以防止架构错装" >&2
    fi
  done
  if [ "$STALE_FOUND" -eq 0 ]; then
    echo "[package] 未发现 $RUNTIME_KEY 的 LibRaw 产物，RAW 将降级为嵌入预览（可运行 bash scripts/build-libraw.sh 构建）"
  fi
fi

# 清理运行时中的无用文件，缩小安装包体积
find "$BUNDLE/java-runtime" -name "*.dSYM" -type d -exec rm -rf {} + 2>/dev/null || true
rm -f "$BUNDLE/java-runtime/"NEWS "$BUNDLE/java-runtime/"README "$BUNDLE/java-runtime/"release 2>/dev/null || true

# ---- 4. electron-builder --------------------------------------------------
echo "[package] electron-builder 打包（$OS_TAG ${ARCH}，宿主 ${HOST_OS}）..."
cd "$ROOT/electron"
npx tsc -p tsconfig.json

BUILD_ARCH="$ARCH"
if [ "$OS_TAG" = "win" ]; then
  BUILD_ARCH="x64"
fi

BUILDER_PLATFORM="--mac"
if [ "$OS_TAG" = "win" ]; then
  BUILDER_PLATFORM="--win"
fi

npx electron-builder --config electron-builder.yml "$BUILDER_PLATFORM" --"$BUILD_ARCH" --publish never

echo "[package] 完成。产物位于 electron/release/"
ls -1 "$ROOT/electron/release" 2>/dev/null || true
