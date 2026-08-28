/**
 * 日志文件打开白名单校验（纯函数，便于单元测试）。
 *
 * 目的：OPEN_LOG_FILE IPC 只允许打开 userData/logs 下的**常规日志文件**，
 * 禁止通过以下方式越权访问任意文件：
 * - `..` / 重复分隔符等路径穿越（用 path.resolve 规范化后校验相对关系）；
 * - 绝对路径大小写绕过（realpath 解析后再次校验相对关系）；
 * - 符号链接指向目录外（realpath 解析链接目标后校验）；
 * - 目录本身 / 不存在文件 / 非普通文件（stat 校验 isFile）。
 */

import { isAbsolute, relative, resolve } from "node:path"
import { realpathSync, statSync } from "node:fs"

/**
 * 判断候选路径是否允许通过「打开日志文件」能力打开。
 *
 * @param candidate 渲染进程传入的候选绝对路径
 * @param allowedRoot userData/logs 目录（绝对路径）
 * @returns true 仅当：resolve 后位于 allowedRoot 内、realpath 后仍位于其内、且为普通文件
 */
export const isAllowedLogPath = (candidate: string, allowedRoot: string): boolean => {
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    return false
  }
  if (typeof allowedRoot !== "string" || allowedRoot.trim().length === 0) {
    return false
  }

  // 1) 规范化：消除 ../、重复分隔符（resolve 处理相对路径时基于 cwd，但候选必须是绝对路径）
  const resolvedCandidate = resolve(candidate)
  const resolvedRoot = resolve(allowedRoot)
  const rel = relative(resolvedRoot, resolvedCandidate)
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    // 空 rel = 直接指向目录本身；.. / 绝对 = 目录外
    return false
  }

  // 2) 符号链接与大小写绕过：realpath 后再校验一次相对关系
  try {
    const rootReal = realpathSync(resolvedRoot)
    const fileReal = realpathSync(resolvedCandidate)
    const relReal = relative(rootReal, fileReal)
    if (relReal === "" || relReal.startsWith("..") || isAbsolute(relReal)) {
      return false
    }
  } catch {
    // root 或文件不存在 / 无法解析：拒绝
    return false
  }

  // 3) 必须是普通文件（不是目录 / 设备 / 符号链接等）
  try {
    const info = statSync(resolvedCandidate)
    if (!info.isFile()) {
      return false
    }
  } catch {
    return false
  }

  return true
}
