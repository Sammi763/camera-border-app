import { describe, expect, it } from "vitest"
import { parsePresetsJson, validatePresetInput } from "./shootingPresetCodec"
import type { ShootingPreset } from "../types"

/** 构造一个合法预设。 */
const makePreset = (patch: Partial<ShootingPreset> = {}): ShootingPreset => ({
  id: "preset-1",
  name: "135 Portra 日常",
  category: "135 胶片",
  captureFormat: "135",
  cameraAssetId: "camera-leica-m6",
  lensAssetId: "lens-voigtlander-35",
  filmAssetId: "film-portra-400",
  defaultLocation: null,
  notes: null,
  ...patch
})

describe("parsePresetsJson", () => {
  it("合法数组读取成功", () => {
    const json = JSON.stringify([makePreset(), makePreset({ id: "preset-2", name: "中画幅" })])
    const result = parsePresetsJson(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.presets).toHaveLength(2)
      expect(result.skipped).toBe(0)
    }
  })

  it("空数组读取为空列表", () => {
    const result = parsePresetsJson("[]")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.presets).toEqual([])
      expect(result.skipped).toBe(0)
    }
  })

  it("非 JSON 数据触发错误提示", () => {
    const result = parsePresetsJson("这不是合法JSON{{{")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("不是合法 JSON")
    }
  })

  it("空字符串触发错误提示", () => {
    const result = parsePresetsJson("")
    expect(result.ok).toBe(false)
  })

  it("非数组（对象）触发错误提示", () => {
    const result = parsePresetsJson(JSON.stringify({ version: 1 }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("结构不合法")
    }
  })

  it("非数组（null）触发错误提示", () => {
    const result = parsePresetsJson(JSON.stringify(null))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("结构不合法")
    }
  })

  it("数组内非法条目被跳过并计数（缺少必填字段）", () => {
    const json = JSON.stringify([
      makePreset(),
      { id: "bad-1", name: "缺画幅" },
      "字符串条目"
    ])
    const result = parsePresetsJson(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.presets).toHaveLength(1)
      expect(result.skipped).toBe(2)
    }
  })

  it("资产引用为数字等非法类型时条目被跳过", () => {
    const json = JSON.stringify([
      makePreset(),
      { ...makePreset({ id: "bad-2" }), cameraAssetId: 123 }
    ])
    const result = parsePresetsJson(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.presets).toHaveLength(1)
      expect(result.skipped).toBe(1)
    }
  })

  it("未知画幅 ID 与悬空资产引用保留（向前兼容，解析层降级为空）", () => {
    const json = JSON.stringify([
      makePreset({ captureFormat: "future-format", cameraAssetId: "deleted-asset" })
    ])
    const result = parsePresetsJson(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.presets[0]?.captureFormat).toBe("future-format")
      expect(result.presets[0]?.cameraAssetId).toBe("deleted-asset")
      expect(result.skipped).toBe(0)
    }
  })
})

describe("validatePresetInput", () => {
  it("合法输入返回空错误列表", () => {
    expect(validatePresetInput(makePreset())).toEqual([])
  })

  it("空名称触发 empty-name", () => {
    expect(validatePresetInput(makePreset({ name: "   " }))).toContain("empty-name")
    expect(validatePresetInput(makePreset({ name: "" }))).toContain("empty-name")
  })

  it("缺少画幅触发 missing-capture-format", () => {
    expect(validatePresetInput(makePreset({ captureFormat: "" }))).toContain("missing-capture-format")
  })

  it("未知画幅触发 invalid-capture-format", () => {
    expect(validatePresetInput(makePreset({ captureFormat: "bogus" }))).toContain("invalid-capture-format")
  })

  it("资产引用为空字符串触发 invalid-asset-id", () => {
    expect(validatePresetInput(makePreset({ cameraAssetId: "" }))).toContain("invalid-asset-id")
    expect(validatePresetInput(makePreset({ lensAssetId: " " }))).toContain("invalid-asset-id")
    expect(validatePresetInput(makePreset({ filmAssetId: "" }))).toContain("invalid-asset-id")
  })

  it("资产引用为 null 不触发错误", () => {
    expect(validatePresetInput(makePreset({ cameraAssetId: null, lensAssetId: null, filmAssetId: null }))).toEqual([])
  })

  it("多类错误同时返回", () => {
    const errors = validatePresetInput(makePreset({ name: "", captureFormat: "" }))
    expect(errors).toContain("empty-name")
    expect(errors).toContain("missing-capture-format")
  })
})
