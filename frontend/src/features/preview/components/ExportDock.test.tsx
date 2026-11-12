import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
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
  notice: null,
  requeryUnconfirmed: vi.fn(async () => {}),
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

  it("底片不依赖普通 Canvas 图片，权威引擎结果就绪即可导出，失败时禁用", () => {
    const controller = makeController()
    const film = { ...state, currentImage: null, filmMode: true, engineSyncStatus: "synced" as const, engineDisplayUrl: "/previews/film" }
    const view = render(<ExportDock state={film} hasSelectedImage batchExportLabel="" exportController={controller} />)
    const button = screen.getByRole("button",{name:"导出原图"}) as HTMLButtonElement
    expect(button.disabled).toBe(false); fireEvent.click(button)
    expect(controller.startSingleExport).toHaveBeenCalledOnce()
    view.rerender(<ExportDock state={{...film,engineSyncStatus:"error",engineDisplayUrl:null}} hasSelectedImage batchExportLabel="" exportController={controller} />)
    expect(button.disabled).toBe(true)
  })

  it("工作台模式下按范围只保留一个主命令：全部范围显示「导出全部 N 张」", () => {
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

    // 主命令随范围命名，且不再同时出现单图按钮
    const primary = screen.getByRole("button", { name: "导出全部 2 张" }) as HTMLButtonElement
    expect(primary.disabled).toBe(true)
    expect(screen.queryByRole("button", { name: "导出当前图片" })).toBeNull()
    expect(screen.getByText(/引擎不可用，导出已禁用/)).toBeTruthy()
  })

  it("全部范围但队列为空：主命令禁用并解释，点击不产生静默导出", () => {
    const startBatchExport = vi.fn(async () => {})
    render(
      <ExportDock
        state={state}
        hasSelectedImage={false}
        batchExportLabel=""
        exportController={{ ...makeController(), startBatchExport }}
        operationScope="all"
        onOperationScopeChange={vi.fn()}
        checkedCount={0}
        queueCount={0}
      />
    )

    const primary = screen.getByRole("button", { name: "导出全部 0 张" }) as HTMLButtonElement
    expect(primary.disabled).toBe(true)
    expect(primary.title).toContain("队列为空")
    primary.click()
    expect(startBatchExport).not.toHaveBeenCalled()
  })

  it("已选范围的空选集：主命令禁用并解释原因，不静默导出其他范围", () => {
    render(
      <ExportDock
        state={state}
        hasSelectedImage
        batchExportLabel=""
        exportController={makeController()}
        operationScope="checked"
        onOperationScopeChange={vi.fn()}
        checkedCount={0}
        queueCount={2}
      />
    )

    const primary = screen.getByRole("button", { name: "导出已选 0 张" }) as HTMLButtonElement
    expect(primary.disabled).toBe(true)
    expect(primary.title).toContain("没有勾选的图片")
    expect(screen.queryByRole("button", { name: "导出当前图片" })).toBeNull()
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

  it("提交响应丢失进入状态待确认：说明结果未知，提供重新查询与核对输出目录", () => {
    render(
      <ExportDock
        state={state}
        hasSelectedImage
        batchExportLabel=""
        exportController={{
          ...makeController(),
          single: {
            kind: "unconfirmed",
            message: "提交结果未知：引擎不可达。应用不会自动重复提交。",
            jobId: null,
            outputPath: "/exports/a-border.jpg"
          }
        }}
        operationScope="active"
        onOperationScopeChange={vi.fn()}
        checkedCount={0}
        queueCount={1}
      />
    )

    expect(screen.getByTestId("export-unconfirmed").textContent).toContain("提交结果未知")
    // 无 jobId：不提供重新查询（没有可查任务），只保留核对路径
    expect(screen.queryByRole("button", { name: "重新查询任务状态" })).toBeNull()
  })

  it("查询中断且有 jobId：提供重新查询原任务入口", () => {
    const requeryUnconfirmed = vi.fn(async () => {})
    render(
      <ExportDock
        state={state}
        hasSelectedImage
        batchExportLabel=""
        exportController={{
          ...makeController(),
          batch: {
            kind: "unconfirmed",
            message: "查询中断，结果未知：引擎不可达。",
            jobId: "job-1",
            total: 3,
            dirPath: "/exports",
            results: []
          },
          requeryUnconfirmed
        }}
        operationScope="checked"
        onOperationScopeChange={vi.fn()}
        checkedCount={3}
        queueCount={3}
      />
    )

    expect(screen.getByTestId("export-unconfirmed").textContent).toContain("查询中断")
    fireEvent.click(screen.getByRole("button", { name: "重新查询任务状态" }))
    expect(requeryUnconfirmed).toHaveBeenCalledTimes(1)
  })
})
