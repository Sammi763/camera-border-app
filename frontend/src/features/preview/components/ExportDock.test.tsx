import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ExportDock } from "./ExportDock"
import type { ExportController } from "../hooks/useExportController"
import type { PreviewState } from "../types"

const makeController = (): ExportController => ({
  single: { kind: "idle" },
  batch: { kind: "idle" },
  isExporting: false,
  isBatchExporting: false,
  startSingleExport: vi.fn(async () => {}),
  startBatchExport: vi.fn(async () => {}),
  retryFailed: vi.fn(async () => {}),
  cancelActiveExport: vi.fn(async () => {}),
  openExportDirectory: vi.fn()
})

const state: PreviewState = {
  kind: "active",
  filePath: "/photos/a.jpg",
  fileName: "a.jpg",
  currentImage: document.createElement("img"),
  engineDisplayUrl: null,
  engineSyncStatus: "idle",
  engineResponse: null
}

describe("ExportDock", () => {
  beforeEach(() => {
    delete (window as unknown as { desktop?: unknown }).desktop
  })

  it("引擎不可用时禁用单图和范围导出，并保留明确原因", () => {
    render(
      <ExportDock
        state={state}
        hasSelectedImage
        batchExportLabel="批量导出 2 张"
        exportController={makeController()}
        engineAvailable={false}
        engineUnavailableReason="引擎启动失败，请重试。"
        operationScope="all"
        onOperationScopeChange={vi.fn()}
        checkedCount={1}
        queueCount={2}
      />
    )

    expect((screen.getByRole("button", { name: "导出原图" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "批量导出 2 张" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/引擎不可用，导出已禁用/)).toBeTruthy()
  })

  it("展示统一的导出范围 Dock，已选为空时不允许选择已选范围", () => {
    render(
      <ExportDock
        state={state}
        hasSelectedImage
        batchExportLabel="按范围导出当前图片"
        exportController={makeController()}
        operationScope="active"
        onOperationScopeChange={vi.fn()}
        checkedCount={0}
        queueCount={2}
      />
    )

    expect(screen.getByRole("group", { name: "导出范围" })).toBeTruthy()
    expect((screen.getByRole("button", { name: "已选 0 张" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole("button", { name: "当前图片" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "全部 2 张" })).toBeTruthy()
  })
})
