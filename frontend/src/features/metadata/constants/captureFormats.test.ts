import { describe, expect, it } from "vitest"
import {
  CAPTURE_FORMATS,
  CAPTURE_FORMAT_GROUPS,
  captureFormatLabel,
  findCaptureFormat,
  isKnownCaptureFormat
} from "./captureFormats"

describe("captureFormats 画幅目录", () => {
  it("id 全局唯一", () => {
    const ids = CAPTURE_FORMATS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("每个条目字段齐全且归类合法", () => {
    for (const format of CAPTURE_FORMATS) {
      expect(format.id.length).toBeGreaterThan(0)
      expect(format.label.length).toBeGreaterThan(0)
      expect(["digital", "film"]).toContain(format.kind)
      expect(format.aspectRatio).toMatch(/^\d+:\d+$/)
    }
  })

  it("覆盖数码（M43/APS-C/135 全画幅/4433）与胶片画幅", () => {
    expect(findCaptureFormat("m43")?.kind).toBe("digital")
    expect(findCaptureFormat("apsc")?.kind).toBe("digital")
    expect(findCaptureFormat("fullframe")?.kind).toBe("digital")
    expect(findCaptureFormat("4433")?.kind).toBe("digital")
    expect(findCaptureFormat("half-frame")?.kind).toBe("film")
    expect(findCaptureFormat("135")?.kind).toBe("film")
    expect(findCaptureFormat("645")?.kind).toBe("film")
    expect(findCaptureFormat("6x6")?.kind).toBe("film")
    expect(findCaptureFormat("6x7")?.kind).toBe("film")
    expect(findCaptureFormat("6x8")?.kind).toBe("film")
    expect(findCaptureFormat("6x9")?.kind).toBe("film")
    expect(findCaptureFormat("6x10")?.kind).toBe("film")
    expect(findCaptureFormat("6x12")?.kind).toBe("film")
  })

  it("胶片画幅 id 与引擎 /api/film-formats 契约一致（含 6x10 与 6x12）", () => {
    const engineIds = ["half-frame", "135", "645", "6x6", "6x7", "6x8", "6x9", "6x10", "6x12"]
    const filmIds = CAPTURE_FORMATS.filter((f) => f.kind === "film").map((f) => f.id)
    expect(filmIds).toEqual(engineIds)
  })

  it("6x10 与 6x12 同时存在，且 6x12 未被替换或改名", () => {
    expect(findCaptureFormat("6x10")?.label).toBe("6×10")
    expect(findCaptureFormat("6x12")?.label).toBe("6×12")
    expect(findCaptureFormat("6x12")?.id).toBe("6x12")
    // 顺序：6x10 在 6x12 之前
    const filmIds = CAPTURE_FORMATS.filter((f) => f.kind === "film").map((f) => f.id)
    expect(filmIds.indexOf("6x10")).toBeGreaterThanOrEqual(0)
    expect(filmIds.indexOf("6x12")).toBeGreaterThan(filmIds.indexOf("6x10"))
  })

  it("胶片画幅展示比例与引擎契约归一化后一致", () => {
    expect(findCaptureFormat("6x9")?.aspectRatio).toBe("45:28")
    expect(findCaptureFormat("6x10")?.aspectRatio).toBe("25:14")
    expect(findCaptureFormat("6x12")?.aspectRatio).toBe("15:7")
  })

  it("findCaptureFormat 未知 id 返回 null", () => {
    expect(findCaptureFormat("unknown-format")).toBeNull()
  })

  it("captureFormatLabel 已知 id 返回显示名", () => {
    expect(captureFormatLabel("135")).toBe("135")
    expect(captureFormatLabel("half-frame")).toBe("半格")
    expect(captureFormatLabel("fullframe")).toBe("135 全画幅")
  })

  it("captureFormatLabel 空值/未知 id 返回空字符串（不显示 undefined/null）", () => {
    expect(captureFormatLabel(null)).toBe("")
    expect(captureFormatLabel(undefined)).toBe("")
    expect(captureFormatLabel("")).toBe("")
    expect(captureFormatLabel("unknown")).toBe("")
  })

  it("isKnownCaptureFormat 正确判断", () => {
    expect(isKnownCaptureFormat("6x7")).toBe(true)
    expect(isKnownCaptureFormat("m43")).toBe(true)
    expect(isKnownCaptureFormat("bogus")).toBe(false)
  })

  it("分组包含数码与胶片两组", () => {
    const kinds = CAPTURE_FORMAT_GROUPS.map((g) => g.kind)
    expect(kinds).toEqual(["digital", "film"])
    const groupedIds = CAPTURE_FORMAT_GROUPS.flatMap((g) => g.formats.map((f) => f.id))
    expect(groupedIds).toEqual(CAPTURE_FORMATS.map((f) => f.id))
  })
})
