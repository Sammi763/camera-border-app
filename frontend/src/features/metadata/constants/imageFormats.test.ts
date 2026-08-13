import { describe, expect, it } from "vitest"
import { isHeicFile, HEIC_FORMAT_NAME } from "./imageFormats"

describe("imageFormats", () => {
  describe("isHeicFile", () => {
    it("识别 .heic 扩展名", () => {
      expect(isHeicFile("/photos/IMG_1234.heic")).toBe(true)
    })

    it("识别 .heif 扩展名", () => {
      expect(isHeicFile("/photos/IMG_1234.heif")).toBe(true)
    })

    it("大写扩展名也识别", () => {
      expect(isHeicFile("/photos/IMG_1234.HEIC")).toBe(true)
      expect(isHeicFile("/photos/IMG_1234.HEIF")).toBe(true)
    })

    it("非 HEIC 文件返回 false", () => {
      expect(isHeicFile("/photos/IMG_1234.jpg")).toBe(false)
      expect(isHeicFile("/photos/IMG_1234.png")).toBe(false)
      expect(isHeicFile("/photos/IMG_1234.nef")).toBe(false)
    })

    it("无扩展名返回 false", () => {
      expect(isHeicFile("/photos/IMG_1234")).toBe(false)
    })

    it("空字符串返回 false", () => {
      expect(isHeicFile("")).toBe(false)
    })
  })

  describe("HEIC_FORMAT_NAME", () => {
    it("格式名称正确", () => {
      expect(HEIC_FORMAT_NAME).toBe("HEIC/HEIF")
    })
  })
})
