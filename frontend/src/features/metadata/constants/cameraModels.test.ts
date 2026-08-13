import { describe, expect, it } from "vitest"
import { BUILT_IN_CAMERA_MODELS } from "./cameraModels"
import { createEmptyIdentity } from "../types"
import type { PhotoIdentity } from "../types"
import { resolveTextVariables } from "../utils/resolveTextVariables"

describe("BUILT_IN_CAMERA_MODELS", () => {
  it("不少于 12 个，每个有唯一 id 和 label", () => {
    expect(BUILT_IN_CAMERA_MODELS.length).toBeGreaterThanOrEqual(12)
    const ids = new Set(BUILT_IN_CAMERA_MODELS.map((m) => m.id))
    expect(ids.size).toBe(BUILT_IN_CAMERA_MODELS.length)
    for (const m of BUILT_IN_CAMERA_MODELS) {
      expect(m.label).toContain(m.brand)
      expect(m.label).toContain(m.model)
    }
  })

  it("包含 Nikon F3 和 Leica M6", () => {
    expect(BUILT_IN_CAMERA_MODELS.some((m) => m.label === "Nikon F3")).toBe(true)
    expect(BUILT_IN_CAMERA_MODELS.some((m) => m.label === "Leica M6")).toBe(true)
  })
})

describe("选择机型后 {Camera} 变量解析", () => {
  it("选择机型后 {Camera} 解析为对应 label，未设置时为空", () => {
    const withCamera: PhotoIdentity = { ...createEmptyIdentity(), camera: "Nikon F3" }
    expect(resolveTextVariables("{Camera} · {Lens} · {Film}", withCamera)).toBe("Nikon F3")

    const withContax: PhotoIdentity = { ...createEmptyIdentity(), camera: "Contax T2" }
    expect(resolveTextVariables("{Camera}", withContax)).toBe("Contax T2")

    const empty = createEmptyIdentity()
    expect(resolveTextVariables("{Camera} · {Film}", empty)).toBe("")
  })
})
