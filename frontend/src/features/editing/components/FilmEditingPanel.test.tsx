import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { FilmEditingPanel } from "./FilmEditingPanel"
import type { CapabilitiesResponse } from "../../../types/preview"
import type { ImageProcessingConfig } from "../../../types/imageProcessing"
import { createDefaultFilmProcessing } from "../defaults"

const capabilities = (available: boolean): CapabilitiesResponse => ({
  schemaVersion: 1,
  components: available ? { libraw: { available: true } } : { libraw: { available: false } },
  input: {},
  output: {},
  tiers: {} as CapabilitiesResponse["tiers"],
  filmDigitization: {
    available,
    inputModes: ["sensor-raw", "linear-tiff"],
    analysisStages: ["raw-linear", "base-positive", "current-positive"],
    outputs: {},
    reason: available ? null : "测试：底片组件不可用"
  }
})

const enabledConfig = (): ImageProcessingConfig => createDefaultFilmProcessing("/photos/scan.ARW")!

describe("FilmEditingPanel（T09 底片编辑面板）", () => {
  it("TIFF 必须显式确认线性解释并选择输入空间", () => {
    const onChange = vi.fn()
    render(<FilmEditingPanel config={null} error={null} sourcePath="/scan.tif" capabilities={capabilities(true)} onChange={onChange} />)
    expect((screen.getByRole("button", { name: "开启底片处理" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole("combobox", { name: "输入空间" }), { target: { value: "linear-srgb" } })
    fireEvent.click(screen.getByRole("checkbox", { name: /我确认这是/ }))
    fireEvent.click(screen.getByRole("button", { name: "开启底片处理" }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ linearInput: expect.objectContaining({ colorSpace: "linear-srgb" }) }), expect.anything())
  })

  it("能力缺失时禁用并说明原因", () => {
    render(
      <FilmEditingPanel
        config={null}
        error={null}
        sourcePath="/photos/scan.ARW"
        capabilities={capabilities(false)}
        onChange={vi.fn()}
      />
    )

    expect((screen.getByRole("button", { name: "开启底片处理" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole("status").textContent).toContain("测试：底片组件不可用")
  })

  it("显式开启时按 RAW 扩展名生成 sensor-raw 配置", () => {
    const onChange = vi.fn()
    render(
      <FilmEditingPanel
        config={null}
        error={null}
        sourcePath="/photos/scan.ARW"
        capabilities={capabilities(true)}
        onChange={onChange}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "开启底片处理" }))

    const config = onChange.mock.calls[0]![0] as ImageProcessingConfig
    expect(config.inputMode).toBe("sensor-raw")
    expect(config.raw?.whiteBalance).toBe("camera")
    expect(config.negative?.profile).toBe("generic-color-negative-v1")
    expect(config.positive?.exposureEv).toBe(0)
    expect(config.sourceGeometry?.rotationDegrees).toBe(0)
  })

  it("曝光输入写入真实 recipe 并携带 historyTag", () => {
    const onChange = vi.fn()
    render(
      <FilmEditingPanel
        config={enabledConfig()}
        error={null}
        sourcePath="/photos/scan.ARW"
        capabilities={capabilities(true)}
        onChange={onChange}
      />
    )

    fireEvent.change(screen.getByLabelText("曝光 EV"), { target: { value: "1.5" } })

    const config = onChange.mock.calls[0]![0] as ImageProcessingConfig
    expect(config.positive?.exposureEv).toBe(1.5)
    expect(onChange.mock.calls[0]![1]).toMatchObject({ historyTag: "positive:exposure" })
  })

  it("片基来源切换与校平输入都写回 sourceGeometry/negative", () => {
    const onChange = vi.fn()
    render(
      <FilmEditingPanel
        config={enabledConfig()}
        error={null}
        sourcePath="/photos/scan.ARW"
        capabilities={capabilities(true)}
        onChange={onChange}
      />
    )

    fireEvent.change(screen.getByLabelText("来源"), { target: { value: "manual" } })
    const manual = onChange.mock.calls[0]![0] as ImageProcessingConfig
    expect(manual.negative?.filmBase?.kind).toBe("manual")

    fireEvent.change(screen.getByLabelText("校平角度"), { target: { value: "2.5" } })
    const rotated = onChange.mock.calls[1]![0] as ImageProcessingConfig
    expect(rotated.sourceGeometry?.rotationDegrees).toBe(2.5)
    expect(onChange.mock.calls[1]![1]).toMatchObject({ historyTag: "geometry:rotation" })
  })

  it("曲线重置清除用户曲线", () => {
    const config: ImageProcessingConfig = {
      ...enabledConfig(),
      positive: {
        ...enabledConfig().positive,
        masterCurve: {
          interpolation: "linear",
          points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.7 }, { x: 1, y: 1 }]
        }
      }
    }
    const onChange = vi.fn()
    render(
      <FilmEditingPanel
        config={config}
        error={null}
        sourcePath="/photos/scan.ARW"
        capabilities={capabilities(true)}
        onChange={onChange}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "重置曲线" }))

    const next = onChange.mock.calls[0]![0] as ImageProcessingConfig
    expect(next.positive?.masterCurve).toBeNull()
    expect(onChange.mock.calls[0]![1]).toMatchObject({ historyTag: expect.stringMatching(/^curve:总曲线:.*:reset:/) })
  })

  it("关闭底片处理写回 null，并展示已有错误", () => {
    const onChange = vi.fn()
    render(
      <FilmEditingPanel
        config={enabledConfig()}
        error="旧会话中的底片配置版本不受支持，已关闭处理"
        sourcePath="/photos/scan.ARW"
        capabilities={capabilities(true)}
        onChange={onChange}
      />
    )

    expect(screen.getByRole("alert").textContent).toContain("版本不受支持")
    fireEvent.click(screen.getByRole("button", { name: "关闭底片处理" }))
    expect(onChange).toHaveBeenCalledWith(null, { description: "关闭底片处理" })
  })
})
