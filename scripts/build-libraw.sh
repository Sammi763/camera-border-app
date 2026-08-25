#!/bin/bash
# 构建 LibRaw 原生显影程序（camborder-libraw-sampler）。
#
# 用法：
#   bash scripts/build-libraw.sh              # 输出到 dist-libraw/<当前平台-架构>/
#   bash scripts/build-libraw.sh <输出目录>   # 自定义输出目录
#
# 步骤：检测当前平台/架构 → 克隆 LibRaw（固定 tag）→ 编译静态库 → 编译封装
# （native/libraw_sampler.cpp）→ 产物放入 dist-libraw/<platform>-<arch>/。
#
# 重要：产物按「平台-架构」分目录存放，避免先构建 arm64 再打 x64 包时把
# 错误架构的 LibRaw 程序带进安装包。打包脚本（package-app.sh）只取与
# 当前目标平台-架构匹配的子目录。
#
# 依赖：git、C++ 编译工具链（macOS: clang/Xcode CLT；Windows: MSVC 或 MinGW-w64）。
# 许可证说明：LibRaw 采用 LGPL-2.1 / CDDL 双许可；本仓库以动态/静态链接方式分发时
# 需在发布说明中附 LibRaw 许可文本（见输出目录中的 LICENSE-LibRaw.txt）。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LIBRAW_TAG="${LIBRAW_TAG:-0.21.2}"

# 检测当前平台/架构；输出按「平台-架构」分目录，防止跨架构产物串味
case "$(uname -s)" in
  # 与 fetch-runtime.sh / package-app.sh 的 RUNTIME_KEY 保持一致。
  Darwin)            PLATFORM_TAG="macos" ;;
  MINGW*|MSYS*|Windows_NT) PLATFORM_TAG="win" ;;
  Linux)             PLATFORM_TAG="linux" ;;
  *) echo "[libraw] 暂不支持的平台：$(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH_TAG="arm64" ;;
  x86_64)        ARCH_TAG="x64" ;;
  *) echo "[libraw] 无法识别的架构：$(uname -m)" >&2; exit 1 ;;
esac
PLATFORM_KEY="${PLATFORM_TAG}-${ARCH_TAG}"

DEFAULT_OUT="$ROOT/dist-libraw/$PLATFORM_KEY"
OUT_DIR="${1:-$DEFAULT_OUT}"
WORK="$OUT_DIR/build"
LICENSE_NOTE="LibRaw is dual-licensed under LGPL-2.1 OR CDDL-1.0. See https://www.libraw.org/"

# 产物二进制名：Windows 加 .exe 后缀
BIN_NAME="camborder-libraw-sampler"
[ "$PLATFORM_TAG" = "win" ] && BIN_NAME="${BIN_NAME}.exe"

echo "[libraw] 目标平台：$PLATFORM_KEY"
echo "[libraw] 输出目录：$OUT_DIR"
mkdir -p "$WORK"

if [ ! -d "$WORK/LibRaw" ]; then
  echo "[libraw] 克隆 LibRaw $LIBRAW_TAG..."
  git clone --depth 1 --branch "$LIBRAW_TAG" https://github.com/LibRaw/LibRaw.git "$WORK/LibRaw"
fi

echo "[libraw] 编译静态库..."
(
  cd "$WORK/LibRaw"
  if [ ! -f Makefile ] && [ -f configure ]; then
    ./configure --disable-shared --enable-static
  fi
  make -j"$(sysctl -n hw.ncpu 2>/dev/null || nproc)" -C libraw
)

echo "[libraw] 编译封装..."
mkdir -p "$OUT_DIR"
CXX="${CXX:-c++}"
"$CXX" -O2 -std=c++11 \
  -I"$WORK/LibRaw" -I"$WORK/LibRaw/libraw" \
  "$ROOT/native/libraw_sampler.cpp" \
  "$WORK/LibRaw/libraw/.libs/libraw.a" \
  -o "$OUT_DIR/$BIN_NAME" \
  -lm

echo "[libraw] 写入许可说明..."
printf '%s\n' "$LICENSE_NOTE" > "$OUT_DIR/LICENSE-LibRaw.txt"

# 写入构建元信息，便于打包脚本与排障时核对
ARCH_META="$OUT_DIR/build-info.txt"
{
  echo "platform-key=$PLATFORM_KEY"
  echo "binary=$BIN_NAME"
  echo "libraw-tag=$LIBRAW_TAG"
  echo "built-at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$ARCH_META"

echo "[libraw] 完成：$OUT_DIR/$BIN_NAME"
echo "[libraw] 提示：跨架构打包请分别在对应机器上构建；Windows 用 MSVC/MinGW 交叉编译并把产物命名为 $BIN_NAME"
