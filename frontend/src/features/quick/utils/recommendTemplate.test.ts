import { describe, expect, it } from "vitest"
import { orientationFromSize, recommendTemplateId } from "./recommendTemplate"

describe("recommendTemplateId（确定性推荐规则）", () => {
  it("中画幅/大画幅画幅优先推荐中画幅留白", () => {
    for (const format of ["645", "6x6", "6x7", "6x8", "6x9", "6x10", "6x12", "4433"]) {
      expect(recommendTemplateId({
        orientation: "landscape",
        isFilm: false,
        captureFormatId: format,
        hasCameraOrLens: true
      }), `画幅 ${format} 应推荐中画幅留白`).toBe("medium-format-margin")
    }
  })

  it("胶片照片推荐摄影信息卡（可展示 {Film}）", () => {
    expect(recommendTemplateId({
      orientation: "landscape",
      isFilm: true,
      captureFormatId: "135",
      hasCameraOrLens: false
    })).toBe("photo-info-card")
  })

  it("数码照片且有相机/镜头信息推荐摄影信息卡", () => {
    expect(recommendTemplateId({
      orientation: "portrait",
      isFilm: false,
      captureFormatId: "fullframe",
      hasCameraOrLens: true
    })).toBe("photo-info-card")
  })

  it("缺少可展示信息时：竖图推荐极简黑边，横图/方形推荐经典白边", () => {
    expect(recommendTemplateId({
      orientation: "portrait",
      isFilm: false,
      captureFormatId: null,
      hasCameraOrLens: false
    })).toBe("minimal-black")

    expect(recommendTemplateId({
      orientation: "landscape",
      isFilm: false,
      captureFormatId: null,
      hasCameraOrLens: false
    })).toBe("classic-white")

    expect(recommendTemplateId({
      orientation: "square",
      isFilm: false,
      captureFormatId: null,
      hasCameraOrLens: false
    })).toBe("classic-white")

    // 方向未知（预览图未加载）时按经典白边处理
    expect(recommendTemplateId({
      orientation: null,
      isFilm: false,
      captureFormatId: null,
      hasCameraOrLens: false
    })).toBe("classic-white")
  })

  it("同一输入永远返回同一推荐（确定性）", () => {
    const input = {
      orientation: "portrait" as const,
      isFilm: true,
      captureFormatId: "135",
      hasCameraOrLens: true
    }
    const results = new Set(Array.from({ length: 20 }, () => recommendTemplateId(input)))
    expect(results.size).toBe(1)
  })
})

describe("orientationFromSize（方向判断）", () => {
  it("横图 / 竖图 / 方形", () => {
    expect(orientationFromSize(4000, 3000)).toBe("landscape")
    expect(orientationFromSize(3000, 4000)).toBe("portrait")
    expect(orientationFromSize(3000, 3000)).toBe("square")
  })

  it("缺失或非法尺寸返回 null", () => {
    expect(orientationFromSize(null, null)).toBeNull()
    expect(orientationFromSize(0, 0)).toBeNull()
    expect(orientationFromSize(4000, undefined)).toBeNull()
  })
})
