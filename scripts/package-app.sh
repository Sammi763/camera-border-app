#!/bin/bash
# 一键打包桌面应用：前端产物 + 引擎 jar + 随包 Java Runtime -> electron-builder。
#
# 用法：
#   bash scripts/package-app.sh              # 当前平台默认架构
#   ARCH=arm64 bash scripts/package-app.sh   # macOS 指定架构（arm64 / x64）
#   TARGET_OS=win ARCH=x64 bash scripts/package-app.sh  # Windows x64
#
# 前置条件：
#   - Node/pnpm、JDK+Maven（构建机需要；最终用户不需要）
#   - 已执行 bash scripts/fetch-runtime.sh 下载对应平台的 Java Runtime
#     （TARGETS="macos-arm64 macos-x64 win-x64" 可一次拉全）
#
# 产物：
#   electron/release/macos-*/Camera-Border-*.dmg
#   electron/release/win-x64/Camera-Border-Setup-*.exe

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
OUTPUT_DIR="$ROOT/electron/release/$RUNTIME_KEY"
PACKAGE_VERSION="$(node -p 'require("./electron/package.json").version')"

echo "[package] 目标平台：$RUNTIME_KEY"

# ---- 前置检查 --------------------------------------------------------------
if [ ! -d "$RUNTIME_DIR" ] || [ -z "$(ls -A "$RUNTIME_DIR")" ]; then
  echo "[package] 缺少 Java Runtime：$RUNTIME_DIR" >&2
  echo "  请先执行 TARGETS=$RUNTIME_KEY bash scripts/fetch-runtime.sh" >&2
  exit 1
fi

case "$OUTPUT_DIR" in
  "$ROOT/electron/release/"*) ;;
  *) echo "内部错误：输出目录不在 electron/release 下：$OUTPUT_DIR" >&2; exit 1 ;;
esac

# 每个平台/架构使用独立输出目录，避免旧版本、旧中文包或其它架构产物混入交付目录。
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

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

if [ "$OS_TAG" = "win" ]; then
  node "$ROOT/scripts/validate-windows-package.mjs" --bundle "$BUNDLE"
fi

# 清理运行时中的无用文件，缩小安装包体积
find "$BUNDLE/java-runtime" -name "*.dSYM" -type d -exec rm -rf {} + 2>/dev/null || true
rm -f "$BUNDLE/java-runtime/"NEWS "$BUNDLE/java-runtime/"README "$BUNDLE/java-runtime/"release 2>/dev/null || true

# ---- 4. electron-builder --------------------------------------------------
echo "[package] electron-builder 打包（$OS_TAG ${ARCH}，宿主 ${HOST_OS}）..."
cd "$ROOT/electron"
npx tsc -p tsconfig.json

# 先用仓库内的确定性生成器创建视觉源 ICO，不依赖被忽略的本机遗留产物。
node "$ROOT/scripts/create-windows-icon.mjs" "$ROOT/electron/build/icon.ico"
if [ "$OS_TAG" != "win" ]; then
  # macOS 使用与 Windows 相同视觉源生成正式 ICNS。
  node "$ROOT/scripts/create-mac-icon.mjs" "$ROOT/electron/build/icon.ico" "$ROOT/electron/build/icon.icns"
fi

BUILD_ARCH="$ARCH"
if [ "$OS_TAG" = "win" ]; then
  BUILD_ARCH="x64"
fi

BUILDER_PLATFORM="--mac"
if [ "$OS_TAG" = "win" ]; then
  BUILDER_PLATFORM="--win"
fi

# ---- 代码签名 ---------------------------------------------------------------
# electron-builder 通过环境变量读取证书自动签名：
#   - macOS：CSC_LINK / CSC_KEY_PASSWORD（Developer ID Application .p12）；
#            公证另设 APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID
#   - Windows：CSC_LINK / CSC_KEY_PASSWORD（代码签名证书 .p12）
# 签名策略：
# - 提供 CSC_LINK + CSC_KEY_PASSWORD → 允许正式签名（macOS 与 Windows 都启用）；
# - FORCE_UNSIGNED=1（由 workflow / 调用方明确控制，如 Windows 冒烟测试包）→ 强制未签名，
#   清除签名环境变量并关闭自动发现，不生成自签名证书，也不修改 Windows 安全策略；
# - 未提供证书且未强制未签名：macOS 本地未签名（adhoc），Windows 未签名测试包。
SIGN_FLAGS=()
FORCE_UNSIGNED="${FORCE_UNSIGNED:-0}"
if [ "$FORCE_UNSIGNED" = "1" ] || [ "$FORCE_UNSIGNED" = "true" ]; then
  if [ "$OS_TAG" = "macos" ]; then
    SIGN_FLAGS+=(--config.mac.identity=null)
  fi
  unset CSC_LINK CSC_KEY_PASSWORD WIN_CSC_LINK WIN_CSC_KEY_PASSWORD
  export CSC_IDENTITY_AUTO_DISCOVERY=false
  echo "[package] FORCE_UNSIGNED=1：生成未签名测试包（${OS_TAG}；SmartScreen/Gatekeeper 需手动放行）"
elif [ -n "${CSC_LINK:-}" ] && [ -n "${CSC_KEY_PASSWORD:-}" ]; then
  echo "[package] 检测到代码签名证书（CSC_LINK/CSC_KEY_PASSWORD），本次构建将启用正式签名（${OS_TAG}）"
elif [ "$OS_TAG" = "macos" ]; then
  SIGN_FLAGS+=(--config.mac.identity=null)
  echo "[package] 未配置 CSC_LINK，macOS 使用本地未签名（adhoc）构建；"
  echo "         正式分发请设置 CSC_LINK/CSC_KEY_PASSWORD（并视需要设置公证 APPLE_* 环境变量）"
else
  echo "[package] 未配置 CSC_LINK，Windows 生成未签名测试包（SmartScreen 需手动放行）"
fi

BUILDER_ARGS=(
  --config electron-builder.yml
  "$BUILDER_PLATFORM"
  --"$BUILD_ARCH"
  --publish never
  "-c.directories.output=$OUTPUT_DIR"
)
if [ "${#SIGN_FLAGS[@]}" -gt 0 ]; then
  BUILDER_ARGS+=("${SIGN_FLAGS[@]}")
fi
npx electron-builder "${BUILDER_ARGS[@]}"

if [ "$OS_TAG" = "win" ]; then
  # 写入完整 40 位 commit（git rev-parse HEAD），不得用短 hash 或附加 -dirty，
  # 便于验收方把 manifest.commit 与本阶段 HEAD 精确比对。
  if ! COMMIT="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null)"; then
    echo "无法读取当前 HEAD commit，Windows manifest 拒绝继续生成" >&2
    exit 1
  fi
  if [[ ! "$COMMIT" =~ ^[0-9a-fA-F]{40}$ ]]; then
    echo "当前 HEAD commit 不是完整 40 位 hash，Windows manifest 拒绝继续生成：$COMMIT" >&2
    exit 1
  fi
  node "$ROOT/scripts/validate-windows-package.mjs" \
    --output "$OUTPUT_DIR" \
    --version "$PACKAGE_VERSION" \
    --commit "$COMMIT"
fi

echo "[package] 完成。产物位于 $OUTPUT_DIR"
ls -1 "$OUTPUT_DIR" 2>/dev/null || true
