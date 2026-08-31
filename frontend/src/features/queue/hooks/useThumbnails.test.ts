import { describe, expect, it } from "vitest"
import { resolveEngineUrl } from "./useThumbnails"

describe("队列缩略图 URL", () => {
  it("只接受相对预览路径或图片 data URL", () => {
    expect(resolveEngineUrl("/previews/preview-1")).toBe("/previews/preview-1")
    expect(resolveEngineUrl("data:image/jpeg;base64,AAAA")).toBe("data:image/jpeg;base64,AAAA")
    expect(resolveEngineUrl("data:text/html,<script>alert(1)</script>")).toBeNull()
    expect(resolveEngineUrl("http://127.0.0.1:8099/previews/preview-1")).toBeNull()
    expect(resolveEngineUrl("blob:https://example.invalid/preview-1")).toBeNull()
    expect(resolveEngineUrl("//example.invalid/previews/preview-1")).toBeNull()
    expect(resolveEngineUrl("/previews/../api/health")).toBeNull()
    expect(resolveEngineUrl("/api/preview")).toBeNull()
  })
})
