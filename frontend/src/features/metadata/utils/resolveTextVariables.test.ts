import { describe, expect, it } from "vitest"
import { resolveTextVariables } from "./resolveTextVariables"
import { createEmptyIdentity } from "../types"
import type { PhotoIdentity } from "../types"

/** 创建一个填满所有字段的测试身份。 */
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

describe("resolveTextVariables", () => {
  it("完整变量替换", () => {
    const template = "{Camera} · {Lens} · {Film} · {Scanner} · {Lab}"
    const result = resolveTextVariables(template, fullIdentity)
    expect(result).toBe("Leica M6 · Voigtlander 35mm F1.4 · Kodak Portra 400 · Noritsu HS-1800 · Local Lab")
  })

  it("缺失变量清理多余 ·", () => {
    const identity: PhotoIdentity = {
      ...createEmptyIdentity(),
      camera: "Leica M6",
      film: "Kodak Portra 400"
    }
    const template = "{Camera} · {Lens} · {Film}"
    const result = resolveTextVariables(template, identity)
    expect(result).toBe("Leica M6 · Kodak Portra 400")
  })

  it("未知变量保留", () => {
    const identity: PhotoIdentity = {
      ...createEmptyIdentity(),
      camera: "Leica M6"
    }
    const template = "{Camera} · {UnknownVar}"
    const result = resolveTextVariables(template, identity)
    expect(result).toBe("Leica M6 · {UnknownVar}")
  })

  it("每图覆盖文本中的变量也能解析", () => {
    const template = "{Film} · {Scanner}"
    const result = resolveTextVariables(template, fullIdentity)
    expect(result).toBe("Kodak Portra 400 · Noritsu HS-1800")
  })

  it("换行模板正常解析，不要被错误压成一行", () => {
    const template = "{Camera}\n{Lens}\n{Film}"
    const result = resolveTextVariables(template, fullIdentity)
    expect(result).toBe("Leica M6\nVoigtlander 35mm F1.4\nKodak Portra 400")
  })

  it("换行模板中缺失变量清理空行", () => {
    const identity: PhotoIdentity = {
      ...createEmptyIdentity(),
      camera: "Leica M6",
      film: "Kodak Portra 400"
    }
    const template = "{Camera}\n{Lens}\n{Film}"
    const result = resolveTextVariables(template, identity)
    expect(result).toBe("Leica M6\nKodak Portra 400")
  })

  it("空模板返回空字符串", () => {
    expect(resolveTextVariables("", fullIdentity)).toBe("")
    expect(resolveTextVariables("   ", fullIdentity)).toBe("")
  })

  it("全部变量缺失返回空字符串", () => {
    const identity = createEmptyIdentity()
    const template = "{Camera} · {Lens} · {Film}"
    const result = resolveTextVariables(template, identity)
    expect(result).toBe("")
  })

  it("变量名大小写不敏感", () => {
    const identity: PhotoIdentity = {
      ...createEmptyIdentity(),
      camera: "Leica M6"
    }
    const template = "{camera} · {CAMERA}"
    const result = resolveTextVariables(template, identity)
    // 两个变量都应该被替换为同一个值
    expect(result).toBe("Leica M6 · Leica M6")
  })

  it("无变量的文本保持原样", () => {
    const template = "这是一段普通文字，不含变量"
    const result = resolveTextVariables(template, fullIdentity)
    expect(result).toBe(template)
  })

  it("全部字段完整替换", () => {
    const template = "{Camera} · {Lens} · {Film} · {Developer} · {Scanner} · {Lab} · {Location} · {RollName} · #{FrameNumber}"
    const result = resolveTextVariables(template, fullIdentity)
    expect(result).toBe("Leica M6 · Voigtlander 35mm F1.4 · Kodak Portra 400 · C-41 · Noritsu HS-1800 · Local Lab · Kyoto · 2025-03 Kyoto · #12")
  })

  it("开头和结尾的分隔符被清理", () => {
    const identity: PhotoIdentity = {
      ...createEmptyIdentity(),
      film: "Kodak Portra 400"
    }
    const template = " · {Camera} · {Film} · "
    const result = resolveTextVariables(template, identity)
    expect(result).toBe("Kodak Portra 400")
  })

  it("连续多个分隔符合并为一个", () => {
    const identity: PhotoIdentity = {
      ...createEmptyIdentity(),
      camera: "Leica M6",
      film: "Kodak Portra 400"
    }
    const template = "{Camera} · · · {Lens} · · {Film}"
    const result = resolveTextVariables(template, identity)
    expect(result).toBe("Leica M6 · Kodak Portra 400")
  })
})
