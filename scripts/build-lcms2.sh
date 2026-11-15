#!/usr/bin/env bash
set -euo pipefail

# 构建随包 LittleCMS 2（macOS arm64/x64）。版本、源码 URL 与 SHA-256 固定；
# 运行时不搜索系统库、不下载。Windows x64 构建需在对应工具链环境另行执行，
# 未产出前能力探测必须报告 lcms2 不可用，不能静默使用其它库。
ARCH_TAG="${ARCH:-arm64}"
TARGET_OS_TAG="${TARGET_OS:-macos}"
VERSION="2.19"
SOURCE_URL="https://github.com/mm2/Little-CMS/releases/download/lcms2.19/lcms2-2.19.tar.gz"
SOURCE_SHA256="49e7e134e4299733dd0eda434fa468997a28ab3d33fa397c642b03644f552216"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "${TARGET_OS_TAG}" == "win" && "${ARCH_TAG}" == "x64" ]]; then
  MACHINE_ARCH="x86_64"
  OUTPUT_TAG="win-x64"
  CONFIGURE_HOST="--host=x86_64-w64-mingw32"
  OUTPUT_FILE="lcms2.dll"
  SOURCE_FILE="liblcms2-2.dll"
  PLATFORM_TAG="win32"
  JSON_ARCH="x64"
elif [[ "${TARGET_OS_TAG}" == "macos" && "${ARCH_TAG}" == "arm64" ]]; then
  MACHINE_ARCH="arm64"
  OUTPUT_TAG="macos-arm64"
  CONFIGURE_HOST=""
  OUTPUT_FILE="liblcms2.2.dylib"
  SOURCE_FILE="liblcms2.2.dylib"
  PLATFORM_TAG="darwin"
  JSON_ARCH="arm64"
elif [[ "${TARGET_OS_TAG}" == "macos" && "${ARCH_TAG}" == "x64" ]]; then
  MACHINE_ARCH="x86_64"
  OUTPUT_TAG="macos-x64"
  CONFIGURE_HOST=""
  OUTPUT_FILE="liblcms2.2.dylib"
  SOURCE_FILE="liblcms2.2.dylib"
  PLATFORM_TAG="darwin"
  JSON_ARCH="x64"
else
  echo "不支持的 TARGET_OS=${TARGET_OS_TAG} ARCH=${ARCH_TAG}" >&2
  exit 1
fi
OUTPUT_DIR="${ROOT}/professional-tools/lcms/${OUTPUT_TAG}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/camborder-lcms2.XXXXXX")"
trap 'rm -rf "${WORK}"' EXIT

if [[ "${TARGET_OS_TAG}" == "macos" && "$(uname -s)" != "Darwin" ]]; then
  echo "macOS LittleCMS 需在 macOS 构建。" >&2
  exit 1
fi
if [[ "${TARGET_OS_TAG}" == "win" && -z "${CONFIGURE_HOST}" ]]; then
  echo "Windows 构建需要 mingw-w64 交叉工具链。" >&2
  exit 1
fi

if [[ -n "${LCMS2_SOURCE_ARCHIVE:-}" ]]; then
  cp "${LCMS2_SOURCE_ARCHIVE}" "${WORK}/lcms2.tar.gz"
else
  curl -fsSL "${SOURCE_URL}" -o "${WORK}/lcms2.tar.gz"
fi
echo "${SOURCE_SHA256}  ${WORK}/lcms2.tar.gz" | shasum -a 256 -c -
tar -xzf "${WORK}/lcms2.tar.gz" -C "${WORK}"
cd "${WORK}/lcms2-${VERSION}"
if [[ "${TARGET_OS_TAG}" == "win" ]]; then
  CFLAGS="-O2" LDFLAGS="" \
    ./configure ${CONFIGURE_HOST} --prefix="${WORK}/prefix" --disable-dependency-tracking --disable-static
else
  CFLAGS="-O2 -arch ${MACHINE_ARCH} -mmacosx-version-min=11.0" \
  LDFLAGS="-arch ${MACHINE_ARCH} -mmacosx-version-min=11.0" \
    ./configure ${CONFIGURE_HOST} --prefix="${WORK}/prefix" --disable-dependency-tracking --disable-static
fi
NPROC="$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 2)"
make -j"${NPROC}"
make install

mkdir -p "${OUTPUT_DIR}"
if [[ "${TARGET_OS_TAG}" == "win" ]]; then
  cp "${WORK}/prefix/bin/${SOURCE_FILE}" "${OUTPUT_DIR}/${OUTPUT_FILE}"
else
  cp "${WORK}/prefix/lib/${SOURCE_FILE}" "${OUTPUT_DIR}/${OUTPUT_FILE}"
  install_name_tool -id @rpath/liblcms2.2.dylib "${OUTPUT_DIR}/${OUTPUT_FILE}"
  codesign --force --sign - "${OUTPUT_DIR}/${OUTPUT_FILE}"
fi
mkdir -p "${ROOT}/professional-tools/licenses"
cp "${WORK}/lcms2-${VERSION}/LICENSE" "${ROOT}/professional-tools/licenses/LittleCMS-LICENSE.txt"

SHA="$(shasum -a 256 "${OUTPUT_DIR}/${OUTPUT_FILE}" | awk '{print $1}')"
cat > "${OUTPUT_DIR}/lcms2.json" <<EOF
{
  "schemaVersion": 1,
  "component": "lcms2",
  "version": "${VERSION}",
  "cmmVersion": 2190,
  "license": "MIT",
  "platform": "${PLATFORM_TAG}",
  "arch": "${JSON_ARCH}",
  "sourceUrl": "${SOURCE_URL}",
  "sourceSha256": "${SOURCE_SHA256}",
  "file": "${OUTPUT_FILE}",
  "sha256": "${SHA}",
  "notes": "固定 LittleCMS ${VERSION} 源码构建；TYPE_RGB_FLT 输入/输出，不量化到 8/16-bit。"
}
EOF
echo "lcms2 ${VERSION} -> ${OUTPUT_DIR} (${SHA})"
