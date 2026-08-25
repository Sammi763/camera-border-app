import { defineConfig } from "vitest/config"

/**
 * Electron 主进程测试配置：node 环境（无 DOM），
 * 覆盖 JavaBridge 进程控制、诊断分类等主进程逻辑。
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // 单个测试文件超时放宽（含进程终止宽限期等待）
    testTimeout: 20000
  }
})
