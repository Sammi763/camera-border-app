import { describe, expect, it } from "vitest"
import { buildPresetFromText } from "./buildPresetFromText"
import { createEmptyAssetStore } from "../../metadata/types"
import type { PhotoAssetStore } from "../../metadata/types"

const emptyStore = (): PhotoAssetStore => createEmptyAssetStore()

describe("buildPresetFromText（文字录入创建预设）", () => {
  it("完整录入：生成相机/镜头/胶片资产并引用", () => {
    const result = buildPresetFromText({
      name: "135 日常",
      category: "135 胶片",
      captureFormat: "135",
      camera: "Leica M6",
      lens: "Voigtlander 35mm F1.4",
      film: "Kodak Gold 200",
      location: "Kyoto"
    }, emptyStore())

    expect(result).not.toBeNull()
    const built = result!
    expect(built.newCameras).toHaveLength(1)
    expect(built.newCameras[0]!.brand).toBe("Leica")
    expect(built.newCameras[0]!.model).toBe("M6")
    expect(built.newLenses[0]!.brand).toBe("Voigtlander")
    expect(built.newFilms[0]!.brand).toBe("Kodak")
    expect(built.newFilms[0]!.name).toBe("Gold 200")

    expect(built.preset.cameraAssetId).toBe(built.newCameras[0]!.id)
    expect(built.preset.lensAssetId).toBe(built.newLenses[0]!.id)
    expect(built.preset.filmAssetId).toBe(built.newFilms[0]!.id)
    expect(built.preset.captureFormat).toBe("135")
    expect(built.preset.defaultLocation).toBe("Kyoto")
    expect(built.preset.name).toBe("135 日常")
  })

  it("只有相机文本：不生成镜头/胶片资产，对应引用为 null", () => {
    const result = buildPresetFromText({
      name: "数码常用",
      category: "数码",
      captureFormat: "fullframe",
      camera: "Canon EOS R5",
      lens: "",
      film: "",
      location: ""
    }, emptyStore())

    expect(result).not.toBeNull()
    const built = result!
    expect(built.newCameras).toHaveLength(1)
    expect(built.newLenses).toHaveLength(0)
    expect(built.newFilms).toHaveLength(0)
    expect(built.preset.lensAssetId).toBeNull()
    expect(built.preset.filmAssetId).toBeNull()
  })

  it("同名资产复用：已有品牌+型号时不生成新资产", () => {
    const store: PhotoAssetStore = {
      ...createEmptyAssetStore(),
      cameras: [{ id: "cam-1", brand: "Leica", model: "M6", alias: "Leica M6", notes: "" }],
      films: [{ id: "film-1", brand: "Kodak", name: "Gold 200", iso: "200", type: "", colorProfile: "", discontinued: false, notes: "" }]
    }

    const result = buildPresetFromText({
      name: "复用",
      category: "",
      captureFormat: "135",
      camera: "Leica M6",
      lens: "",
      film: "Kodak Gold 200",
      location: ""
    }, store)

    expect(result).not.toBeNull()
    const built = result!
    expect(built.newCameras).toHaveLength(0)
    expect(built.newFilms).toHaveLength(0)
    expect(built.preset.cameraAssetId).toBe("cam-1")
    expect(built.preset.filmAssetId).toBe("film-1")
  })

  it("缺少画幅时返回 null（调用方提示用户）", () => {
    const result = buildPresetFromText({
      name: "缺画幅",
      category: "",
      captureFormat: "",
      camera: "Leica M6",
      lens: "",
      film: "",
      location: ""
    }, emptyStore())
    expect(result).toBeNull()
  })

  it("空名称回退为「未命名预设」", () => {
    const result = buildPresetFromText({
      name: "",
      category: "",
      captureFormat: "135",
      camera: "",
      lens: "",
      film: "",
      location: ""
    }, emptyStore())
    expect(result).not.toBeNull()
    expect(result!.preset.name).toBe("未命名预设")
  })
})
