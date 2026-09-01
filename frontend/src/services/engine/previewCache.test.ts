import { afterEach, describe, expect, it, vi } from "vitest"
import {
  BoundedPreviewUrlCache,
  createPreviewCacheKey,
  hashRenderRecipe
} from "./previewCache"
import type { RenderRecipe } from "../../types/preview"

const recipe: RenderRecipe = {
  imagePath: "/photos/a.jpg",
  border: { top: 0, bottom: 0, left: 0, right: 0, color: "#000000" },
  gradient: null,
  texts: [],
  filmFormat: null,
  autoCrop: false
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("预览 URL 缓存", () => {
  it("键同时隔离路径、尺寸、mtime 与渲染配方", () => {
    const hash = hashRenderRecipe(recipe)
    const base = createPreviewCacheKey({
      imagePath: "/photos/a.jpg",
      maxWidth: 120,
      maxHeight: 120,
      modifiedAtMs: 100,
      sourceSizeBytes: 2048,
      recipeHash: hash
    })
    expect(createPreviewCacheKey({ imagePath: "/photos/a.jpg", maxWidth: 1280, maxHeight: 1280, modifiedAtMs: 100, sourceSizeBytes: 2048, recipeHash: hash })).not.toBe(base)
    expect(createPreviewCacheKey({ imagePath: "/photos/a.jpg", maxWidth: 120, maxHeight: 120, modifiedAtMs: 101, sourceSizeBytes: 2048, recipeHash: hash })).not.toBe(base)
    expect(createPreviewCacheKey({ imagePath: "/photos/a.jpg", maxWidth: 120, maxHeight: 120, modifiedAtMs: 100, sourceSizeBytes: 2049, recipeHash: hash })).not.toBe(base)
    expect(createPreviewCacheKey({ imagePath: "/photos/b.jpg", maxWidth: 120, maxHeight: 120, modifiedAtMs: 100, sourceSizeBytes: 2048, recipeHash: hash })).not.toBe(base)
    expect(hashRenderRecipe({ ...recipe, autoCrop: true })).not.toBe(hash)
  })

  it("按字节淘汰 LRU，并在淘汰 blob URL 时主动释放", () => {
    const revokeObjectURL = vi.fn()
    vi.stubGlobal("URL", { revokeObjectURL })
    const cache = new BoundedPreviewUrlCache(6)

    cache.set("first", "blob:first", 3)
    cache.set("second", "blob:second", 3)
    expect(cache.get("first")).toBe("blob:first")
    // first 已被读取，second 是 LRU；加入 3 字节后应淘汰 second。
    cache.set("third", "blob:third", 3)

    expect(cache.get("first")).toBe("blob:first")
    expect(cache.get("second")).toBeNull()
    expect(cache.get("third")).toBe("blob:third")
    expect(cache.byteSize).toBe(6)
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:second")

    cache.clear()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first")
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:third")
  })

  it("不缓存超过预算的单项，并立即释放它的 object URL", () => {
    const revokeObjectURL = vi.fn()
    vi.stubGlobal("URL", { revokeObjectURL })
    const cache = new BoundedPreviewUrlCache(4)

    cache.set("oversized", "blob:oversized", 5)

    expect(cache.size).toBe(0)
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:oversized")
  })

  it("删除单项时释放对应的 blob URL，并保持其它缓存不变", () => {
    const revokeObjectURL = vi.fn()
    vi.stubGlobal("URL", { revokeObjectURL })
    const cache = new BoundedPreviewUrlCache(10)

    cache.set("keep", "blob:keep", 3)
    cache.set("remove", "blob:remove", 3)
    cache.delete("remove")

    expect(cache.get("keep")).toBe("blob:keep")
    expect(cache.get("remove")).toBeNull()
    expect(cache.size).toBe(1)
    expect(cache.byteSize).toBe(3)
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:remove")
  })
})
