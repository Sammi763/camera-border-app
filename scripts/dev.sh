#!/bin/bash
# 启动开发环境：先启动 Vite，等就绪后再启动 Electron
set -e

cd "$(dirname "$0")/frontend"
echo "[dev] 正在启动 Vite..."
npm run dev &
VITE_PID=$!

# 等待 Vite 就绪（最多 20 秒），用 127.0.0.1 探测
echo "[dev] 等待 Vite 就绪..."
for i in $(seq 1 40); do
  if curl -s -o /dev/null http://127.0.0.1:5173/ 2>/dev/null; then
    echo "[dev] Vite 已就绪，启动 Electron..."
    break
  fi
  if [ $i -eq 40 ]; then
    echo "[dev] Vite 20 秒内未就绪，仍然尝试启动 Electron..."
  fi
  sleep 0.5
done

cd "$(dirname "$0")/electron"
ELECTRON_RENDERER_URL=http://127.0.0.1:5173 npx tsc -p tsconfig.json && ELECTRON_RENDERER_URL=http://127.0.0.1:5173 npx electron dist/main/main.js

kill $VITE_PID 2>/dev/null || true
