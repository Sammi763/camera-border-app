#!/bin/bash
# fetch-runtime.sh 解压逻辑的自动化测试：
# 验证 Windows zip 顶层目录剥离后布局与 engineRuntime.ts 一致，
# 以及异常布局会被 verify_runtime_layout 拦截。
# 用法：bash scripts/fetch-runtime.test.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/runtime-extract.sh
source "$ROOT/scripts/lib/runtime-extract.sh"

T="$(mktemp -d)"
trap 'rm -rf ""$T""' EXIT
pass=0
fail=0

assert_file() {
  if [ -f "$1" ]; then
    pass=$((pass + 1))
    echo "ok   - $2"
  else
    fail=$((fail + 1))
    echo "FAIL - $2（缺少 $1）"
  fi
}

assert_fails() {
  if "$@" >/dev/null 2>&1; then
    fail=$((fail + 1))
    echo "FAIL - $*（预期失败但成功了）"
  else
    pass=$((pass + 1))
    echo "ok   - 异常被拦截：$*"
  fi
}

echo "== 用例 1：win-x64 带顶层目录的 zip（Temurin 实际格式） =="
mkdir -p "$T/winsrc/jdk-11.0.25+9-jre/bin" "$T/win-dest"
echo "fake" > "$T/winsrc/jdk-11.0.25+9-jre/bin/java.exe"
(cd "$T/winsrc" && zip -qr ../win.zip jdk-11.0.25+9-jre)
unzip -q "$T/win.zip" -d "$T/win-ext"
strip_top_level_dir "$T/win-ext" "$T/win-dest"
assert_file "$T/win-dest/bin/java.exe" "顶层目录已剥离：dest/bin/java.exe 存在"
verify_runtime_layout win-x64 "$T/win-dest" && pass=$((pass + 1)) || {
  fail=$((fail + 1)); echo "FAIL - win-x64 布局校验应通过";
}

echo "== 用例 2：macos tar 布局（--strip-components=1 后） =="
mkdir -p "$T/macsrc/jdk-11.jre/Contents/Home/bin" "$T/mac-dest"
printf '#!/bin/sh\n' > "$T/macsrc/jdk-11.jre/Contents/Home/bin/java"
chmod +x "$T/macsrc/jdk-11.jre/Contents/Home/bin/java"
tar -czf "$T/mac.tar.gz" -C "$T/macsrc" jdk-11.jre
tar -xzf "$T/mac.tar.gz" -C "$T/mac-dest" --strip-components=1
assert_file "$T/mac-dest/Contents/Home/bin/java" "mac 布局：dest/Contents/Home/bin/java 存在"
verify_runtime_layout macos-arm64 "$T/mac-dest" && pass=$((pass + 1)) || {
  fail=$((fail + 1)); echo "FAIL - macos 布局校验应通过";
}

echo "== 用例 3：错误的 win 布局被拦截（未剥离顶层目录） =="
mkdir -p "$T/bad-win/jdk-11.jre/bin"
echo x > "$T/bad-win/jdk-11.jre/bin/java.exe"
assert_fails verify_runtime_layout win-x64 "$T/bad-win"

echo "== 用例 4：错误的 mac 布局被拦截（缺 Contents/Home） =="
mkdir -p "$T/bad-mac/bin"
echo x > "$T/bad-mac/bin/java"
assert_fails verify_runtime_layout macos-x64 "$T/bad-mac"

echo "== 用例 5：SHA-256 校验：哈希匹配时通过 =="
TEST_ARCHIVE="$T/sha-good.tar.gz"
echo "sha-good-content" > "$T/sha-good-src"
tar -czf "$TEST_ARCHIVE" -C "$T" sha-good-src
EXPECTED="$(shasum -a 256 "$TEST_ARCHIVE" | awk '{print $1}')"
if verify_archive_sha256 "$TEST_ARCHIVE" "$EXPECTED"; then
  pass=$((pass + 1)); echo "ok   - 哈希匹配时校验通过"
else
  fail=$((fail + 1)); echo "FAIL - 哈希匹配时应通过"
fi

echo "== 用例 6：SHA-256 校验：哈希不匹配时拒绝 =="
WRONG="$(printf '%064d' 0)"
WRONG="${WRONG%0}1"  # 确保不等于 EXPECTED
if verify_archive_sha256 "$TEST_ARCHIVE" "$WRONG" >/dev/null 2>&1; then
  fail=$((fail + 1)); echo "FAIL - 哈希不匹配时应拒绝但通过了"
else
  pass=$((pass + 1)); echo "ok   - 哈希不匹配时校验拒绝"
fi

echo "== 用例 7：sha256_for_target 从环境变量读取（变量名大写、- 替换为 _） =="
export RUNTIME_SHA256_DARWIN_ARM64="deadbeef"
result="$(sha256_for_target darwin-arm64)"
if [ "$result" = "deadbeef" ]; then
  pass=$((pass + 1)); echo "ok   - 环境变量解析正确"
else
  fail=$((fail + 1)); echo "FAIL - 环境变量解析错误：$result"
fi
unset RUNTIME_SHA256_DARWIN_ARM64
result="$(sha256_for_target darwin-arm64)"
if [ -z "$result" ]; then
  pass=$((pass + 1)); echo "ok   - 未配置时返回空（允许跳过校验）"
else
  fail=$((fail + 1)); echo "FAIL - 未配置时应返回空：$result"
fi

echo "== 用例 8：发布模式未配置 Windows x64 SHA-256 时拒绝继续 =="
unset RUNTIME_SHA256_WIN_X64
export REQUIRE_RUNTIME_SHA256=1
if verify_runtime_archive "$TEST_ARCHIVE" win-x64 >/dev/null 2>&1; then
  fail=$((fail + 1)); echo "FAIL - 发布模式缺少 hash 时不应继续"
else
  pass=$((pass + 1)); echo "ok   - 发布模式缺少 hash 时被拒绝"
fi
unset REQUIRE_RUNTIME_SHA256

echo "== 用例 9：Windows x64 SHA-256 被篡改时拒绝继续 =="
export RUNTIME_SHA256_WIN_X64="$WRONG"
if verify_runtime_archive "$TEST_ARCHIVE" win-x64 >/dev/null 2>&1; then
  fail=$((fail + 1)); echo "FAIL - Windows x64 hash 被篡改时不应继续"
else
  pass=$((pass + 1)); echo "ok   - Windows x64 hash 被篡改时校验失败"
fi
unset RUNTIME_SHA256_WIN_X64

echo
if [ "$fail" -eq 0 ]; then
  echo "全部通过：$pass 项断言"
  exit 0
fi
echo "失败：$fail 项断言未通过（共 $pass 项通过）" >&2
exit 1
