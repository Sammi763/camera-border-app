import { describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/film-archive-test",
    isPackaged: false
  },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn(), openExternal: vi.fn() },
  BrowserWindow: { getFocusedWindow: vi.fn(), getAllWindows: vi.fn(() => []) }
}))

import { isAllowedDocumentExtension, isPathInsideRoot } from "./filmArchive"

describe("FilmArchive 受控打开边界", () => {
  it("只允许资料库根目录内的绝对文件路径", () => {
    expect(isPathInsideRoot("/library/Docs/Kodak/a.pdf", "/library")).toBe(true)
    expect(isPathInsideRoot("/library", "/library")).toBe(false)
    expect(isPathInsideRoot("/library-other/a.pdf", "/library")).toBe(false)
    expect(isPathInsideRoot("/etc/passwd", "/library")).toBe(false)
  })

  it("只开放文献与查看器需要的扩展名", () => {
    expect(isAllowedDocumentExtension("/library/a.pdf")).toBe(true)
    expect(isAllowedDocumentExtension("/library/a.TXT")).toBe(true)
    expect(isAllowedDocumentExtension("/library/a.html")).toBe(true)
    expect(isAllowedDocumentExtension("/library/a.exe")).toBe(false)
    expect(isAllowedDocumentExtension("/library/a.js")).toBe(false)
  })
})
