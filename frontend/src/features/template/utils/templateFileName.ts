/**
 * 模板文件名工具。
 *
 * 清理模板名称中的非法文件名字符，
 * 生成 .camborder-template.json 后缀的文件名。
 */

/** 文件名中不允许出现的字符（跨平台）。 */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g

/**
 * 将模板名称清理为合法文件名。
 *
 * - 替换非法字符为下划线
 * - 去除首尾空白和点号（Windows 不允许文件名以点号结尾）
 * - 空名称回退为 "template"
 */
export const sanitizeTemplateName = (name: string): string => {
  const cleaned = name
    .replace(ILLEGAL_FILENAME_CHARS, "_")
    .trim()
    .replace(/^\.+|\.+$/g, "")

  return cleaned.length > 0 ? cleaned : "template"
}

/**
 * 生成模板导出文件名。
 *
 * 格式：{清理后的名称}.camborder-template.json
 */
export const buildTemplateExportFileName = (name: string): string => {
  return `${sanitizeTemplateName(name)}.camborder-template.json`
}
