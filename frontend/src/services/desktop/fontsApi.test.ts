import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { BUILTIN_FONTS, loadFontOptions, isBuiltinFont, normalizeFontName } from "./fontsApi"

describe("fontsApi", () => {
  describe("BUILTIN_FONTS", () => {
    it("包含 sans-serif 和 serif", () => {
      const values = BUILTIN_FONTS.map((f) => f.value)
      expect(values).toContain("sans-serif")
      expect(values).toContain("serif")
    })

    it("所有内置字体 source 为 builtin", () => {
      for (const font of BUILTIN_FONTS) {
        expect(font.source).toBe("builtin")
      }
    })
  })

  describe("isBuiltinFont", () => {
    it("内置字体返回 true", () => {
      expect(isBuiltinFont("sans-serif")).toBe(true)
      expect(isBuiltinFont("serif")).toBe(true)
    })

    it("非内置字体返回 false", () => {
      expect(isBuiltinFont("Arial")).toBe(false)
      expect(isBuiltinFont("Helvetica")).toBe(false)
    })
  })

  // ---- 字体名归一化测试 ------------------------------------------------------

  describe("normalizeFontName", () => {
    it("转小写", () => {
      expect(normalizeFontName("Arial")).toBe("arial")
      expect(normalizeFontName("HELVETICA")).toBe("helvetica")
    })

    it("连字符替换为空格", () => {
      expect(normalizeFontName("Times-New-Roman")).toBe("times new roman")
    })

    it("下划线替换为空格", () => {
      expect(normalizeFontName("Helvetica_Neue")).toBe("helvetica neue")
    })

    it("连续空格压缩", () => {
      expect(normalizeFontName("Arial  Bold")).toBe("arial")
    })

    it("去除 Bold 后缀", () => {
      expect(normalizeFontName("Arial Bold")).toBe("arial")
      expect(normalizeFontName("Helvetica-Bold")).toBe("helvetica")
    })

    it("去除 Italic 后缀", () => {
      expect(normalizeFontName("Arial Italic")).toBe("arial")
      expect(normalizeFontName("Times-Italic")).toBe("times")
    })

    it("去除 Regular 后缀", () => {
      expect(normalizeFontName("Arial Regular")).toBe("arial")
    })

    it("去除 Light / Medium / Semibold 后缀", () => {
      expect(normalizeFontName("Helvetica Light")).toBe("helvetica")
      expect(normalizeFontName("Helvetica Medium")).toBe("helvetica")
      expect(normalizeFontName("Helvetica Semibold")).toBe("helvetica")
    })

    it("去除 Condensed / Extended 后缀", () => {
      expect(normalizeFontName("Arial Condensed")).toBe("arial")
      expect(normalizeFontName("Arial Extended")).toBe("arial")
    })

    it("混合后缀归一化后一致", () => {
      // 带后缀和不带后缀归一化后相同
      expect(normalizeFontName("Arial Bold")).toBe(normalizeFontName("Arial"))
      expect(normalizeFontName("Helvetica-Bold")).toBe(normalizeFontName("helvetica bold"))
      // 连字符和下划线归一化后一致
      expect(normalizeFontName("Times-New-Roman")).toBe(normalizeFontName("Times New Roman"))
      expect(normalizeFontName("Helvetica_Neue")).toBe(normalizeFontName("Helvetica Neue"))
    })

    it("空字符串处理安全", () => {
      expect(normalizeFontName("")).toBe("")
    })
  })

  // ---- loadFontOptions 测试 ---------------------------------------------------

  describe("loadFontOptions", () => {
    beforeEach(() => {
      vi.stubGlobal("window", {})
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it("浏览器模式（无 desktop）仅返回内置字体", async () => {
      const options = await loadFontOptions()
      expect(options.length).toBe(BUILTIN_FONTS.length)
    })

    it("桌面模式合并系统字体", async () => {
      vi.stubGlobal("window", {
        desktop: {
          listSystemFonts: vi.fn().mockResolvedValue(["Arial", "Helvetica", "Times New Roman"])
        }
      })
      const options = await loadFontOptions()
      expect(options.length).toBe(BUILTIN_FONTS.length + 3)
      const systemFonts = options.filter((f) => f.source === "system")
      expect(systemFonts.length).toBe(3)
    })

    it("系统字体与内置重复时去重", async () => {
      vi.stubGlobal("window", {
        desktop: {
          listSystemFonts: vi.fn().mockResolvedValue(["sans-serif", "Arial"])
        }
      })
      const options = await loadFontOptions()
      expect(options.length).toBe(BUILTIN_FONTS.length + 1)
    })

    it("IPC 失败时回退到内置字体", async () => {
      vi.stubGlobal("window", {
        desktop: {
          listSystemFonts: vi.fn().mockRejectedValue(new Error("IPC error"))
        }
      })
      const options = await loadFontOptions()
      expect(options.length).toBe(BUILTIN_FONTS.length)
    })

    it("归一化匹配：系统候选 Arial Bold 匹配引擎 Arial", async () => {
      // 模拟引擎返回 "Arial"（不带 Bold 后缀）
      // 系统枚举返回 "Arial Bold"（带后缀）
      // 归一化后两者都变成 "arial"，应匹配为 engineAvailable=true
      vi.stubGlobal("window", {
        desktop: {
          listSystemFonts: vi.fn().mockResolvedValue(["Arial Bold"])
        }
      })
      // mock fetch 返回引擎字体列表
      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ fonts: ["Arial"] })
      }) as unknown as typeof fetch

      const options = await loadFontOptions()
      const arialBold = options.find((f) => f.value === "Arial Bold")
      expect(arialBold).toBeDefined()
      expect(arialBold?.engineAvailable).toBe(true)

      globalThis.fetch = originalFetch
    })

    it("归一化匹配：系统候选 Helvetica Neue 匹配引擎 Helvetica-Neue", async () => {
      vi.stubGlobal("window", {
        desktop: {
          listSystemFonts: vi.fn().mockResolvedValue(["Helvetica Neue"])
        }
      })
      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ fonts: ["Helvetica-Neue"] })
      }) as unknown as typeof fetch

      const options = await loadFontOptions()
      const helvetica = options.find((f) => f.value === "Helvetica Neue")
      expect(helvetica?.engineAvailable).toBe(true)

      globalThis.fetch = originalFetch
    })

    it("引擎不可达时所有系统字体 engineAvailable=false", async () => {
      vi.stubGlobal("window", {
        desktop: {
          listSystemFonts: vi.fn().mockResolvedValue(["Arial"])
        }
      })
      const originalFetch = globalThis.fetch
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("engine unreachable"))

      const options = await loadFontOptions()
      const arial = options.find((f) => f.value === "Arial")
      expect(arial?.engineAvailable).toBe(false)

      globalThis.fetch = originalFetch
    })
  })
})
