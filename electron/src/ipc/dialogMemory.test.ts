import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  composeExportDefaultPath,
  EMPTY_DIALOG_MEMORY,
  parseDialogMemory,
  readDialogMemory,
  recordDialogDir,
  recallDialogDir,
  writeDialogMemory
} from "./dialogMemory"

let workDir: string

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "camborder-dialog-memory-"))
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

describe("对话框目录记忆（dialogMemory）", () => {
  it("首次无记录时返回空记忆，不抛异常", () => {
    expect(readDialogMemory(join(workDir, "missing.json"))).toEqual(EMPTY_DIALOG_MEMORY)
    expect(parseDialogMemory(null)).toEqual(EMPTY_DIALOG_MEMORY)
  })

  it("记录存在时返回上次导入与导出目录", () => {
    const filePath = join(workDir, "dialog-memory.json")
    writeFileSync(filePath, JSON.stringify({ lastImportDir: "/photos/2024", lastExportDir: "/exports" }))
    const memory = readDialogMemory(filePath)
    expect(memory.lastImportDir).toBe("/photos/2024")
    expect(memory.lastExportDir).toBe("/exports")
    expect(recallDialogDir(memory, "import")).toBe("/photos/2024")
    expect(recallDialogDir(memory, "export")).toBe("/exports")
  })

  it("JSON 损坏或字段非法时回退为空记忆", () => {
    expect(parseDialogMemory("not-json{")).toEqual(EMPTY_DIALOG_MEMORY)
    expect(parseDialogMemory(JSON.stringify(["array"]))).toEqual(EMPTY_DIALOG_MEMORY)
    expect(parseDialogMemory(JSON.stringify({ lastImportDir: 42, lastExportDir: "" }))).toEqual(EMPTY_DIALOG_MEMORY)
    expect(parseDialogMemory(JSON.stringify({ lastImportDir: "  " }))).toEqual(EMPTY_DIALOG_MEMORY)
    expect(parseDialogMemory("null")).toEqual(EMPTY_DIALOG_MEMORY)
  })

  it("recordDialogDir 按类型更新对应目录且不影响另一类", () => {
    const updated = recordDialogDir(EMPTY_DIALOG_MEMORY, "import", "/photos/new")
    expect(updated.lastImportDir).toBe("/photos/new")
    expect(updated.lastExportDir).toBeNull()
    const both = recordDialogDir({ ...updated, lastExportDir: "/exports" }, "export", "/exports/other")
    expect(both.lastImportDir).toBe("/photos/new")
    expect(both.lastExportDir).toBe("/exports/other")
  })

  it("导出保存框默认路径拼装包含记忆目录与文件名", () => {
    expect(composeExportDefaultPath(EMPTY_DIALOG_MEMORY, "A.jpg")).toBe("A.jpg")
    expect(composeExportDefaultPath({ lastImportDir: "/x", lastExportDir: "/exports" }, "A.jpg"))
      .toBe(join("/exports", "A.jpg"))
  })

  it("写入成功后可读回；写入失败返回 false 且不抛异常", () => {
    const filePath = join(workDir, "nested", "dialog-memory.json")
    expect(writeDialogMemory(filePath, { lastImportDir: "/photos", lastExportDir: null })).toBe(true)
    expect(readDialogMemory(filePath)).toEqual({ lastImportDir: "/photos", lastExportDir: null })

    // 父路径是文件：mkdir 与写入都会失败，返回 false 而不是抛错
    const blockedPath = join(workDir, "blocked", "memory.json")
    writeFileSync(join(workDir, "blocked"), "not a directory")
    expect(writeDialogMemory(blockedPath, { lastImportDir: null, lastExportDir: "/x" })).toBe(false)
  })
})
