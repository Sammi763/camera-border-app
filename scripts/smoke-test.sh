#!/bin/bash
# 打包产物冒烟测试：启动打包后的应用，等待托管引擎健康端点就绪。
#
# 用法：
#   bash scripts/smoke-test.sh <应用可执行文件路径>
#
# 示例（macOS）：
#   bash scripts/smoke-test.sh "electron/release/mac-arm64/Camera Border.app/Contents/MacOS/Camera Border"
#
# 检查项：
#   1. 应用进程能启动并保持存活；
#   2. 托管引擎在 30 秒内通过 /api/health 就绪（随包 Java Runtime 可用）；
#   3. 结束时清理应用与引擎子进程。
#
# 完整干净机器验收（无 Node/Maven/Java、安装-启动-导入-导出-卸载）见
# docs/release-checklist.md——本脚本只覆盖「启动即引擎可用」这一最小闭环。

set -euo pipefail

APP_BIN="${1:-}"
if [ -z "$APP_BIN" ] || [ ! -x "$APP_BIN" ]; then
  echo "用法: $0 <应用可执行文件路径>" >&2
  exit 2
fi

TIMEOUT_SECONDS=30
# 引擎端口：默认 8099；本机 8099 被占用时可 CAMBORDER_SMOKE_PORT=8100 绕开
# （脚本会把 CAMBORDER_ENGINE_PORT 注入应用，引擎与前端自动使用同一端口）
SMOKE_PORT="${CAMBORDER_SMOKE_PORT:-}"
if [ -n "$SMOKE_PORT" ]; then
  HEALTH_URL="http://127.0.0.1:${SMOKE_PORT}/api/health"
  export CAMBORDER_ENGINE_PORT="$SMOKE_PORT"
else
  HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8099/api/health}"
fi

echo "[smoke] 启动应用：$APP_BIN"
"$APP_BIN" &
APP_PID=$!
trap 'kill "$APP_PID" 2>/dev/null || true' EXIT

echo "[smoke] 等待引擎就绪：${HEALTH_URL}（最多 ${TIMEOUT_SECONDS}s）"
ready=0
for i in $(seq 1 "$((TIMEOUT_SECONDS * 2))"); do
  if curl -sf -o /dev/null "$HEALTH_URL"; then
    ready=1
    break
  fi
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    echo "[smoke] 失败：应用进程已退出" >&2
    exit 1
  fi
  sleep 0.5
done

if [ "$ready" -ne 1 ]; then
  echo "[smoke] 失败：引擎在 ${TIMEOUT_SECONDS}s 内未就绪" >&2
  exit 1
fi

echo "[smoke] 引擎健康检查通过：$(curl -sf "$HEALTH_URL")"
echo "[smoke] 冒烟测试通过"

# macOS/Linux 上 kill 主进程会连带触发 before-quit -> 引擎 dispose；
# Windows 下请手动结束进程或改用 PowerShell 脚本。
kill "$APP_PID" 2>/dev/null || true
sleep 1
exit 0
