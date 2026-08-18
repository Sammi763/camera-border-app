import { afterEach, describe, expect, it } from "vitest"
import {
  createElectronPresetStorage,
  createLocalStoragePresetStorage,
  loadPresets,
  savePresets,
  LS_PRESETS_KEY
} from "./presetPersistence"
import type { PresetStorage } from "./presetPersistence"
import type { ShootingPreset } from "../types"

/** 构造一个合法预设。 */
const makePreset = (patch: Partial<ShootingPreset> = {}): ShootingPreset => ({
  id: "preset-1",
  name: "135 Portra 日常",
  category: "135 胶片",
  captureFormat: "135",
  cameraAssetId: null,
  lensAssetId: null,
  filmAssetId: null,
  defaultLocation: null,
  notes: null,
  ...patch
})

const validJson = JSON.stringify([makePreset()])

describe("loadPresets / savePresets（适配器无关）", () => {
  it("Electron 适配器走 readPresets/writePresets 白名单能力", async () => {
    const calls: string[] = []
    const bridge = {
      readPresets: async () => { calls.push("read"); return validJson },
      writePresets: async (json: string) => { calls.push(`write:${json.length}`) }
    }
    const storage = createElectronPresetStorage(bridge)

    const loaded = await loadPresets(storage)
    expect(calls).toEqual(["read"])
    expect(loaded.error).toBeNull()
    expect(loaded.presets).toHaveLength(1)
    expect(loaded.presets[0]?.name).toBe("135 Portra 日常")

    const saveError = await savePresets(storage, loaded.presets)
    expect(saveError).toBeNull()
    expect(calls).toEqual(["read", `write:${validJson.length}`])
  })

  it("读取抛错（权限/文件损坏）返回错误描述而非崩溃", async () => {
    const storage: PresetStorage = {
      read: async () => { throw new Error("EACCES") },
      write: async () => {}
    }
    const loaded = await loadPresets(storage)
    expect(loaded.presets).toEqual([])
    expect(loaded.error).toContain("读取失败")
  })

  it("损坏 JSON 返回错误描述", async () => {
    const storage: PresetStorage = { read: async () => "{{{corrupt", write: async () => {} }
    const loaded = await loadPresets(storage)
    expect(loaded.presets).toEqual([])
    expect(loaded.error).toContain("不是合法 JSON")
  })

  it("部分条目非法时保留合法条目并提示忽略数量", async () => {
    const storage: PresetStorage = {
      read: async () => JSON.stringify([makePreset(), { bad: true }]),
      write: async () => {}
    }
    const loaded = await loadPresets(storage)
    expect(loaded.presets).toHaveLength(1)
    expect(loaded.error).toContain("已忽略 1 条")
  })

  it("写入抛错返回保存错误描述", async () => {
    const storage: PresetStorage = {
      read: async () => "[]",
      write: async () => { throw new Error("ENOSPC") }
    }
    const error = await savePresets(storage, [makePreset()])
    expect(error).toContain("保存失败")
  })

  it("空列表读写正常", async () => {
    const storage: PresetStorage = { read: async () => "[]", write: async () => {} }
    const loaded = await loadPresets(storage)
    expect(loaded.presets).toEqual([])
    expect(loaded.error).toBeNull()
    expect(await savePresets(storage, [])).toBeNull()
  })
})

describe("localStorage 适配器（浏览器降级路径）", () => {
  /** 简易 localStorage 替身：node 测试环境没有 localStorage 全局。 */
  const lsMock = (() => {
    const map = new Map<string, string>()
    return {
      getItem: (key: string): string | null => map.get(key) ?? null,
      setItem: (key: string, value: string): void => { map.set(key, value) },
      clear: (): void => { map.clear() }
    }
  })()

  afterEach(() => {
    lsMock.clear()
  })

  it("读写往返：localStorage 持久化预设", async () => {
    (globalThis as Record<string, unknown>)["localStorage"] = lsMock
    const storage = createLocalStoragePresetStorage()

    expect(await savePresets(storage, [makePreset()])).toBeNull()
    expect(lsMock.getItem(LS_PRESETS_KEY)).toBe(validJson)

    const loaded = await loadPresets(storage)
    expect(loaded.error).toBeNull()
    expect(loaded.presets).toHaveLength(1)
    expect(loaded.presets[0]?.captureFormat).toBe("135")
  })

  it("键不存在时读取为空列表", async () => {
    (globalThis as Record<string, unknown>)["localStorage"] = lsMock
    const storage = createLocalStoragePresetStorage()
    const loaded = await loadPresets(storage)
    expect(loaded.presets).toEqual([])
    expect(loaded.error).toBeNull()
  })
})
