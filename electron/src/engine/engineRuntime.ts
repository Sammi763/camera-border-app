import { existsSync } from "node:fs"
import path from "node:path"
import { javaRuntimeDir, professionalToolsDir } from "../paths/paths.js"

/**
 * 随包 Java Runtime 的可执行文件解析。
 *
 * 运行时布局（scripts/fetch-runtime.sh 下载并解压 Temurin JRE）：
 * - macOS：java-runtime/Contents/Home/bin/java（JDK 目录结构）
 * - Windows：java-runtime/bin/java.exe
 *
 * 解析不到随包运行时（文件缺失）时返回 null——
 * 调用方回退到系统 PATH 中的 java，并把该状态计入诊断
 * （打包产物必须携带运行时，此分支仅作为降级保护）。
 */

/** macOS 上 JDK/JRE 目录结构中的可执行文件相对路径。 */
const MAC_JAVA_RELATIVE = path.join("Contents", "Home", "bin", "java")

/** Windows 上的可执行文件相对路径。 */
const WIN_JAVA_RELATIVE = path.join("bin", "java.exe")

/** Linux 上的可执行文件相对路径。 */
const LINUX_JAVA_RELATIVE = path.join("bin", "java")

export const resolveBundledJavaExecutable = (): string | null => {
  let relative: string
  if (process.platform === "darwin") {
    relative = MAC_JAVA_RELATIVE
  } else if (process.platform === "win32") {
    relative = WIN_JAVA_RELATIVE
  } else {
    relative = LINUX_JAVA_RELATIVE
  }

  const candidate = path.join(javaRuntimeDir, relative)
  return existsSync(candidate) ? candidate : null
}

/**
 * 随包 ExifTool 解析。
 * macOS 使用官方发行包中的 Perl 启动脚本和同目录 lib，Windows 使用官方
 * 64-bit 可执行文件。缺失时只让 Java 引擎把专业能力报告为 false。
 */
export const resolveBundledExifToolExecutable = (): string | null => {
  const relative = process.platform === "win32"
    ? path.join("win-x64", "exiftool.exe")
    : path.join("macos", "exiftool")
  const candidate = path.join(professionalToolsDir, "exiftool", relative)
  return existsSync(candidate) ? candidate : null
}

/** 随包组件清单，供 Java 引擎返回版本、许可证与校验和。 */
export const resolveBundledComponentManifest = (): string | null => {
  const candidate = path.join(professionalToolsDir, "components.json")
  return existsSync(candidate) ? candidate : null
}

/** 随包字体目录；缺失时 Java 端必须把字体能力报告为 false。 */
export const resolveBundledFontsDirectory = (): string | null => {
  const candidate = path.join(professionalToolsDir, "fonts")
  return existsSync(candidate) ? candidate : null
}
