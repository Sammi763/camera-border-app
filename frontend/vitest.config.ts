import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

/**
 * Vitest 配置：与 vite.config.ts（dev server）分离。
 * 组件/集成测试（ShootingPresetPanel、useShootingPresets、Workspace wiring）
 * 需要 DOM 环境，统一使用 jsdom；纯函数测试在 jsdom 下同样可运行。
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // 开启 globals 让 @testing-library/react 的 afterEach 自动 cleanup 生效
    globals: true
  }
})
