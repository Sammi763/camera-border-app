import { describe, expect, it } from "vitest"
import { parseAssetJson } from "./photoAssetStoreCodec"
import { createEmptyAssetStore } from "../types"

describe("parseAssetJson", () => {
  const validStore = createEmptyAssetStore()

  it("正常 v1 数据读取成功", () => {
    const json = JSON.stringify(validStore)
    const result = parseAssetJson(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.store.version).toBe(1)
      expect(result.store.cameras).toEqual([])
    }
  })

  it("正常 v1 数据带资产读取成功", () => {
    const store = {
      ...validStore,
      cameras: [{ id: "c1", brand: "Leica", model: "M6", alias: "", notes: "" }],
      films: [{ id: "f1", brand: "Kodak", name: "Portra 400", iso: "400", type: "Color Negative", colorProfile: "neutral", discontinued: false, notes: "" }]
    }
    const json = JSON.stringify(store)
    const result = parseAssetJson(json)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.store.cameras).toHaveLength(1)
      expect(result.store.films).toHaveLength(1)
    }
  })

  it("非 JSON 数据触发错误提示", () => {
    const result = parseAssetJson("这不是合法的JSON{{{")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("不是合法 JSON")
    }
  })

  it("结构不合法触发错误提示（缺少字段）", () => {
    const result = parseAssetJson(JSON.stringify({ version: 1, cameras: [] }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("结构不合法")
    }
  })

  it("结构不合法触发错误提示（非对象）", () => {
    const result = parseAssetJson(JSON.stringify("字符串"))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("结构不合法")
    }
  })

  it("结构不合法触发错误提示（null）", () => {
    const result = parseAssetJson(JSON.stringify(null))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("结构不合法")
    }
  })

  it("结构不合法触发错误提示（数组）", () => {
    const result = parseAssetJson(JSON.stringify([1, 2, 3]))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("结构不合法")
    }
  })

  it("version 为字符串触发错误提示", () => {
    const store = { ...validStore, version: "1" }
    const result = parseAssetJson(JSON.stringify(store))
    expect(result.ok).toBe(false)
  })

  it("未知 version 触发迁移失败提示", () => {
    const store = { ...validStore, version: 999 }
    const result = parseAssetJson(JSON.stringify(store))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("不受支持")
    }
  })

  it("空字符串触发错误提示", () => {
    const result = parseAssetJson("")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("不是合法 JSON")
    }
  })
})
