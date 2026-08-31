import { describe, expect, it } from "vitest"
import { selectVisibleThumbnailPaths } from "./visibleThumbnailPaths"
import type { QueueItem } from "../types"

const item = (id: string, missing = false): QueueItem => ({
  id,
  filePath: `/photos/${id}.jpg`,
  fileName: `${id}.jpg`,
  sourcePath: `/photos/${id}.jpg`,
  sourceFormat: "jpg",
  converted: false,
  workingFormat: "jpg",
  textOverride: null,
  presetId: null,
  identityOverride: null,
  missing
})

describe("队列可见缩略图路径", () => {
  it("100 张队列只返回视口中的项目，并跳过丢失文件", () => {
    const items = Array.from({ length: 100 }, (_, index) => item(`photo-${index}`))
    items[50] = item("photo-50", true)
    const visible = new Set(["photo-0", "photo-1", "photo-50", "photo-99"])

    expect(selectVisibleThumbnailPaths(items, visible)).toEqual([
      "/photos/photo-0.jpg",
      "/photos/photo-1.jpg",
      "/photos/photo-99.jpg"
    ])
  })

  it("没有可见项目时不调度任何缩略图请求", () => {
    expect(selectVisibleThumbnailPaths([item("photo-1")], new Set())).toEqual([])
  })
})
