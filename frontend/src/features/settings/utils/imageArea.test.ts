import { describe, expect, it } from "vitest"
import { DEFAULT_SETTINGS } from "../hooks/useSettings"
import {
  calculateOutputPixelDimensions,
  imageAreaFromPlacement,
  imagePlacementFromArea,
  summarizeImageArea
} from "./imageArea"
import type { ImageAreaSettings } from "../types"

const area = (patch: Partial<ImageAreaSettings> = {}): ImageAreaSettings => ({
  orientation: "auto",
  ratio: "original",
  displayMode: "fit",
  focalX: 0.5,
  focalY: 0.5,
  rotation: 0,
  targetAspectRatioOverride: null,
  ...patch
})

describe("图片区域与 RenderRecipe.imagePlacement", () => {
  it("支持固定比例的横屏、竖屏、方形方向组合", () => {
    expect(imagePlacementFromArea(area({ orientation: "portrait", ratio: "4:5" }))).toMatchObject({
      mode: "fit",
      targetAspectRatio: 4 / 5
    })
    expect(imagePlacementFromArea(area({ orientation: "landscape", ratio: "4:5" }))).toMatchObject({
      targetAspectRatio: 5 / 4
    })
    expect(imagePlacementFromArea(area({ orientation: "square", ratio: "3:2" }))).toMatchObject({
      targetAspectRatio: 1
    })
  })

  it("原图比例保留完整图像，旧画幅比例通过兼容字段迁移", () => {
    expect(imagePlacementFromArea(area())).toMatchObject({
      mode: "fit",
      targetAspectRatio: null
    })
    const legacy = imageAreaFromPlacement({
      mode: "fill",
      focalX: 0.25,
      focalY: 0.75,
      rotation: 90,
      targetAspectRatio: 25 / 14
    })
    expect(legacy).toMatchObject({
      orientation: "landscape",
      ratio: "original",
      displayMode: "fill",
      targetAspectRatioOverride: 25 / 14
    })
    expect(imagePlacementFromArea(legacy)).toMatchObject({
      mode: "fill",
      focalX: 0.25,
      focalY: 0.75,
      rotation: 90,
      targetAspectRatio: 25 / 14
    })
  })

  it("显示摘要明确区分图片区域和裁切状态", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      imageArea: area({ orientation: "portrait", ratio: "4:5", displayMode: "fill" }),
      imagePlacement: imagePlacementFromArea(area({ orientation: "portrait", ratio: "4:5", displayMode: "fill" }))
    }
    expect(summarizeImageArea(settings, 5035, 3339)).toMatchObject({
      label: "竖屏 · 4:5",
      displayModeLabel: "填满裁切",
      targetAspectRatio: 4 / 5
    })
  })
})

describe("输出像素尺寸与预览 CSS 尺寸隔离", () => {
  it("输出尺寸只受源像素、图片区域、边框和输出档位影响", () => {
    const imageArea = area({ orientation: "portrait", ratio: "4:5", displayMode: "fit" })
    const settings = {
      ...DEFAULT_SETTINGS,
      imageArea,
      imagePlacement: imagePlacementFromArea(imageArea),
      outputSizePreset: "2k" as const,
      borderTop: 20,
      borderBottom: 20,
      borderLeft: 20,
      borderRight: 20
    }
    expect(calculateOutputPixelDimensions(4000, 3000, settings)).toEqual({
      width: 1678,
      height: 2088
    })
  })

  it("没有有效源像素时不猜测输出尺寸", () => {
    expect(calculateOutputPixelDimensions(0, 3000, DEFAULT_SETTINGS)).toBeNull()
  })
})
