import { describe, expect, it } from "vitest"
import { detectCameraBrand, detectBrandFromIdentity } from "./brandDetection"

describe("detectCameraBrand", () => {
  it("识别 Nikon", () => {
    const result = detectCameraBrand("Nikon F3")
    expect(result.brand).toBe("Nikon")
    expect(result.label).toBe("NIKON")
  })

  it("识别 Canon", () => {
    const result = detectCameraBrand("Canon EOS R5")
    expect(result.brand).toBe("Canon")
    expect(result.label).toBe("Canon")
  })

  it("识别 Leica", () => {
    const result = detectCameraBrand("Leica M6")
    expect(result.brand).toBe("Leica")
    expect(result.label).toBe("LEICA")
  })

  it("识别 Sony", () => {
    const result = detectCameraBrand("Sony A7III")
    expect(result.brand).toBe("Sony")
    expect(result.label).toBe("SONY")
  })

  it("识别 Fujifilm", () => {
    const result = detectCameraBrand("Fujifilm X-T5")
    expect(result.brand).toBe("Fujifilm")
    expect(result.label).toBe("FUJIFILM")
  })

  it("识别 Contax T2（无品牌）", () => {
    const result = detectCameraBrand("Contax T2")
    expect(result.brand).toBeNull()
    expect(result.label).toBeNull()
  })

  it("识别大写 NIKON", () => {
    const result = detectCameraBrand("NIKON Z7")
    expect(result.brand).toBe("Nikon")
    expect(result.label).toBe("NIKON")
  })

  it("识别小写 leica", () => {
    const result = detectCameraBrand("leica mp")
    expect(result.brand).toBe("Leica")
    expect(result.label).toBe("LEICA")
  })

  it("识别 DJI Mavic", () => {
    const result = detectCameraBrand("DJI Mavic 3")
    expect(result.brand).toBe("DJI")
    expect(result.label).toBe("DJI")
  })

  it("识别 GoPro Hero", () => {
    const result = detectCameraBrand("GoPro Hero 12")
    expect(result.brand).toBe("GoPro")
    expect(result.label).toBe("GoPro")
  })

  it("识别 Xiaomi", () => {
    const result = detectCameraBrand("Xiaomi 14 Ultra")
    expect(result.brand).toBe("Xiaomi")
    expect(result.label).toBe("Xiaomi")
  })

  it("识别 Pentax 67", () => {
    const result = detectCameraBrand("Pentax 67")
    expect(result.brand).toBe("Pentax")
    expect(result.label).toBe("PENTAX")
  })

  it("识别 Ricoh GR III", () => {
    const result = detectCameraBrand("Ricoh GR III")
    expect(result.brand).toBe("Ricoh")
    expect(result.label).toBe("RICOH")
  })

  it("识别 Olympus OM-1", () => {
    const result = detectCameraBrand("Olympus OM-1")
    expect(result.brand).toBe("Olympus")
    expect(result.label).toBe("OLYMPUS")
  })

  it("识别 Sigma fp", () => {
    const result = detectCameraBrand("Sigma fp")
    expect(result.brand).toBe("Sigma")
    expect(result.label).toBe("SIGMA")
  })

  it("空字符串返回 null", () => {
    const result = detectCameraBrand("")
    expect(result.brand).toBeNull()
    expect(result.label).toBeNull()
  })

  it("detectBrandFromIdentity 与 detectCameraBrand 一致", () => {
    const result = detectBrandFromIdentity("Nikon F3")
    expect(result.brand).toBe("Nikon")
    expect(result.label).toBe("NIKON")
  })
})
