import { describe, expect, it } from "vitest"
import { composePackagedE2eImagePaths } from "./packagedE2ePaths"

describe("composePackagedE2eImagePaths", () => {
  it("仅配置主样片时只注入主样片", () => {
    expect(composePackagedE2eImagePaths("/tmp/sample.jpg", null)).toEqual(["/tmp/sample.jpg"])
  })

  it("配置失败样片时按稳定顺序注入两张图片", () => {
    expect(composePackagedE2eImagePaths("/tmp/sample.jpg", "/tmp/retry.jpg")).toEqual([
      "/tmp/sample.jpg",
      "/tmp/retry.jpg"
    ])
  })

  it("缺少主样片时不注入孤立失败样片", () => {
    expect(composePackagedE2eImagePaths(null, "/tmp/retry.jpg")).toEqual([])
  })
})
