import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
const mocks = vi.hoisted(() => ({ root: "", handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>() }))
vi.mock("electron", () => ({ app: { getPath: () => mocks.root }, ipcMain: { handle: (key: string, handler: (...args: unknown[]) => Promise<unknown>) => mocks.handlers.set(key, handler) } }))
import { registerFilmColorPresetsIpc } from "./filmColorPresets"
import { IPC_CHANNELS } from "../types/desktopApi"
beforeEach(async () => { mocks.root = await mkdtemp(join(tmpdir(), "film-presets-")); mocks.handlers.clear(); registerFilmColorPresetsIpc() })
afterEach(async () => { await rm(mocks.root, { recursive: true, force: true }) })
it("固定文件原子写入可重读，非法输入不覆盖已有内容", async () => {
  const read = mocks.handlers.get(IPC_CHANNELS.READ_FILM_COLOR_PRESETS)!
  const write = mocks.handlers.get(IPC_CHANNELS.WRITE_FILM_COLOR_PRESETS)!
  await expect(read({})).resolves.toBe("[]")
  await write({}, '[{"id":"a"}]')
  await expect(read({})).resolves.toBe('[{"id":"a"}]')
  for (const invalid of ["broken", "{}", 7, ' '.repeat(4 * 1024 * 1024 + 1)]) await expect(write({}, invalid)).rejects.toThrow()
  expect(await readFile(join(mocks.root, "film-color-presets.json"), "utf8")).toBe('[{"id":"a"}]')
})
it("读取损坏内容不擅自清空，文件系统错误明确失败", async () => {
  await writeFile(join(mocks.root, "film-color-presets.json"), "broken")
  await expect(mocks.handlers.get(IPC_CHANNELS.READ_FILM_COLOR_PRESETS)!({})).resolves.toBe("broken")
  await rm(mocks.root, { recursive: true, force: true })
  await writeFile(mocks.root, "not-directory")
  await expect(mocks.handlers.get(IPC_CHANNELS.WRITE_FILM_COLOR_PRESETS)!({}, "[]")).rejects.toThrow()
})
