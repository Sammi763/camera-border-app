import { describe, expect, it } from "vitest"
import type { ExportSettings, RenderJobRequest, FeatureResult, FeatureStatus } from "../../types/preview"
import { toExportFileName } from "../../utils/fileName"

describe("专业导出结构化结果", () => {
  describe("ExportSettings 类型", () => {
    it("支持 tiff 格式", () => {
      const settings: ExportSettings = {
        format: "tiff",
        outputPath: "/tmp/output.tif",
        jpegQuality: 95,
        preserveMetadata: true,
        preserveColorProfile: true,
        preferHighBitDepth: true
      }
      expect(settings.format).toBe("tiff")
      expect(settings.preserveMetadata).toBe(true)
    })

    it("支持 png 格式（无专业字段时仍合法）", () => {
      const settings: ExportSettings = {
        format: "png",
        outputPath: "/tmp/output.png",
        jpegQuality: 95
      }
      expect(settings.format).toBe("png")
      expect(settings.preserveMetadata).toBeUndefined()
    })
  })

  describe("FeatureResult 状态枚举", () => {
    it("NOT_REQUESTED：用户未开启此能力", () => {
      const result: FeatureResult = { status: "NOT_REQUESTED", message: null }
      expect(result.status).toBe("NOT_REQUESTED")
      expect(result.message).toBeNull()
    })

    it("SKIPPED：当前版本不支持，已跳过", () => {
      const result: FeatureResult = {
        status: "SKIPPED",
        message: "当前版本暂不支持 EXIF 元数据保留，已跳过"
      }
      expect(result.status).toBe("SKIPPED")
      expect(result.message).toContain("暂不支持")
    })

    it("APPLIED：已实际应用", () => {
      const result: FeatureResult = { status: "APPLIED", message: "EXIF 已保留" }
      expect(result.status).toBe("APPLIED")
    })

    it("DOWNGRADED：已降级", () => {
      const result: FeatureResult = { status: "DOWNGRADED", message: "高位深降级为 8bit" }
      expect(result.status).toBe("DOWNGRADED")
    })
  })

  describe("RenderJobRequest 透传专业字段", () => {
    it("tiff 请求包含所有专业字段", () => {
      const request: RenderJobRequest = {
        items: [{
          recipe: {
            imagePath: "/photos/img.jpg",
            border: { top: 20, bottom: 80, left: 20, right: 20, color: "#ffffff" },
            gradient: null,
            texts: [],
            filmFormat: null,
            autoCrop: false
          },
          export: {
            format: "tiff",
            outputPath: "/tmp/output.tif",
            jpegQuality: 95,
            preserveMetadata: true,
            preserveColorProfile: true,
            preferHighBitDepth: true
          }
        }]
      }
      expect(request.items[0]?.export.format).toBe("tiff")
      expect(request.items[0]?.export.preserveMetadata).toBe(true)
    })
  })

  describe("toExportFileName 支持 tiff", () => {
    it("tiff 格式生成 .tif 扩展名", () => {
      expect(toExportFileName("IMG_1234.jpg", "tiff")).toBe("IMG_1234-border.tif")
    })
    it("png 格式生成 .png 扩展名", () => {
      expect(toExportFileName("IMG_1234.jpg", "png")).toBe("IMG_1234-border.png")
    })
    it("jpeg 格式生成 .jpg 扩展名", () => {
      expect(toExportFileName("IMG_1234.jpg", "jpeg")).toBe("IMG_1234-border.jpg")
    })
  })

  describe("RenderJobStatusResponse 结构化结果", () => {
    it("completed 状态携带 FeatureResult", () => {
      const response = {
        jobId: "test-job-1",
        status: "completed" as const,
        outputPath: "/tmp/output.tif",
        actualFormat: "tiff",
        metadataPreservation: {
          status: "SKIPPED" as FeatureStatus,
          message: "当前版本暂不支持 EXIF 元数据保留，已跳过"
        },
        colorProfilePreservation: {
          status: "SKIPPED" as FeatureStatus,
          message: "当前版本暂不支持 ICC 色彩配置文件嵌入，已跳过"
        },
        highBitDepth: {
          status: "SKIPPED" as FeatureStatus,
          message: "当前版本暂不支持高位深输出，已使用 8bit"
        }
      }
      expect(response.metadataPreservation?.status).toBe("SKIPPED")
      expect(response.colorProfilePreservation?.status).toBe("SKIPPED")
      expect(response.highBitDepth?.status).toBe("SKIPPED")
    })

    it("未开启专业选项时 status 为 NOT_REQUESTED", () => {
      const response = {
        jobId: "test-job-2",
        status: "completed" as const,
        outputPath: "/tmp/output.png",
        actualFormat: "png",
        metadataPreservation: { status: "NOT_REQUESTED" as FeatureStatus, message: null },
        colorProfilePreservation: { status: "NOT_REQUESTED" as FeatureStatus, message: null },
        highBitDepth: { status: "NOT_REQUESTED" as FeatureStatus, message: null }
      }
      expect(response.metadataPreservation?.status).toBe("NOT_REQUESTED")
    })
  })
})
