import { describe, expect, it } from "vitest"
import { isRawFile, getRawFormatName, getRawTier, RAW_TIER_LABELS, type RawTier } from "./rawExtensions"

describe("rawExtensions 能力分级", () => {
  describe("getRawTier", () => {
    it("NEF 为 preview-supported", () => {
      expect(getRawTier("/photos/img.nef")).toBe("preview-supported")
    })

    it("CR2 为 preview-supported", () => {
      expect(getRawTier("/photos/img.cr2")).toBe("preview-supported")
    })

    it("DNG 为 preview-supported", () => {
      expect(getRawTier("/photos/img.dng")).toBe("preview-supported")
    })

    it("ARW 为 preview-only", () => {
      expect(getRawTier("/photos/img.arw")).toBe("preview-only")
    })

    it("CR3 为 preview-only", () => {
      expect(getRawTier("/photos/img.cr3")).toBe("preview-only")
    })

    it("RAF 为 preview-only", () => {
      expect(getRawTier("/photos/img.raf")).toBe("preview-only")
    })

    it("非 RAW 文件返回 unsupported", () => {
      expect(getRawTier("/photos/img.jpg")).toBe("unsupported")
    })

    it("无扩展名返回 unsupported", () => {
      expect(getRawTier("/photos/img")).toBe("unsupported")
    })
  })

  describe("RAW_TIER_LABELS", () => {
    it("包含所有分级的中文说明", () => {
      const tiers: RawTier[] = ["preview-supported", "preview-only", "unsupported"]
      for (const tier of tiers) {
        expect(RAW_TIER_LABELS[tier]).toBeTruthy()
        expect(RAW_TIER_LABELS[tier].length).toBeGreaterThan(0)
      }
    })
  })

  describe("isRawFile + getRawTier 一致性", () => {
    it("所有 isRawFile 为 true 的文件 tier 不是 unsupported", () => {
      const exts = [".nef", ".cr2", ".cr3", ".arw", ".raf", ".dng", ".orf", ".rw2", ".pef"]
      for (const ext of exts) {
        const path = `/photos/img${ext}`
        expect(isRawFile(path)).toBe(true)
        expect(getRawTier(path)).not.toBe("unsupported")
      }
    })
  })

  describe("getRawFormatName", () => {
    it("返回正确的格式名称", () => {
      expect(getRawFormatName("/photos/img.nef")).toBe("Nikon NEF")
      expect(getRawFormatName("/photos/img.cr2")).toBe("Canon CR2")
      expect(getRawFormatName("/photos/img.dng")).toBe("Adobe DNG")
    })
  })
})
