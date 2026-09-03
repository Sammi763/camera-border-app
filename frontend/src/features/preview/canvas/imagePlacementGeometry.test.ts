import { describe, expect, it } from "vitest"
import {
  calculateImagePlacementGeometry,
  normalizeImagePlacement
} from "./imagePlacementGeometry"

describe("RenderRecipe v2 imagePlacement geometry", () => {
  it("fit uses the target aspect box and keeps the complete image", () => {
    const geometry = calculateImagePlacementGeometry(400, 200, {
      mode: "fit",
      focalX: 0.5,
      focalY: 0.5,
      rotation: 0,
      targetAspectRatio: 1
    })

    expect(geometry).not.toBeNull()
    expect(geometry?.targetWidth).toBe(200)
    expect(geometry?.targetHeight).toBe(200)
    expect(geometry?.drawWidth).toBe(200)
    expect(geometry?.drawHeight).toBe(100)
    expect(geometry?.offsetX).toBe(0)
    expect(geometry?.offsetY).toBe(50)
  })

  it("fill crops around focal point instead of always cropping the center", () => {
    const left = calculateImagePlacementGeometry(400, 200, {
      mode: "fill",
      focalX: 0,
      focalY: 0.5,
      rotation: 0,
      targetAspectRatio: 1
    })
    const right = calculateImagePlacementGeometry(400, 200, {
      mode: "fill",
      focalX: 1,
      focalY: 0.5,
      rotation: 0,
      targetAspectRatio: 1
    })

    expect(left?.targetWidth).toBe(200)
    expect(left?.drawWidth).toBe(400)
    expect(left?.offsetX).toBe(0)
    expect(right?.offsetX).toBe(-200)
  })

  it("rotation changes the target geometry using the same normalized angle", () => {
    const geometry = calculateImagePlacementGeometry(400, 200, {
      mode: "fit",
      focalX: 0.5,
      focalY: 0.5,
      rotation: 90,
      targetAspectRatio: null
    })

    expect(geometry?.rotatedWidth).toBe(200)
    expect(geometry?.rotatedHeight).toBe(400)
    expect(geometry?.drawWidth).toBe(400)
    expect(geometry?.drawHeight).toBe(200)
  })

  it("invalid placement values fall back to a deterministic v2 default", () => {
    expect(normalizeImagePlacement({ mode: "invalid" as "fit" })).toEqual({
      mode: "fit",
      focalX: 0.5,
      focalY: 0.5,
      rotation: 0,
      targetAspectRatio: null
    })
  })
})
