/**
 * 文本变量解析工具。
 *
 * 将模板中的 {Camera}、{Lens}、{Film} 等变量替换为实际值。
 * 规则与后端 MetadataFormatServiceImpl 保持一致：
 * - 已知变量：有值则替换，无值则替换为空字符串
 * - 未知变量：保留原样
 * - 替换后清理多余分隔符（按行处理，保留换行符）
 */

import type { PhotoIdentity } from "../types"

/** 已知变量名集合（小写）。 */
const KNOWN_VARIABLES = new Set([
  "camera", "lens", "film", "developer", "scanner",
  "lab", "location", "rollname", "framenumber"
])

/** 匹配 {VariableName} 变量占位符。 */
const VARIABLE_PATTERN = /\{([A-Za-z]+)}/g

/** 连续分隔符（· 或 |）。 */
const CONSECUTIVE_SEPARATORS = /(\s*[·|]\s*){2,}/g

/** 开头的分隔符。 */
const LEADING_SEPARATOR = /^(\s*[·|]\s*)+/

/** 结尾的分隔符。 */
const TRAILING_SEPARATOR = /(\s*[·|]\s*)+$/

/**
 * 将 PhotoIdentity 的字段名映射到变量名（大小写不敏感）。
 * 返回变量名到值的映射。
 */
const identityToMap = (identity: PhotoIdentity): Map<string, string> => {
  const map = new Map<string, string>()
  map.set("camera", identity.camera)
  map.set("lens", identity.lens)
  map.set("film", identity.film)
  map.set("developer", identity.developer)
  map.set("scanner", identity.scanner)
  map.set("lab", identity.lab)
  map.set("location", identity.location)
  map.set("rollname", identity.rollName)
  map.set("framenumber", identity.frameNumber)
  return map
}

/**
 * 对单行文本执行变量替换和分隔符清理。
 * 不处理换行逻辑，换行由上层按行拆分后调用。
 */
const resolveLine = (line: string, valueMap: Map<string, string>): string => {
  // 第一步：替换变量占位符
  const replaced = line.replace(VARIABLE_PATTERN, (match, varName: string) => {
    const lowerName = varName.toLowerCase()
    if (KNOWN_VARIABLES.has(lowerName)) {
      return valueMap.get(lowerName) ?? ""
    }
    // 未知变量保留原样
    return match
  })

  // 第二步：清理多余分隔符
  let cleaned = replaced
  // 连续分隔符折叠为单个 " · "
  cleaned = cleaned.replace(CONSECUTIVE_SEPARATORS, " · ")
  // 去掉开头和结尾的分隔符
  cleaned = cleaned.replace(LEADING_SEPARATOR, "")
  cleaned = cleaned.replace(TRAILING_SEPARATOR, "")
  // 清理多余空格（不匹配换行符，使用 [^\S\n] 匹配非换行空白）
  cleaned = cleaned.replace(/[^\S\n]{2,}/g, " ").trim()

  return cleaned
}

/**
 * 解析文本模板中的变量，替换为实际值。
 *
 * 按行处理，保留模板中的换行符。
 * 例如 "{Camera}\n{Lens}\n{Film}" 会被解析为三行。
 *
 * @param template 模板文本，如 "{Camera} · {Lens} · {Film}"
 * @param identity 摄影身份信息
 * @returns 替换并清理后的最终文本
 */
export const resolveTextVariables = (template: string, identity: PhotoIdentity): string => {
  if (template.trim().length === 0) {
    return ""
  }

  const valueMap = identityToMap(identity)

  // 按行拆分，逐行处理，保留换行结构
  const lines = template.split("\n")
  const resolvedLines = lines.map((line) => resolveLine(line, valueMap))

  // 过滤掉空行后重新拼接，但保留有意的换行结构
  // 如果原始模板有换行，说明用户想要多行布局
  const hasNewlines = template.includes("\n")
  if (hasNewlines) {
    // 多行模式：保留非空行
    return resolvedLines.filter((line) => line.length > 0).join("\n")
  }

  // 单行模式：直接返回
  return resolvedLines[0] ?? ""
}
