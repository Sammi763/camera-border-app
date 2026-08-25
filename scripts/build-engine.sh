#!/bin/bash
# 构建 Java 引擎 jar（java-engine/target/camera-border-engine.jar）。
# 打包链路的第一步：产物由 scripts/package-app.sh 收集到打包资源目录。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "[engine] Maven 构建 Java 引擎..."
mvn -B -f "$ROOT/java-engine/pom.xml" clean package -DskipTests

JAR="$ROOT/java-engine/target/camera-border-engine.jar"
if [ ! -f "$JAR" ]; then
  echo "[engine] 构建完成但未找到 jar：$JAR" >&2
  exit 1
fi
echo "[engine] jar 就绪：$JAR"
