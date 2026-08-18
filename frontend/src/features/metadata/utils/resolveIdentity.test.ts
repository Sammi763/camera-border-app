import { describe, expect, it } from "vitest"
import { mergeIdentityChain, resolvePresetIdentity } from "./resolveIdentity"
import type { PhotoIdentity, PhotoAssetStore, ShootingPreset } from "../types"
import { createEmptyAssetStore, createEmptyIdentity } from "../types"

/** 含一台相机/一支镜头/一款胶片的资产库。 */
const makeAssetStore = (): PhotoAssetStore => ({
  ...createEmptyAssetStore(),
  cameras: [{ id: "cam-1", brand: "Leica", model: "M6", alias: "Leica M6 (alias)", notes: "" }],
  lenses: [{ id: "lens-1", brand: "Voigtlander", model: "35mm F1.4", focalLength: "35", maxAperture: "1.4", mount: "M", notes: "" }],
  films: [{ id: "film-1", brand: "Kodak", name: "Portra 400", iso: "400", type: "Color", colorProfile: "neutral", discontinued: false, notes: "" }]
})

const makePreset = (patch: Partial<ShootingPreset> = {}): ShootingPreset => ({
  id: "preset-1",
  name: "135 Portra",
  category: "135 胶片",
  captureFormat: "135",
  cameraAssetId: "cam-1",
  lensAssetId: "lens-1",
  filmAssetId: "film-1",
  defaultLocation: "Kyoto",
  notes: null,
  ...patch
})

const exif = {
  cameraModel: "Nikon Z6",
  lensModel: "Nikkor 50mm",
  filmName: "EXIF Film"
}

describe("resolvePresetIdentity", () => {
  it("资产引用解析为展示文本", () => {
    const identity = resolvePresetIdentity(makePreset(), makeAssetStore())
    expect(identity.camera).toBe("Leica M6 (alias)")
    expect(identity.lens).toBe("Voigtlander 35mm F1.4")
    expect(identity.film).toBe("Kodak Portra 400")
    expect(identity.location).toBe("Kyoto")
    expect(identity.captureFormat).toBe("135")
  })

  it("无效/悬空资产 ID：字段不提供（undefined），不崩溃", () => {
    const preset = makePreset({
      cameraAssetId: "deleted-camera",
      lensAssetId: "deleted-lens",
      filmAssetId: "deleted-film"
    })
    const identity = resolvePresetIdentity(preset, makeAssetStore())
    expect(identity.camera).toBeUndefined()
    expect(identity.lens).toBeUndefined()
    expect(identity.film).toBeUndefined()
    // 画幅不受资产引用影响
    expect(identity.captureFormat).toBe("135")
  })

  it("未引用资产与地点为空地点时字段不提供", () => {
    const identity = resolvePresetIdentity(
      makePreset({ cameraAssetId: null, lensAssetId: null, filmAssetId: null, defaultLocation: null }),
      makeAssetStore()
    )
    expect(identity.camera).toBeUndefined()
    expect(identity.lens).toBeUndefined()
    expect(identity.film).toBeUndefined()
    expect(identity.location).toBeUndefined()
  })

  it("返回 Partial：非预设字段不出现", () => {
    const identity = resolvePresetIdentity(makePreset(), makeAssetStore())
    expect(identity.frameNumber).toBeUndefined()
    expect(identity.rollName).toBeUndefined()
    expect(identity.developer).toBeUndefined()
    expect("frameNumber" in identity).toBe(false)
  })
})

describe("mergeIdentityChain 优先级", () => {
  /** 预设只提供部分字段（Partial 语义：未提供字段回落到 EXIF）。 */
  const presetPartial: Partial<PhotoIdentity> = {
    camera: "Leica M6",
    lens: "Voigtlander 35mm F1.4",
    film: "Kodak Portra 400",
    location: "Kyoto",
    captureFormat: "135"
  }

  it("每图覆盖 > 摄影预设 > EXIF", () => {
    const merged = mergeIdentityChain({
      override: { camera: "覆盖相机", film: "覆盖胶片" },
      preset: presetPartial,
      exif
    })
    expect(merged.camera).toBe("覆盖相机")
    expect(merged.film).toBe("覆盖胶片")
    // 未被覆盖的字段由预设补齐
    expect(merged.lens).toBe("Voigtlander 35mm F1.4")
  })

  it("摄影预设 > EXIF", () => {
    const merged = mergeIdentityChain({
      override: null,
      preset: presetPartial,
      exif
    })
    expect(merged.camera).toBe("Leica M6")
    expect(merged.lens).toBe("Voigtlander 35mm F1.4")
    expect(merged.film).toBe("Kodak Portra 400")
    expect(merged.location).toBe("Kyoto")
    expect(merged.captureFormat).toBe("135")
  })

  it("预设未提供的字段回落到 EXIF（空值不阻断继承）", () => {
    // 预设只提供画幅与胶片：camera/lens 未提供 → 由 EXIF 补齐
    const merged = mergeIdentityChain({
      override: null,
      preset: { captureFormat: "6x10", film: "Kodak Portra 400" },
      exif
    })
    expect(merged.camera).toBe("Nikon Z6")
    expect(merged.lens).toBe("Nikkor 50mm")
    expect(merged.film).toBe("Kodak Portra 400")
    expect(merged.captureFormat).toBe("6x10")
  })

  it("覆盖或预设直接传入空字符串时也不阻断继承", () => {
    const merged = mergeIdentityChain({
      override: { camera: "", lens: "   ", captureFormat: "" },
      preset: { camera: "", lens: "Leica 35mm", captureFormat: "6x12" },
      exif
    })

    expect(merged.camera).toBe("Nikon Z6")
    expect(merged.lens).toBe("Leica 35mm")
    expect(merged.captureFormat).toBe("6x12")
  })

  it("预设悬空资产引用不阻断 EXIF 继承", () => {
    const merged = mergeIdentityChain({
      override: null,
      preset: { captureFormat: "6x10" },
      exif
    })
    expect(merged.camera).toBe("Nikon Z6")
    expect(merged.captureFormat).toBe("6x10")
  })

  it("无预设时 EXIF 补齐数码信息", () => {
    const merged = mergeIdentityChain({ override: null, preset: null, exif })
    expect(merged.camera).toBe("Nikon Z6")
    expect(merged.lens).toBe("Nikkor 50mm")
    expect(merged.film).toBe("EXIF Film")
    expect(merged.captureFormat).toBe("")
  })

  it("全部缺失时为空字符串", () => {
    const merged = mergeIdentityChain({ override: null, preset: null, exif: null })
    const empty = createEmptyIdentity()
    for (const [key, value] of Object.entries(merged)) {
      expect(value, `字段 ${key} 应为空`).toBe(empty[key as keyof PhotoIdentity])
    }
  })

  it("画幅来源：覆盖 > 预设 > 空（EXIF 不提供画幅）", () => {
    const merged = mergeIdentityChain({
      override: { captureFormat: "6x6" },
      preset: presetPartial,
      exif
    })
    expect(merged.captureFormat).toBe("6x6")
    const noOverride = mergeIdentityChain({ override: null, preset: presetPartial, exif })
    expect(noOverride.captureFormat).toBe("135")
  })
})
