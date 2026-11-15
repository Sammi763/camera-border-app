import { describe, expect, it } from "vitest"
import { migrateImageProcessing } from "./imageProcessingSession"

const base = { schemaVersion: 1, algorithmVersion: "film-digitization-v1", inputMode: "sensor-raw", raw: {} }

describe("底片会话嵌套配置恢复", () => {
  it("保留合法曲线并断开原对象引用", () => {
    const config = { ...base, positive: { masterCurve: { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } } }
    const result = migrateImageProcessing(config)
    expect(result.error).toBeNull()
    expect(result.config?.positive).not.toBe(config.positive)
  })
  it.each([
    { positive: [] },
    { positive: { masterCurve: { points: "broken" } } },
    { positive: { masterCurve: { points: [{ x: 0, y: 0 }, { x: 0, y: 1 }] } } },
    { positive: { rgbBalanceEv: [1, 2] } },
    { positive: { exposureEv: Infinity } },
    { negative: { filmBase: "broken" } },
    { raw: [] }
  ])("损坏嵌套数据关闭处理并说明原因：%j", (patch) => {
    const result = migrateImageProcessing({ ...base, ...patch })
    expect(result.config).toBeNull()
    expect(result.error).toBeTruthy()
  })
})

describe("v2 胶片校色会话恢复", () => {
  const v2 = {
    schemaVersion: 2,
    algorithmVersion: "film-color-v2",
    inputSource: "encoded-raster",
    filmPolarity: "positive",
    encodedInput: { colorSpace: "srgb", bitDepth: 8 },
    positive: { exposureEv: 0.4 }
  }

  it("保留正片来源与正负性质，不要求 negative", () => {
    const result = migrateImageProcessing(v2)
    expect(result.error).toBeNull()
    expect(result.config?.schemaVersion).toBe(2)
    expect(result.config?.inputSource).toBe("encoded-raster")
    expect(result.config?.filmPolarity).toBe("positive")
  })

  it.each([
    { ...v2, algorithmVersion: "film-digitization-v1" },
    { ...v2, inputSource: "scanner-mode" },
    { ...v2, filmPolarity: "negative" },
    { ...v2, encodedInput: null },
    { ...v2, sourceGeometry: "broken" }
  ])("损坏或未知 v2 配置关闭处理：%j", (value) => {
    const result = migrateImageProcessing(value)
    expect(result.config).toBeNull()
    expect(result.error).toBeTruthy()
  })
})

it("拒绝损坏的 v2 输入域、位深和超界裁切", () => {
  const base = { schemaVersion: 2, algorithmVersion: "film-color-v2", filmPolarity: "positive", inputSource: "encoded-raster", encodedInput: { colorSpace: "srgb", bitDepth: 16 } }
  for (const config of [
    { ...base, encodedInput: { colorSpace: "unknown", bitDepth: 16 } },
    { ...base, encodedInput: { colorSpace: "srgb", bitDepth: 32 } },
    { ...base, sourceGeometry: { crop: { x: .9, y: 0, width: .5, height: 1 } } },
    { ...base, positive: { exposureEv: 20 } }
  ]) expect(migrateImageProcessing(config).config).toBeNull()
})
