#!/bin/bash
# 运行时解压/校验公共函数（被 fetch-runtime.sh 与 fetch-runtime.test.sh 共享）。
# 布局契约与 electron/src/engine/engineRuntime.ts 保持一致：
#   macos-*: <runtime>/Contents/Home/bin/java
#   win-x64: <runtime>/bin/java.exe

# 把 src 下唯一顶层目录的“内容”移动到已存在的 dest（兼容 zip 解压后的顶层包装目录）。
strip_top_level_dir() {
  local src="$1" dest="$2"
  local entries count
  entries="$(ls -A "$src")"
  count="$(printf '%s\n' "$entries" | grep -c . || true)"
  if [ "$count" -eq 1 ]; then
    local top="$entries"
    # 顶层包装目录（如 jdk-11.x-jre/）：移动其内容而非目录本身，
    # 避免出现 runtime/win-x64/<顶层目录>/bin/java.exe 的错误嵌套。
    mv "$src/$top"/* "$dest"/
    mv "$src/$top"/.[!.]* "$dest"/ 2>/dev/null || true
  else
    # 没有顶层包装目录时整体移动
    mv "$src"/* "$dest"/
  fi
}

# 校验解压结果与 engineRuntime.ts 约定的可执行文件路径一致，不一致直接失败。
verify_runtime_layout() {
  local target="$1" dir="$2"
  case "$target" in
    macos-*)
      if [ ! -x "$dir/Contents/Home/bin/java" ]; then
        echo "[runtime] 错误：$target 解压后缺少 Contents/Home/bin/java（与 engineRuntime.ts 不一致）" >&2
        return 1
      fi
      ;;
    win-x64)
      if [ ! -f "$dir/bin/java.exe" ]; then
        echo "[runtime] 错误：win-x64 解压后缺少 bin/java.exe（与 engineRuntime.ts 不一致）" >&2
        return 1
      fi
      ;;
    *)
      echo "[runtime] 错误：未知平台 $target" >&2
      return 1
      ;;
  esac
}

# 从环境变量读取 target 对应的 SHA-256（变量名规则：RUNTIME_SHA256_<UPPER(target, - → _)>）。
# 例如 macos-arm64 -> RUNTIME_SHA256_MACOS_ARM64。未配置返回空，调用方按策略处理。
sha256_for_target() {
  local target="$1"
  local var
  var="RUNTIME_SHA256_$(echo "$target" | tr '[:lower:]-' '[:upper:]_')"
  printf '%s' "${!var:-}"
}

# 校验已下载归档的 SHA-256。不匹配返回非零并打印详细错误。
verify_archive_sha256() {
  local archive="$1"
  local expected="$2"
  local actual
  if [[ ! "$expected" =~ ^[[:xdigit:]]{64}$ ]]; then
    echo "[runtime] 致命：期望的 SHA-256 必须是 64 位十六进制字符串" >&2
    return 1
  fi
  actual="$(shasum -a 256 "$archive" | awk '{print $1}')"
  if [ "$actual" != "$expected" ]; then
    echo "[runtime] 致命：SHA-256 校验失败" >&2
    echo "  归档：$archive" >&2
    echo "  期望：$expected" >&2
    echo "  实际：$actual" >&2
    return 1
  fi
  echo "[runtime] SHA-256 校验通过：$actual"
}

# 按发布策略校验归档。开发环境允许未配置 hash，正式发布可通过
# REQUIRE_RUNTIME_SHA256=1 将“未配置”升级为失败，避免误把未校验产物发布出去。
verify_runtime_archive() {
  local archive="$1"
  local target="$2"
  local expected
  expected="$(sha256_for_target "$target")"
  if [ -z "$expected" ]; then
    if [ "${REQUIRE_RUNTIME_SHA256:-0}" = "1" ]; then
      echo "[runtime] 致命：未配置 $target 的 SHA-256，已阻止发布模式下载" >&2
      return 1
    fi
    echo "[runtime] 提示：未配置 $target 的 SHA-256，跳过校验（开发模式）"
    return 0
  fi
  verify_archive_sha256 "$archive" "$expected"
}
