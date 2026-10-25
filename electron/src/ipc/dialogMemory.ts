/**
 * 文件对话框目录记忆。
 *
 * 记录上次导入目录与上次导出目录，让原生对话框从用户上次的位置打开。
 * 存储在 userData/dialog-memory.json；任何读取/写入失败都静默回退，
 * 绝不阻塞或打断文件对话框流程。
 *
 * 解析与拼装逻辑拆为纯函数，便于 vitest 单测；fileDialog.ts 只负责调用时机。
 */
import { app } from "electron"
import fs from "node:fs"
import path from "node:path"

/** 对话框目录记忆文件名（位于 userData）。 */
const DIALOG_MEMORY_FILE = "dialog-memory.json"

/** 对话框目录记忆：上次导入目录与上次导出目录。 */
export type DialogMemory = {
  readonly lastImportDir: string | null
  readonly lastExportDir: string | null
}

/** 空记忆：文件不存在或内容损坏时的回退值。 */
export const EMPTY_DIALOG_MEMORY: DialogMemory = { lastImportDir: null, lastExportDir: null }

/** 宽松校验：仅接受非空字符串作为目录记忆。 */
export const normalizeDirMemory = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null

/** 解析记忆文件内容；任何结构损坏都回退为空记忆。 */
export const parseDialogMemory = (raw: string | null): DialogMemory => {
  if (raw === null) return EMPTY_DIALOG_MEMORY
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return EMPTY_DIALOG_MEMORY
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return EMPTY_DIALOG_MEMORY
  }
  const record = parsed as Record<string, unknown>
  return {
    lastImportDir: normalizeDirMemory(record["lastImportDir"]),
    lastExportDir: normalizeDirMemory(record["lastExportDir"])
  }
}

/** 读取记忆文件；文件不存在、损坏或不可读都返回空记忆。 */
export const readDialogMemory = (filePath: string): DialogMemory => {
  try {
    if (!fs.existsSync(filePath)) return EMPTY_DIALOG_MEMORY
    return parseDialogMemory(fs.readFileSync(filePath, "utf-8"))
  } catch {
    return EMPTY_DIALOG_MEMORY
  }
}

/** 写入记忆文件；失败返回 false，调用方不得因此打断用户流程。 */
export const writeDialogMemory = (filePath: string, memory: DialogMemory): boolean => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, `${JSON.stringify(memory, null, 2)}\n`, "utf-8")
    return true
  } catch {
    return false
  }
}

/** 记忆类型：导入对话框或导出对话框。 */
export type DialogMemoryKind = "import" | "export"

/** 按选择类型生成新记忆（不可变更新）。 */
export const recordDialogDir = (
  memory: DialogMemory,
  kind: DialogMemoryKind,
  dirPath: string
): DialogMemory =>
  kind === "import"
    ? { ...memory, lastImportDir: dirPath }
    : { ...memory, lastExportDir: dirPath }

/** 读取指定类型的记忆目录。 */
export const recallDialogDir = (memory: DialogMemory, kind: DialogMemoryKind): string | null =>
  kind === "import" ? memory.lastImportDir : memory.lastExportDir

/** 导出保存框的 defaultPath：有记忆目录时拼成完整文件路径，否则只给默认文件名。 */
export const composeExportDefaultPath = (memory: DialogMemory, defaultFileName: string): string =>
  memory.lastExportDir === null ? defaultFileName : path.join(memory.lastExportDir, defaultFileName)

/** 记忆文件绝对路径（userData）。 */
export const getDialogMemoryFilePath = (): string =>
  path.join(app.getPath("userData"), DIALOG_MEMORY_FILE)
