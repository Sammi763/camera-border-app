import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { AssetLibraryPanel } from "./AssetLibraryPanel"
import type { PhotoAssetController } from "../types"
import { createEmptyAssetStore } from "../types"

const makeController = (): PhotoAssetController => ({
  store: createEmptyAssetStore(),
  lastError: null,
  clearError: vi.fn(),
  saveCamera: vi.fn(),
  deleteCamera: vi.fn(),
  saveLens: vi.fn(),
  deleteLens: vi.fn(),
  saveFilm: vi.fn(),
  deleteFilm: vi.fn(),
  saveScanner: vi.fn(),
  deleteScanner: vi.fn(),
  saveLab: vi.fn(),
  deleteLab: vi.fn(),
  saveDeveloper: vi.fn(),
  deleteDeveloper: vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("AssetLibraryPanel", () => {
  it("切换资产标签后保留未提交的相机表单草稿", () => {
    render(<AssetLibraryPanel assetController={makeController()} filmStocks={[]} />)

    fireEvent.click(screen.getByRole("button", { name: "新增相机" }))
    fireEvent.change(screen.getByPlaceholderText("例如：Leica"), { target: { value: "保留草稿" } })
    fireEvent.click(screen.getByRole("button", { name: "镜头" }))
    fireEvent.click(screen.getByRole("button", { name: "相机" }))

    expect((screen.getByPlaceholderText("例如：Leica") as HTMLInputElement).value).toBe("保留草稿")
  })
})
