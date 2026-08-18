/**
 * 摄影预设持久化适配。
 *
 * 统一两种存储路径（P0-05 要求）：
 * - Electron 模式：userData/presets.json（经 preload 白名单 IPC readPresets/writePresets）；
 * - 浏览器模式：localStorage（键 camborder-presets）。
 *
 * 存储适配器抽象出 read/write 两个原语，加载/保存逻辑与具体存储解耦，便于独立测试。
 * 失败路径（损坏 JSON、读取抛错、写入失败）都在这里转成中文错误描述，不静默吞掉。
 */

import type { ShootingPreset } from "../types"
import { parsePresetsJson } from "./shootingPresetCodec"

/** 浏览器降级模式的 localStorage 键。 */
export const LS_PRESETS_KEY = "camborder-presets"

/** 存储原语：读返回 JSON 字符串，写接受 JSON 字符串。 */
export type PresetStorage = {
  readonly read: () => Promise<string>
  readonly write: (json: string) => Promise<void>
}

/** Electron 模式适配器（bridge 为 window.desktop 白名单能力）。 */
export const createElectronPresetStorage = (bridge: {
  readonly readPresets: () => Promise<string>
  readonly writePresets: (json: string) => Promise<void>
}): PresetStorage => ({
  read: () => bridge.readPresets(),
  write: (json) => bridge.writePresets(json)
})

/** 浏览器模式适配器（localStorage 读写，异常时按读取失败/写入失败处理）。 */
export const createLocalStoragePresetStorage = (key: string = LS_PRESETS_KEY): PresetStorage => ({
  read: async () => {
    const raw = localStorage.getItem(key)
    return raw === null ? "[]" : raw
  },
  write: async (json) => {
    localStorage.setItem(key, json)
  }
})

/** 读取并解析预设：失败返回错误描述与空列表（不抛异常）。 */
export const loadPresets = async (
  storage: PresetStorage
): Promise<{ readonly presets: readonly ShootingPreset[]; readonly error: string | null }> => {
  let json: string
  try {
    json = await storage.read()
  } catch {
    return { presets: [], error: "摄影预设读取失败，请检查文件权限或重启应用。" }
  }

  const result = parsePresetsJson(json)
  if (!result.ok) {
    return { presets: [], error: result.error }
  }
  if (result.skipped > 0) {
    return { presets: result.presets, error: `部分摄影预设数据不合法，已忽略 ${result.skipped} 条。` }
  }
  return { presets: result.presets, error: null }
}

/** 持久化预设：失败返回错误描述，成功返回 null。 */
export const savePresets = async (
  storage: PresetStorage,
  presets: readonly ShootingPreset[]
): Promise<string | null> => {
  try {
    await storage.write(JSON.stringify(presets))
    return null
  } catch {
    return "摄影预设保存失败，请检查文件权限或磁盘空间。"
  }
}
