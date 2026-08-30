import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

/**
 * 从项目的确定性相机图标生成 macOS ICNS。
 *
 * sips 是 macOS SDK 自带工具，因此不把第三方图像工具引入构建依赖。
 * Windows 图标仍由 create-windows-icon.mjs 生成；两者共用同一视觉源图。
 */
export const createMacIcon = ({
  source = path.resolve("electron/build/icon.ico"),
  output = path.resolve("electron/build/icon.icns")
} = {}) => {
  if (process.platform !== "darwin") {
    throw new Error("macOS ICNS 只能在 macOS 上生成（需要 sips 和 iconutil）。")
  }
  if (!existsSync(source)) {
    throw new Error(`找不到图标源文件：${source}`)
  }

  mkdirSync(path.dirname(output), { recursive: true })
  execFileSync("sips", ["-s", "format", "icns", source, "--out", output], { stdio: "ignore" })
  return output
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    console.log(`[icon] 已生成：${createMacIcon({
      source: process.argv[2] ?? path.resolve("electron/build/icon.ico"),
      output: process.argv[3] ?? path.resolve("electron/build/icon.icns")
    })}`)
  } catch (error) {
    console.error(`[icon] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
