/**
 * 模板 JSON 编解码工具。
 *
 * 负责模板 JSON 的序列化（导出）、反序列化（导入/拖拽）、校验。
 * 导入时生成新 id 和 createdAt，避免覆盖已有模板。
 * 同名模板自动追加序号。
 */

import type { Template } from "../types"
import type { RenderSettings } from "../../settings/types"

// ---- 导出格式 ---------------------------------------------------------------

/** 导出的模板 JSON 文件结构。 */
export type TemplateExportFile = {
  readonly kind: "camera-border-template"
  readonly version: 1
  readonly template: {
    readonly id: string
    readonly name: string
    readonly settings: RenderSettings
    readonly createdAt: number
  }
}

// ---- 校验结果 --------------------------------------------------------------

export type ImportResult =
  | { readonly ok: true; readonly template: Template }
  | { readonly ok: false; readonly error: string }

// ---- 序列化 ----------------------------------------------------------------

/**
 * 将模板序列化为导出 JSON 字符串。
 *
 * JSON 使用 2 空格缩进，包含 kind / version / template 三个顶层字段。
 */
export const encodeTemplateJson = (template: Template): string => {
  const file: TemplateExportFile = {
    kind: "camera-border-template",
    version: 1,
    template: {
      id: template.id,
      name: template.name,
      settings: template.settings,
      createdAt: template.createdAt,
    },
  }
  return JSON.stringify(file, null, 2)
}

// ---- 反序列化 ----------------------------------------------------------------

/** 检查值是否为非空对象。 */
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null
}

/**
 * 从 JSON 字符串解析并校验模板。
 *
 * 校验规则：
 * - JSON 解析成功
 * - kind === "camera-border-template"
 * - version === 1
 * - template.name 非空
 * - template.settings 包含 RenderSettings 基本字段
 *
 * 导入时生成新的 id 和 createdAt，避免覆盖已有模板。
 */
export const decodeTemplateJson = (json: string): ImportResult => {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: "JSON 解析失败，请检查文件格式。" }
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: "文件内容不是有效的对象。" }
  }

  // 校验 kind
  if (parsed["kind"] !== "camera-border-template") {
    return { ok: false, error: "不是有效的相机边框模板文件（kind 不匹配）。" }
  }

  // 校验 version
  if (parsed["version"] !== 1) {
    return { ok: false, error: `不支持的模板版本：${String(parsed["version"])}，当前仅支持 version 1。` }
  }

  // 校验 template 存在
  const tpl = parsed["template"]
  if (!isRecord(tpl)) {
    return { ok: false, error: "模板文件缺少 template 字段。" }
  }

  // 校验 name
  if (typeof tpl["name"] !== "string" || tpl["name"].trim().length === 0) {
    return { ok: false, error: "模板名称为空或格式不正确。" }
  }

  // 校验 settings 基本字段
  const settings = tpl["settings"]
  if (!isRecord(settings)) {
    return { ok: false, error: "模板文件缺少 settings 字段。" }
  }

  const requiredFields = [
    "borderColor", "borderTop", "borderBottom", "borderLeft", "borderRight",
    "textContent", "textFontSize", "textColor", "textPlacement", "textArea",
    "fontFamily", "autoCrop", "filmFormat", "gradient", "exportFormat", "jpegQuality",
  ]
  for (const field of requiredFields) {
    if (!(field in settings)) {
      return { ok: false, error: `settings 缺少必需字段：${field}` }
    }
  }

  // 生成新 id 和 createdAt
  const template: Template = {
    id: crypto.randomUUID(),
    name: (tpl["name"] as string).trim(),
    settings: tpl["settings"] as RenderSettings,
    createdAt: Date.now(),
  }

  return { ok: true, template }
}

// ---- 同名去重 ----------------------------------------------------------------

/**
 * 生成不与现有模板冲突的名称。
 *
 * - 基础名不冲突 → 直接返回
 * - 冲突 → 追加 " (导入)" 或 " (导入 N)"
 */
export const deduplicateTemplateName = (
  baseName: string,
  existingNames: readonly string[],
): string => {
  if (!existingNames.includes(baseName)) {
    return baseName
  }

  // 尝试 " (导入)"、" (导入 2)"、" (导入 3)" ...
  const suffix = " (导入)"
  let candidate = `${baseName}${suffix}`
  let counter = 2
  while (existingNames.includes(candidate)) {
    candidate = `${baseName}${suffix.replace(")", ` ${counter})`)}`
    counter++
  }
  return candidate
}
