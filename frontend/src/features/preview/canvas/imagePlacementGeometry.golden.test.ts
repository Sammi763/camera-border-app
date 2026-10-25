import { describe, expect, it } from "vitest"
import { calculateImagePlacementGeometry } from "./imagePlacementGeometry"
import goldenText from "../../../../../fixtures/stage4/geometry-golden.json?raw"

type GoldenCase = {
  readonly id: string
  readonly source: { readonly width: number; readonly height: number }
  readonly placement: {
    readonly mode: "fit" | "fill"
    readonly focalX: number
    readonly focalY: number
    readonly rotation: number
    readonly targetAspectRatio: number | null
  }
  readonly expected: Record<string, number>
}

type GoldenFile = {
  readonly schema: string
  readonly cases: readonly GoldenCase[]
}

const golden = JSON.parse(goldenText) as GoldenFile

const NUMERIC_FIELDS = [
  "sourceWidth", "sourceHeight", "rotatedWidth", "rotatedHeight",
  "targetWidth", "targetHeight", "drawWidth", "drawHeight",
  "offsetX", "offsetY", "scale"
] as const

describe("Canvas 与 Java 共用的 Stage 4 几何 golden 矩阵", () => {
  it("覆盖两种模式、四种直角旋转、三组焦点和多个目标比例", () => {
    expect(golden.schema).toBe("camera-border.stage4.geometry-golden.v1")
    expect(golden.cases).toHaveLength(32)
    expect(new Set(golden.cases.map((item) => item.placement.mode))).toEqual(new Set(["fit", "fill"]))
    expect(new Set(golden.cases.map((item) => item.placement.rotation))).toEqual(new Set([0, 90, 180, 270]))
    expect(new Set(golden.cases.filter((item) => item.placement.mode === "fill").map((item) => `${item.placement.focalX},${item.placement.focalY}`))).toEqual(
      new Set(["0,0", "0.5,0.5", "1,1"])
    )
    expect(new Set(golden.cases.map((item) => item.placement.targetAspectRatio))).toEqual(
      new Set([null, 1, 4 / 3, 16 / 9])
    )
  })

  it("逐字段匹配 Canvas 使用的 geometry 函数与 golden 期望", () => {
    for (const item of golden.cases) {
      const actual = calculateImagePlacementGeometry(
        item.source.width,
        item.source.height,
        item.placement
      )
      expect(actual, item.id).not.toBeNull()
      for (const field of NUMERIC_FIELDS) {
        expect(actual?.[field], `${item.id}.${field}`).toBeCloseTo(item.expected[field]!, 10)
      }
    }
  })
})
