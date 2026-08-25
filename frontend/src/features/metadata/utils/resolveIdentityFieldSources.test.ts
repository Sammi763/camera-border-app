import { describe, expect, it } from "vitest"
import { resolveIdentityFieldSources } from "./resolveIdentityFieldSources"
import type { PhotoMetadata } from "../../../types/preview"

const makeExif = (): PhotoMetadata => ({
  cameraModel: "NIKON Z6",
  lensModel: "Nikkor 50mm"
})

describe("resolveIdentityFieldSources（来源标识）", () => {
  it("无覆盖无预设时有 EXIF：camera/lens 标 EXIF，画幅无来源", () => {
    const sources = resolveIdentityFieldSources({
      override: null,
      preset: null,
      exif: makeExif()
    })
    expect(sources.camera).toBe("exif")
    expect(sources.lens).toBe("exif")
    expect(sources.film).toBeNull()
    expect(sources.captureFormat).toBeNull()
  })

  it("预设提供胶片与画幅：对应字段标预设，相机/镜头回落 EXIF 仍标 EXIF", () => {
    const sources = resolveIdentityFieldSources({
      override: null,
      preset: { film: "Kodak Portra 400", captureFormat: "6x6" },
      exif: makeExif()
    })
    expect(sources.film).toBe("preset")
    expect(sources.captureFormat).toBe("preset")
    expect(sources.camera).toBe("exif")
    expect(sources.lens).toBe("exif")
  })

  it("每图覆盖优先级最高：被覆盖字段标 override", () => {
    const sources = resolveIdentityFieldSources({
      override: { camera: "Leica M6", location: "Kyoto" },
      preset: { film: "Kodak Portra 400" },
      exif: makeExif()
    })
    expect(sources.camera).toBe("override")
    expect(sources.location).toBe("override")
    expect(sources.lens).toBe("exif")
    expect(sources.film).toBe("preset")
  })

  it("空字符串覆盖不阻断来源判定（视为未覆盖）", () => {
    const sources = resolveIdentityFieldSources({
      override: { camera: "" },
      preset: null,
      exif: makeExif()
    })
    expect(sources.camera).toBe("exif")
  })

  it("全部缺失时标 null（不显示 undefined）", () => {
    const sources = resolveIdentityFieldSources({
      override: null,
      preset: null,
      exif: null
    })
    expect(sources.camera).toBeNull()
    expect(sources.lens).toBeNull()
    expect(sources.film).toBeNull()
    expect(sources.location).toBeNull()
  })
})
