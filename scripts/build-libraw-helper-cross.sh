#!/usr/bin/env bash
# 构建 Intel Mac / Windows x64 内部 RAW helper；不在运行时下载依赖。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${TARGET_OS:-macos}"
case "$TARGET" in macos|win) ;; *) echo 'TARGET_OS 只接受 macos 或 win'; exit 2 ;; esac
ARCH_TAG="${ARCH:-x64}"
[[ "$ARCH_TAG" == "x64" ]] || { echo '此入口仅用于 x64'; exit 1; }
VERSION=0.22.3
SOURCE_SHA=789f3c33466210a1a0907f747a97c715d21bbf4af712f257fcbbd90111b227e4
CACHE="$ROOT/.cache/libraw"
mkdir -p "$CACHE"
ARCHIVE="$CACHE/LibRaw-$VERSION.tar.gz"
if [[ ! -f "$ARCHIVE" ]]; then curl --max-time 120 -fsSL "https://www.libraw.org/data/LibRaw-$VERSION.tar.gz" -o "$ARCHIVE"; fi
echo "$SOURCE_SHA  $ARCHIVE" | shasum -a 256 -c -
WORK="$(mktemp -d "${TMPDIR:-/tmp}/film-raw-cross.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
tar -xzf "$ARCHIVE" -C "$WORK"
SOURCE="$WORK/LibRaw-$VERSION"
if [[ "$TARGET" == "win" ]]; then
  ZARCHIVE="$CACHE/zlib-1.3.1.tar.gz"
  if [[ ! -f "$ZARCHIVE" ]]; then curl --max-time 180 -fsSL https://zlib.net/fossils/zlib-1.3.1.tar.gz -o "$ZARCHIVE"; fi
  echo "9a93b2b7dfdac77ceba5a558a580e74667dd6fede4585b91eefb60f03b72df23  $ZARCHIVE" | shasum -a 256 -c -
  tar -xzf "$ZARCHIVE" -C "$WORK"
  (cd "$WORK/zlib-1.3.1"; make -f win32/Makefile.gcc PREFIX=x86_64-w64-mingw32- -j4 libz.a)
  (cd "$SOURCE"; CPPFLAGS="-I$WORK/zlib-1.3.1" LDFLAGS="-L$WORK/zlib-1.3.1" \
    CC=x86_64-w64-mingw32-gcc CXX=x86_64-w64-mingw32-g++ \
    ./configure --host=x86_64-w64-mingw32 --disable-shared --disable-lcms --disable-jpeg --disable-openmp --enable-zlib > configure.log 2>&1
    make -j4 lib/libraw.la > make.log 2>&1 || { tail -50 make.log; exit 1; })
  TAG=win-x64; EXE=film-raw-helper.exe
  mkdir -p "$ROOT/professional-tools/libraw/$TAG"
  x86_64-w64-mingw32-g++ -std=c++17 -O2 -static -municode -I "$SOURCE" \
    "$ROOT/java-engine/src/main/native/film_raw_helper.cpp" "$SOURCE/lib/.libs/libraw.a" \
    "$WORK/zlib-1.3.1/libz.a" -lws2_32 -o "$ROOT/professional-tools/libraw/$TAG/$EXE"
  mkdir -p "$ROOT/professional-tools/licenses"
  cp "$WORK/zlib-1.3.1/LICENSE" "$ROOT/professional-tools/licenses/zlib-LICENSE.txt"
else
  TAG=macos-x64; EXE=film-raw-helper
  (cd "$SOURCE"; CFLAGS="-O2 -arch x86_64 -mmacosx-version-min=11.0" CXXFLAGS="-O2 -arch x86_64 -mmacosx-version-min=11.0" \
    LDFLAGS="-arch x86_64" CC=clang CXX=clang++ ./configure --host=x86_64-apple-darwin --disable-shared --disable-lcms --disable-jpeg --disable-openmp > configure.log 2>&1
    make -j4 lib/libraw.la > make.log 2>&1 || { tail -50 make.log; exit 1; })
  mkdir -p "$ROOT/professional-tools/libraw/$TAG"
  clang++ -std=c++17 -O2 -arch x86_64 -mmacosx-version-min=11.0 -I "$SOURCE" \
    "$ROOT/java-engine/src/main/native/film_raw_helper.cpp" "$SOURCE/lib/.libs/libraw.a" -lz -o "$ROOT/professional-tools/libraw/$TAG/$EXE"
fi
SHA="$(shasum -a 256 "$ROOT/professional-tools/libraw/$TAG/$EXE" | awk '{print $1}')"
cat > "$ROOT/professional-tools/libraw/$TAG/helper.json" <<JSON
{"schemaVersion":1,"component":"libraw","helperVersion":"1.1.1","librawVersion":"$VERSION","architecture":"$TAG","source":"https://www.libraw.org/data/LibRaw-$VERSION.tar.gz","sourceSha256":"$SOURCE_SHA","binarySha256":"$SHA","license":"LGPL-2.1-only OR CDDL-1.0","features":{"probe":true,"outputColor":"linear-camera-rgb","outputBits":16,"cropModes":["vendor-inset","full-sensor"],"orientationReported":true,"unicodePaths":true}}
JSON
file "$ROOT/professional-tools/libraw/$TAG/$EXE"
