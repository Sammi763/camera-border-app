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
