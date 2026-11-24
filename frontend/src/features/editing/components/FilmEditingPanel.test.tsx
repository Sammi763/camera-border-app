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
    fireEvent.blur(screen.getByLabelText("曝光 EV"))

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
    fireEvent.blur(screen.getByLabelText("来源"))
    const manual = onChange.mock.calls[0]![0] as ImageProcessingConfig
    expect(manual.negative?.filmBase?.kind).toBe("manual")

    fireEvent.click(screen.getByText("源图裁切与校平"))
    fireEvent.change(screen.getByLabelText("校平角度"), { target: { value: "2.5" } })
    fireEvent.blur(screen.getByLabelText("校平角度"))
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

    fireEvent.click(screen.getByRole("button", { name: "重置当前通道" }))

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

  it("切换曲线通道清除选点，重置只写回当前通道", () => {
    const points = [{ x: 0, y: 0 }, { x: 0.5, y: 0.7 }, { x: 1, y: 1 }]
    const masterCurve = { interpolation: "linear" as const, points }
    const redCurve = { ...masterCurve, points: points.map(point => ({ ...point, y: point.x })) }
    const config = { ...enabledConfig(), positive: { masterCurve, redCurve } }
    const onChange = vi.fn()
    render(<FilmEditingPanel config={config} error={null} sourcePath="/scan.ARW" capabilities={capabilities(true)} onChange={onChange} />)

    fireEvent.focus(screen.getByRole("slider", { name: "总曲线控制点1" }))
    const remove = screen.getByRole<HTMLButtonElement>("button", { name: "删除控制点" })
    expect(remove.disabled).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: "红色通道" }))
    expect(remove.disabled).toBe(true)
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "重置当前通道" }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ positive: { masterCurve, redCurve: null } }), expect.anything())
  })
})

describe("FilmEditingPanel v2 胶片校色", () => {
  const v2Positive = (): ImageProcessingConfig => ({
    schemaVersion: 2,
    algorithmVersion: "film-color-v2",
    inputSource: "encoded-raster",
    filmPolarity: "positive",
    encodedInput: { colorSpace: "srgb", bitDepth: 8 },
    positive: { exposureEv: 0 }
  })

  it("扫描成片可开启 v2 正片校色并跳过 negative", async () => {
    const onChange = vi.fn()
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "ok",
      imagePath: "/photos/scan.jpg",
      format: "jpg",
      sourceVersion: "sha256:test",
      orientation: 1,
      width: 100,
      height: 80,
      container: { width: 100, height: 80, bitDepth: 8, bands: 3, alpha: false, colorModel: "rgb", imageCount: 1, tiffContainer: false },
      icc: { present: true, sha256: "a".repeat(64), source: "embedded" },
      preview: { available: false, width: 0, height: 0 },
      inputSources: ["encoded-raster"],
      recommendedInputSource: "encoded-raster",
      warnings: []
    }), { status: 200, headers: { "Content-Type": "application/json" } })))
    render(<FilmEditingPanel config={null} error={null} sourcePath="/photos/scan.jpg" capabilities={capabilities(true)} onChange={onChange} />)

    fireEvent.click(screen.getByRole("button", { name: "开启胶片校色（正片）" }))

    await vi.waitFor(() => expect(onChange).toHaveBeenCalled())
    const config = onChange.mock.calls.at(-1)![0] as ImageProcessingConfig
    expect(config.schemaVersion).toBe(2)
    expect(config.inputSource).toBe("encoded-raster")
    expect(config.filmPolarity).toBe("positive")
    expect(config.negative ?? null).toBeNull()
    expect(config.encodedInput).toMatchObject({ colorSpace: "embedded", bitDepth: 8, iccSha256: "a".repeat(64) })
    vi.unstubAllGlobals()
  })

  it("输入探测失败不会启用猜测的校色配方", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("文件不可读") }))
    const onChange = vi.fn()
    render(<FilmEditingPanel config={null} error={null} sourcePath="/photos/scan.jpg" capabilities={capabilities(true)} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "开启胶片校色（正片）" }))
    await vi.waitFor(() => expect(screen.getByText(/图像探测失败/)).toBeTruthy())
    expect(onChange).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it("v2 正片隐藏片基/密度分支，彩负切换后才显示", () => {
    const onChange = vi.fn()
    render(<FilmEditingPanel config={v2Positive()} error={null} sourcePath="/photos/scan.jpg" capabilities={capabilities(true)} onChange={onChange} />)

    expect(screen.queryByLabelText("来源")).toBeNull()
    fireEvent.change(screen.getByLabelText("处理分支"), { target: { value: "color-negative" } })
    fireEvent.blur(screen.getByLabelText("处理分支"))
    const config = onChange.mock.calls[0]![0] as ImageProcessingConfig
    expect(config.filmPolarity).toBe("color-negative")
    expect(config.negative).toMatchObject({ enabled: false, filmBase: null })
  })
})

it("非法数字草稿不修改配方，回车提交合法值", () => {
  const onChange = vi.fn()
  render(<FilmEditingPanel config={enabledConfig()} error={null} sourcePath="/scan.ARW" capabilities={capabilities(true)} onChange={onChange} />)
  const field = screen.getByLabelText("曝光 EV")
  fireEvent.change(field, { target: { value: "" } }); fireEvent.blur(field)
  expect(onChange).not.toHaveBeenCalled()
  expect(screen.getByRole("alert").textContent).toContain("原配方保持不变")
  fireEvent.change(field, { target: { value: "1.25" } }); fireEvent.keyDown(field, { key: "Enter" })
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ positive: expect.objectContaining({ exposureEv: 1.25 }) }), expect.anything())
})
