import { existsSync } from "node:fs"
import path from "node:path"
import { javaRuntimeDir } from "../paths/paths.js"

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
 * 随包 LibRaw 原生程序（RAW 真实显影）解析。
 * 布局：<resources>/libraw/camborder-libraw-sampler(.exe)，由打包脚本放入。
 * 缺失时返回 null——引擎据此走嵌入预览降级，并在 sourceDecode.warning 说明原因。
 */
export const resolveBundledLibRawExecutable = (): string | null => {
  const resourcesDir = path.dirname(javaRuntimeDir)
  const name = process.platform === "win32" ? "camborder-libraw-sampler.exe" : "camborder-libraw-sampler"
  const candidate = path.join(resourcesDir, "libraw", name)
  return existsSync(candidate) ? candidate : null
}
