/**
 * 统一的文字模板解析工具。
 *
 * 将 resolveTextVariables 的调用统一封装，避免在页面组件中写业务解析逻辑。
 * WorkspacePage 和其他需要变量解析的地方都应使用此函数。
 */

import type { PhotoIdentity } from "../types"
import { resolveTextVariables } from "./resolveTextVariables"

/**
 * 解析包含变量的文字模板。
 *
 * 规则：
 * - 空字符串直接返回空字符串
 * - identity 为 null 时原样返回（没有身份信息就无法解析变量）
 * - 模板包含 { 且 identity 非空时，调用 resolveTextVariables 解析
 * - 不包含 { 时原样返回（纯文本模板不经过变量替换）
 *
 * @param templateOrOverride 模板文本或每图覆盖文本
 * @param identity 当前图片的摄影身份（可能为 null）
 * @returns 解析后的最终文本
 */
export const resolveEffectiveText = (
  templateOrOverride: string,
  identity: PhotoIdentity | null
): string => {
  if (templateOrOverride.length === 0) {
    return ""
  }
  if (identity !== null && templateOrOverride.includes("{")) {
    return resolveTextVariables(templateOrOverride, identity)
  }
  return templateOrOverride
}
