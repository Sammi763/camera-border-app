import { describe, expect, it } from "vitest"
import { resolveEffectiveText } from "./resolveEffectiveText"
import { createEmptyIdentity } from "../types"
import type { PhotoIdentity } from "../types"

const fullIdentity: PhotoIdentity = {
  camera: "Leica M6",
  lens: "Voigtlander 35mm F1.4",
  film: "Kodak Portra 400",
  developer: "C-41",
  scanner: "Noritsu HS-1800",
  lab: "Local Lab",
  location: "Kyoto",
  rollName: "2025-03 Kyoto",
  frameNumber: "12"
}

describe("resolveEffectiveText", () => {
  it("全局模板变量解析", () => {
    const template = "{Camera} · {Film}"
    const result = resolveEffectiveText(template, fullIdentity)
    expect(result).toBe("Leica M6 · Kodak Portra 400")
  })

  it("每图 textOverride 变量解析", () => {
    const override = "{Film} · {Scanner}"
    const result = resolveEffectiveText(override, fullIdentity)
    expect(result).toBe("Kodak Portra 400 · Noritsu HS-1800")
  })

  it("无变量文本原样返回", () => {
    const text = "这是一段普通文字"
    const result = resolveEffectiveText(text, fullIdentity)
    expect(result).toBe(text)
  })

  it("identity 为 null 时原样返回", () => {
    const template = "{Camera} · {Film}"
    const result = resolveEffectiveText(template, null)
    expect(result).toBe(template)
  })

  it("空字符串返回空字符串", () => {
    expect(resolveEffectiveText("", fullIdentity)).toBe("")
    expect(resolveEffectiveText("", null)).toBe("")
  })

  it("纯空白字符串经变量解析后返回空字符串", () => {
    // "   " 不含 {，直接原样返回（resolveEffectiveText 不做 trim）
    expect(resolveEffectiveText("   ", fullIdentity)).toBe("   ")
    // 但如果含变量占位符且全部缺失，resolveTextVariables 会返回空
    expect(resolveEffectiveText("{Camera}", createEmptyIdentity())).toBe("")
  })

  it("模板不含 { 时即使 identity 非空也原样返回", () => {
    const text = "没有变量的文字"
    expect(resolveEffectiveText(text, fullIdentity)).toBe(text)
  })

  it("identity 部分字段缺失时正确解析", () => {
    const partial: PhotoIdentity = {
      ...createEmptyIdentity(),
      camera: "Leica M6",
      film: "Kodak Portra 400"
    }
    const result = resolveEffectiveText("{Camera} · {Lens} · {Film}", partial)
    expect(result).toBe("Leica M6 · Kodak Portra 400")
  })
})
