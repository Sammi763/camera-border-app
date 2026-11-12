import { describe, expect, it } from "vitest"
import { DEFAULT_SETTINGS } from "../hooks/useSettings"
import { buildPreviewRequest, buildRecipeFromSettings } from "./buildRecipe"
import type { ImageAnalysisRequest, ImageProcessingConfig } from "../../../types/imageProcessing"

const filmProcessing: ImageProcessingConfig = {
  schemaVersion: 1,
  algorithmVersion: "film-digitization-v1",
  inputMode: "sensor-raw",
  raw: {
    whiteBalance: "camera",
    autoBright: false,
    gamma: "linear",
    highlight: "clip",
    crop: "vendor-inset"
  },
  negative: {
    enabled: true,
    lightSource: { kind: "camera-white-balance" },
    filmBase: {
      kind: "roi",
      roi: { x: 0.02, y: 0.02, width: 0.08, height: 0.05 },
      stage: "linear-working"
    },
    density: { min: 0, max: 3.2 },
    profile: "generic-color-negative-v1"
  },
  positive: {
    exposureEv: 0.25,
    rgbBalanceEv: [0, 0, 0],
    blackPoint: 0,
    whitePoint: 1,
    saturation: 1,
    masterCurve: {
      interpolation: "linear",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 }
      ]
    }
  },
  sourceGeometry: {
    crop: { x: 0, y: 0, width: 1, height: 1 },
    rotationDegrees: 0
  }
}

describe("底片数字化契约（T02）", () => {
  it("普通模式不写 imageProcessing，旧请求保持可用", () => {
    const recipe = buildRecipeFromSettings("/photos/a.jpg", DEFAULT_SETTINGS)

    expect("imageProcessing" in recipe).toBe(false)
  })

  it("底片配置原样进入预览与导出共用的 recipe", () => {
    const recipe = buildRecipeFromSettings(
      "/photos/negative.arw",
      DEFAULT_SETTINGS,
      undefined,
      undefined,
      undefined,
      filmProcessing
    )
    const request = buildPreviewRequest(
      "/photos/negative.arw",
      DEFAULT_SETTINGS,
      1200,
      800,
      undefined,
      undefined,
      undefined,
      filmProcessing
    )

    expect(recipe.imageProcessing).toBe(filmProcessing)
    expect(request.recipe.imageProcessing).toEqual(filmProcessing)
    expect(request.recipe.imageProcessing?.inputMode).toBe("sensor-raw")
  })

  it("分析请求使用同一 recipe 和冻结的分析阶段", () => {
    const request: ImageAnalysisRequest = {
      recipe: buildRecipeFromSettings(
        "/photos/negative.arw",
        DEFAULT_SETTINGS,
        undefined,
        undefined,
        undefined,
        filmProcessing
      ),
      stage: "current-positive",
      roi: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }
    }

    expect(request.stage).toBe("current-positive")
    expect(request.recipe.imageProcessing).toBe(filmProcessing)
  })
})
