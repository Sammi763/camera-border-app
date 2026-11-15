import { afterEach, describe, expect, it } from "vitest"
import { copyPositive, parseFilmColorPresets, readFilmColorPresets, writeFilmColorPresets } from "./filmColorPresets"
afterEach(() => localStorage.clear())
const entry = { id: "look-1", name: "日光人像", schemaVersion: 1, positive: { exposureEv: 0.25, rgbBalanceEv: [0.1, 0, -0.1] } }
describe("个人校色配方存储", () => {
  it("重读恢复观感，复制时移除源路径并断开数值引用", async () => {
    const positive = { exposureEv: 0.5, rgbBalanceEv: [0, 1, 2] as [number, number, number], imagePath: "/private/source.tif" }
    const copy = copyPositive(positive)
    positive.rgbBalanceEv[0] = 3
    expect(copy).toEqual({ exposureEv: 0.5, rgbBalanceEv: [0, 1, 2] })
    await writeFilmColorPresets([{ ...entry, schemaVersion: 1, positive: copy }])
    expect((await readFilmColorPresets())[0]?.positive).toEqual(copy)
  })
  it("拒绝未知版本、损坏数值/曲线和重复ID", () => {
    for (const item of [{ ...entry, schemaVersion: 99 }, { ...entry, positive: { exposureEv: 9 } },
      { ...entry, positive: { rgbBalanceEv: [1] } }, { ...entry, positive: { masterCurve: { points: [{ x: 1, y: 0 }] } } }]) {
      expect(() => parseFilmColorPresets(JSON.stringify([item]))).toThrow()
    }
    expect(() => parseFilmColorPresets(JSON.stringify([entry, entry]))).toThrow()
    expect(() => parseFilmColorPresets("{broken")).toThrow()
  })
})
