#!/bin/bash
# 启动开发环境：先启动 Vite，等就绪后再启动 Electron
set -e

# 脚本位于 scripts/ 下，仓库根目录为脚本目录的上一级
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_PORT="${CAMBORDER_FRONTEND_PORT:-5174}"
ENGINE_PORT="${CAMBORDER_ENGINE_PORT:-8099}"
export CAMBORDER_FRONTEND_PORT="$FRONTEND_PORT"
export CAMBORDER_ENGINE_PORT="$ENGINE_PORT"

cd "$ROOT/frontend"
echo "[dev] 正在启动 Vite..."
pnpm dev &
VITE_PID=$!

# 等待 Vite 就绪（最多 20 秒），用 127.0.0.1 探测
echo "[dev] 等待 Vite 就绪..."
for i in $(seq 1 40); do
  if curl -s -o /dev/null "http://127.0.0.1:${FRONTEND_PORT}/" 2>/dev/null; then
    echo "[dev] Vite 已就绪，启动 Electron..."
    break
  fi
  if [ $i -eq 40 ]; then
    echo "[dev] Vite 20 秒内未就绪，仍然尝试启动 Electron..."
  fi
  sleep 0.5
done

cd "$ROOT/electron"
node "$ROOT/scripts/prepare-electron-dev.mjs"
ELECTRON_RENDERER_URL="http://127.0.0.1:${FRONTEND_PORT}" \
CAMBORDER_ENGINE_PORT="$ENGINE_PORT" \
npx tsc -p tsconfig.json && \
ELECTRON_RENDERER_URL="http://127.0.0.1:${FRONTEND_PORT}" \
CAMBORDER_ENGINE_PORT="$ENGINE_PORT" \
npx electron dist/main/main.js

kill $VITE_PID 2>/dev/null || true
