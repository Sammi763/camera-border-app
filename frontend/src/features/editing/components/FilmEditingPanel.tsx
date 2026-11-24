import { awaitFilmBase, isFilmBasePending } from "../defaults"
import { useEffect, useMemo, useRef, useState } from "react"
import type {
  ImageProcessingConfig,
  MonotonicCurve,
  NegativeConfig,
  PositiveAdjustments,
  SourceGeometry
} from "../../../types/imageProcessing"
import type { CapabilitiesResponse } from "../../../types/preview"
import type { FilmSyncField, FilmSyncResult, FilmSyncOptions, OperationScope } from "../../queue/types"
import { CurveEditor, type CurveChannel } from "./CurveEditor"
import {
  createDefaultFilmColorProcessing,
  createDefaultFilmProcessing,
  isColorGradingCapablePath,
  isFilmCapablePath,
  isLinearTiffPath
} from "../defaults"
import { isRawFile } from "../../metadata/constants/rawExtensions"
import { probeImage } from "../../../services/engine/imageProbeApi"

type FilmEditingPanelProps = {
  readonly config: ImageProcessingConfig | null
  readonly error: string | null
  readonly curveTools?: {
    readonly channel: CurveChannel
    readonly setChannel: (channel: CurveChannel) => void
    readonly histogram?: readonly number[]
    readonly sampledTones?: readonly number[]
    readonly picking: boolean
    readonly togglePicking: () => void
  } | undefined
  readonly sourcePath: string | null
  readonly capabilities: CapabilitiesResponse | null
  readonly onChange: (
    config: ImageProcessingConfig | null,
    options?: { readonly historyTag?: string; readonly description?: string }
  ) => void
  readonly operationScope?: OperationScope
  readonly onOperationScopeChange?: (scope: OperationScope) => void
  readonly onSync?: (scope: OperationScope, source: ImageProcessingConfig, fields: readonly FilmSyncField[], options?: FilmSyncOptions) => Promise<FilmSyncResult>
}

type NumberFieldProps = {
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step?: number
  readonly disabled?: boolean
  readonly slider?: boolean
  readonly onChange: (value: number) => void
}

const NumberField = ({ label, value, min, max, step = 0.01, disabled = false, slider = false, onChange }: NumberFieldProps): JSX.Element => {
  const [draft, setDraft] = useState(String(value))
  const [invalid, setInvalid] = useState(false)
  useEffect(() => { setDraft(String(value)); setInvalid(false) }, [value])
  const submit = () => {
    const next = Number(draft)
    if (!draft.trim() || !Number.isFinite(next) || next < min || next > max) { setInvalid(true); return }
    setInvalid(false); onChange(next)
  }
  return <label className={slider ? "filmField filmSliderRow" : "filmField"}><span>{label}</span><input type="number" value={draft} min={min} max={max} step={step} disabled={disabled} aria-invalid={invalid}
    onChange={event => { setDraft(event.target.value); setInvalid(false) }} onBlur={submit}
    onKeyDown={event => { if (event.key === "Enter") submit(); if (event.key === "Escape") { setDraft(String(value)); setInvalid(false) } }} />
    {slider && <input type="range" aria-label={`${label}滑杆`} value={value} min={min} max={max} step={step}
      disabled={disabled} onChange={(event) => onChange(event.currentTarget.valueAsNumber)} />}
    {invalid && <span role="alert">请输入 {min} 至 {max} 的有效数值；原配方保持不变</span>}</label>
}

const updateNegative = (config: ImageProcessingConfig, patch: Partial<NegativeConfig>): ImageProcessingConfig => ({
  ...config,
  negative: config.negative === null || config.negative === undefined
    ? null
    : { ...config.negative, ...patch }
})

const updatePositive = (config: ImageProcessingConfig, patch: Partial<PositiveAdjustments>): ImageProcessingConfig => ({
  ...config,
  positive: { ...(config.positive ?? {}), ...patch }
})

const updateGeometry = (config: ImageProcessingConfig, patch: Partial<SourceGeometry>): ImageProcessingConfig => ({
  ...config,
  sourceGeometry: { ...(config.sourceGeometry ?? { crop: { x: 0, y: 0, width: 1, height: 1 }, rotationDegrees: 0 }), ...patch }
})

/**
 * 底片编辑面板（T09）。
 *
 * 控件只写入 ImageProcessingConfig；不在前端重新实现算法。真实 RAW/线性测试输入的
 * 选择由文件类型决定；能力缺失时全部操作禁用并显示原因，绝不展示占位滑块。
 */
export const FilmEditingPanel = ({
  config,
  error,
  sourcePath,
  curveTools,
  capabilities,
  onChange,
  operationScope = "active",
  onOperationScopeChange,
  onSync
}: FilmEditingPanelProps): JSX.Element => {
  const syncController = useRef<AbortController | null>(null)
  const [syncStatus, setSyncStatus] = useState("")
  const [syncing, setSyncing] = useState(false)
  useEffect(() => () => syncController.current?.abort(), [])
  const [linearConfirmed, setLinearConfirmed] = useState(false)
  const [linearSpace, setLinearSpace] = useState<"linear-rec2020" | "linear-srgb">("linear-rec2020")
  const [probeMessage, setProbeMessage] = useState<string | null>(null)
  const [probeLoading, setProbeLoading] = useState(false)
  useEffect(() => { setLinearConfirmed(false); setProbeMessage(null) }, [sourcePath])
  const [localCurveChannel, setLocalCurveChannel] = useState<CurveChannel>("master")
  const curveChannel = curveTools?.channel ?? localCurveChannel
  const setCurveChannel = curveTools?.setChannel ?? setLocalCurveChannel
  const [syncFields, setSyncFields] = useState<readonly FilmSyncField[]>([
    "lightSource", "filmBase", "density", "positive", "curves"
  ])
  const probeSequence = useRef(0)
  useEffect(() => { probeSequence.current++; setProbeLoading(false) }, [sourcePath])
  const currentSource = useRef(sourcePath)
  currentSource.current = sourcePath
  const capable = isFilmCapablePath(sourcePath) || isColorGradingCapablePath(sourcePath)
  const capability = capabilities?.filmDigitization
  const isV2 = config?.schemaVersion === 2
  const v2ColorNegative = isV2 && config?.filmPolarity === "color-negative"
  const sensorRaw = config?.inputMode === "sensor-raw"
    || config?.inputSource === "camera-raw"
    || (config === null && sourcePath !== null
      && isRawFile(sourcePath) && !sourcePath.toLowerCase().endsWith(".fff"))
  const rawDecoderAvailable = capabilities?.components?.["libraw"]?.available === true
  const available = capability?.available === true && (!sensorRaw || rawDecoderAvailable)
  const reason = capability?.available !== true
    ? (capability?.reason ?? "引擎未报告底片数字化能力")
    : sensorRaw && !rawDecoderAvailable
      ? "真实 RAW 需要随包 LibRaw helper；当前组件不可用"
      : (capability?.reason ?? "底片处理可用")
  const enabled = config !== null && config !== undefined
  const linearTiff = isLinearTiffPath(sourcePath)
  const disabled = !available || !capable
  const negative = config?.negative ?? null
  const pendingBase = isFilmBasePending(config)
  const positive: PositiveAdjustments = config?.positive ?? {}

  const startColorGrading = async (): Promise<void> => {
    if (sourcePath === null) return
    const sequence = ++probeSequence.current
    setProbeLoading(true)
    setProbeMessage(null)
    try {
      const probe = await probeImage({ imagePath: sourcePath })
      if (currentSource.current !== sourcePath || sequence !== probeSequence.current) return
      onChange(createDefaultFilmColorProcessing(sourcePath, "positive", probe), {
        description: "开启胶片校色（正片）"
      })
      if (probe.recommendedInputSource === "flextight-fff") {
        setProbeMessage("FFF 输入域为人工声明，尚未完成设备校准；请核对输入定义与转正结果")
      } else if (probe.recommendedInputSource === "encoded-raster" && probe.icc?.present !== true) {
        setProbeMessage("源文件没有嵌入 ICC；已显式保存 sRGB 选择，请确认后按需要修改")
      }
    } catch (caught) {
      if (currentSource.current !== sourcePath || sequence !== probeSequence.current) return
      setProbeMessage(caught instanceof Error ? caught.message : "探测失败，请重试")
    } finally {
      if (sequence === probeSequence.current) setProbeLoading(false)
    }
  }

  const switchPolarity = (polarity: "positive" | "color-negative"): void => {
    if (config === null) return
    const defaults = createDefaultFilmColorProcessing(sourcePath ?? "", polarity)
    onChange({
      ...config,
      filmPolarity: polarity,
      negative: polarity === "color-negative"
        ? (config.negative ?? awaitFilmBase(defaults)?.negative ?? null)
        : null
    }, { description: polarity === "positive" ? "切换为正片校色" : "切换为彩负转正" })
  }
  const geometry: SourceGeometry = config?.sourceGeometry ?? { crop: { x: 0, y: 0, width: 1, height: 1 }, rotationDegrees: 0 }
  const curve = useMemo<MonotonicCurve | null | undefined>(() => {
    switch (curveChannel) {
      case "red": return positive.redCurve
      case "green": return positive.greenCurve
      case "blue": return positive.blueCurve
      default: return positive.masterCurve
    }
  }, [curveChannel, positive.blueCurve, positive.greenCurve, positive.masterCurve, positive.redCurve])

  const updateCurve = (next: MonotonicCurve | null, historyTag: string): void => {
    if (config === null) return
    const patch = curveChannel === "red" ? { redCurve: next }
      : curveChannel === "green" ? { greenCurve: next }
        : curveChannel === "blue" ? { blueCurve: next }
          : { masterCurve: next }
    onChange(updatePositive(config, patch), { historyTag, description: "修改底片曲线" })
  }

  if (sourcePath === null) {
    return <p className="settingsCapabilityHint">请先选择一张图片，再进入底片处理。</p>
  }

  return (
    <section className="filmEditingPanel" aria-label="底片数字化">
      <div className="filmPanelHeader" data-enabled={enabled}>
        <div>
          <h2 className="filmPanelTitle">胶片校色</h2>
          {enabled && <p className="settingsCapabilityHint">
            {isV2
              ? `${config?.inputSource === "flextight-fff" ? "Flextight FFF RGB16 扫描"
                : config?.inputSource === "camera-raw" ? "真实传感器 RAW"
                  : "已编码扫描/数码正片"} · ${config?.filmPolarity === "color-negative" ? "彩色负片转正" : "正片校色（跳过反相）"}`
              : `${sensorRaw ? "真实传感器 RAW" : "线性 16-bit TIFF 测试输入"} · 通用彩负（未校准）`}
          </p>}
        </div>
        <div className="filmEnableActions">
          {!enabled && (
            <button type="button" className="primaryButton" disabled={disabled || probeLoading}
              onClick={() => void startColorGrading()}>
              {probeLoading ? "探测输入…" : "开启胶片校色（正片）"}
            </button>
          )}
          {(enabled || sensorRaw || linearTiff) && <button
            type="button"
            className={enabled ? "ghostButton filmEnableButton" : "ghostButton"}
            disabled={(disabled || (!sensorRaw && !linearConfirmed)) && !enabled}
            onClick={() => {
              if (enabled) {
                onChange(null, { description: "关闭底片处理" })
              } else {
                const next = awaitFilmBase(createDefaultFilmProcessing(sourcePath))
                onChange(next?.inputMode === "linear-tiff" ? { ...next,
                  linearInput: { ...next.linearInput!, colorSpace: linearSpace } } : next, { description: "开启底片处理" })
              }
            }}
          >
            {enabled ? "关闭底片处理" : "开启底片处理"}
          </button>}
        </div>
      </div>
      {!available && <p className="filmCapabilityWarning" role="status">{reason}</p>}
      {!capable && <p className="filmCapabilityWarning" role="status">该文件格式不能进入胶片校色；请选择受支持的图片。</p>}
      {probeMessage !== null && <p className="filmCapabilityWarning" role="status">{probeMessage}</p>}
      {error !== null && <p className="filmCapabilityWarning" role="alert">{error}</p>}
      {linearTiff && !enabled && <fieldset className="filmSection" disabled={disabled}><legend>线性输入确认</legend>
        <label className="filmField"><span>输入空间</span><select value={linearSpace} onChange={(e) => setLinearSpace(e.target.value === "linear-srgb" ? "linear-srgb" : "linear-rec2020")}>
          <option value="linear-rec2020">线性 Rec.2020</option><option value="linear-srgb">线性 sRGB</option></select></label>
        <label><input type="checkbox" checked={linearConfirmed} onChange={(e) => setLinearConfirmed(e.target.checked)} />我确认这是 16-bit 线性 TIFF，且输入空间与上方一致</label>
        <p className="settingsCapabilityHint">普通已编码 TIFF 不能按线性负片解释。带 ICC 时，引擎还会核对其基色与传递函数。</p>
      </fieldset>}
      {pendingBase && <p role="status" className="settingsCapabilityHint">请在完整负片上框选未曝光片边，或选用同卷校准。</p>}
      {enabled && !pendingBase && (
        <CurveEditor
          key={sourcePath}
          label={curveChannel === "master" ? "总曲线" : `${curveChannel[0]!.toUpperCase()} 曲线`}
          channel={curveChannel}
          onChannelChange={setCurveChannel}
          histogram={curveTools?.histogram}
          sampledTones={curveTools?.sampledTones}
          pickingTone={curveTools?.picking}
          onPickTone={curveTools?.togglePicking}
          curve={curve}
          onChange={updateCurve}
          disabled={disabled}
        />
      )}
      {enabled && !pendingBase && (
        <fieldset className="filmSection filmBasicSection" disabled={disabled}>
          <legend>基础调整</legend>
          <div className="filmSliderRows">
            <NumberField label="曝光 EV" value={positive.exposureEv ?? 0} min={-5} max={5} step={0.01} disabled={disabled} slider onChange={(value) => config !== null && onChange(updatePositive(config, { exposureEv: value }), { historyTag: "positive:exposure", description: "调整曝光" })} />
            {(["R", "G", "B"] as const).map((channel, index) => (
              <NumberField
                key={channel}
                label={`${channel} 平衡 EV`}
                value={positive.rgbBalanceEv?.[index] ?? 0}
                min={-4}
                max={4}
                step={0.01}
                disabled={disabled} slider
                onChange={(value) => {
                  if (config === null) return
                  const balance = [...(positive.rgbBalanceEv ?? [0, 0, 0])]
                  balance[index] = value
                  onChange(updatePositive(config, { rgbBalanceEv: [balance[0]!, balance[1]!, balance[2]!] as [number, number, number] }), { historyTag: `positive:balance:${channel}`, description: "调整 RGB 平衡" })
                }}
              />
            ))}
            <NumberField label="黑点" value={positive.blackPoint ?? 0} min={0} max={Math.min(0.99, (positive.whitePoint ?? 1) - 0.001)} disabled={disabled} slider onChange={(value) => config !== null && onChange(updatePositive(config, { blackPoint: value }), { historyTag: "positive:black", description: "调整黑点" })} />
            <NumberField label="白点" value={positive.whitePoint ?? 1} min={Math.max(0.01, (positive.blackPoint ?? 0) + 0.001)} max={1} disabled={disabled} slider onChange={(value) => config !== null && onChange(updatePositive(config, { whitePoint: value }), { historyTag: "positive:white", description: "调整白点" })} />
            <NumberField label="饱和度" value={positive.saturation ?? 1} min={0} max={2} step={0.01} disabled={disabled} slider onChange={(value) => config !== null && onChange(updatePositive(config, { saturation: value }), { historyTag: "positive:saturation", description: "调整饱和度" })} />
          </div>
          <button type="button" className="ghostButton" disabled={disabled}
            onClick={() => config !== null && onChange(updatePositive(config, {
              exposureEv: 0, rgbBalanceEv: [0, 0, 0], blackPoint: 0, whitePoint: 1, saturation: 1
            }), { description: "重置基础调整" })}>重置基础调整</button>
        </fieldset>
      )}
      {isV2 && config !== null && (
        <fieldset className="filmSection">
          <legend>胶片性质</legend>
          <label className="filmField"><span>处理分支</span>
            <select value={config.filmPolarity ?? "positive"}
              onChange={(event) => switchPolarity(event.target.value === "color-negative" ? "color-negative" : "positive")}>
              <option value="positive">正片 / 已转正扫描（跳过反相）</option>
              <option value="color-negative">彩色负片转正（片基/密度）</option>
            </select>
          </label>
          {config.inputSource === "encoded-raster" && config.encodedInput !== null && config.encodedInput !== undefined && (
            <label className="filmField"><span>输入色彩定义</span>
              <select value={config.encodedInput.colorSpace}
                onChange={(event) => onChange({
                  ...config,
                  encodedInput: {
                    ...config.encodedInput!,
                    colorSpace: event.target.value as NonNullable<typeof config.encodedInput>["colorSpace"]
                  }
                }, { description: "修改输入色彩定义" })}>
                <option value="embedded" disabled={config.encodedInput.iccSha256 == null}>使用嵌入 ICC</option>
                <option value="srgb">sRGB</option>
                <option value="adobe-rgb">Adobe RGB (1998)</option>
                <option value="prophoto-rgb">ProPhoto RGB</option>
                <option value="linear-srgb">线性 sRGB</option>
                <option value="linear-rec2020">线性 Rec.2020</option>
              </select>
            </label>
          )}
          {config.inputSource === "flextight-fff" && config.flextightInput !== null && config.flextightInput !== undefined && (
            <label className="filmField"><span>FFF 扫描输入域</span>
              <select value={config.flextightInput.colorSpace}
                onChange={(event) => onChange({
                  ...config,
                  flextightInput: {
                    ...config.flextightInput!,
                    colorSpace: event.target.value === "linear-srgb" ? "linear-srgb" : "linear-rec2020"
                  }
                }, { description: "修改 FFF 扫描输入域" })}>
                <option value="linear-rec2020">线性 Rec.2020（RGB16 主图）</option>
                <option value="linear-srgb">线性 sRGB（RGB16 主图）</option>
              </select>
            </label>
          )}
          {config.inputSource === "encoded-raster" && <label className="filmField"><span>透明区域背景</span><select value={config.encodedInput?.alphaBackground ?? "white"} onChange={(e) => onChange({ ...config, encodedInput: { ...config.encodedInput!, alphaBackground: e.target.value === "black" ? "black" : "white" } })}><option value="white">白色</option><option value="black">黑色</option></select></label>}
          <p className="settingsCapabilityHint">
            {config.inputSource === "flextight-fff" ? "FFF 实验输入域未标定 · " : ""}输入来源：{config.inputSource} · 位深 {config.encodedInput?.bitDepth ?? config.flextightInput?.bitDepth ?? config.linearInput?.bitDepth ?? "RAW"}。
            文件内输出 Adobe RGB/历史 gamma 不会自动成为输入定义。
          </p>
        </fieldset>
      )}
      {enabled && (
        <div className="filmPanelSections" aria-disabled={disabled}>
            {sensorRaw && config !== null && <label className="filmField"><span>RAW 白平衡</span>
              <select value={config.raw?.whiteBalance ?? "camera"} onChange={(event) => onChange({ ...config,
                raw: { ...config.raw, whiteBalance: event.target.value === "daylight" ? "daylight" : "camera" } }, { description: "修改 RAW 白平衡" })}>
                <option value="camera">相机记录</option><option value="daylight">固定日光</option>
              </select></label>}
          {!pendingBase && (!isV2 || v2ColorNegative) && <>
          <fieldset className="filmSection" disabled={disabled}>
            <legend>输入与光源</legend>

            <p className="filmStaticValue">{sensorRaw ? "传感器 RAW（LibRaw）" : config?.inputSource === "flextight-fff" ? "FFF 扫描 RGB16（实验输入域未标定）" : config?.inputSource === "encoded-raster" ? "已编码扫描栅格" : "线性 TIFF（显式 linear）"}</p>
            <label className="filmField">
              <span>光源</span>
              <select
                value={negative?.lightSource?.kind ?? "camera-white-balance"}
                disabled={disabled}
                onChange={(event) => config !== null && onChange(updateNegative(config, {
                  lightSource: event.target.value === "calibration"
                    ? { kind: "calibration", rgbGain: [1, 1, 1] }
                    : { kind: "camera-white-balance" }
                }), { description: "修改底片光源" })}
              >
                <option value="camera-white-balance">相机白平衡</option>
                <option value="calibration">校准增益</option>
              </select>
            </label>
            {negative?.lightSource?.referenceImagePath != null && <p className="settingsCapabilityHint">光源增益由已绑定参考帧计算；切换光源选项可改用手动增益。</p>}
            {negative?.lightSource?.kind === "calibration" && negative.lightSource.referenceImagePath == null && (
              <div className="filmFieldGrid">
                {(["R", "G", "B"] as const).map((channel, index) => (
                  <NumberField
                    key={channel}
                    label={`${channel} 增益`}
                    value={negative.lightSource?.rgbGain?.[index] ?? 1}
                    min={0.1}
                    max={10}
                    step={0.01}
                    disabled={disabled}
                    onChange={(value) => {
                      if (config === null) return
                      const gain = [...(negative?.lightSource?.rgbGain ?? [1, 1, 1])]
                      gain[index] = value
                      onChange(updateNegative(config, {
                        lightSource: { ...(negative!.lightSource!), rgbGain: [gain[0]!, gain[1]!, gain[2]!] as [number, number, number] }
                      }), { description: "修改光源增益" })
                    }}
                  />
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="filmSection" disabled={disabled}>
            <legend>片基</legend>
            <label className="filmField">
              <span>来源</span>
              <select
                value={negative?.filmBase?.kind ?? "roi"}
                disabled={disabled}
                onChange={(event) => config !== null && onChange(updateNegative(config, {
                  filmBase: event.target.value === "manual"
                    ? { kind: "manual", rgb: [1, 1, 1], stage: "linear-working" }
                    : { kind: "roi", roi: { x: 0.02, y: 0.02, width: 0.08, height: 0.05 }, stage: "linear-working" }
                }), { description: "修改片基来源" })}
              >
                <option value="roi">同图 ROI</option>
                <option value="manual">手工 RGB</option>
                <option value="reference-frame" disabled>已绑定同卷参考帧</option>
              </select>
            </label>
            {negative?.filmBase?.kind === "roi" && negative.filmBase.roi !== undefined && negative.filmBase.roi !== null && (
              <div className="filmFieldGrid">
                <NumberField label="ROI X" value={negative.filmBase.roi.x} min={0} max={1 - negative.filmBase.roi.width} onChange={(value) => config !== null && onChange(updateNegative(config, { filmBase: { ...negative.filmBase!, roi: { ...negative.filmBase!.roi!, x: value } } }), { description: "调整片基 ROI" })} />
                <NumberField label="ROI Y" value={negative.filmBase.roi.y} min={0} max={1 - negative.filmBase.roi.height} onChange={(value) => config !== null && onChange(updateNegative(config, { filmBase: { ...negative.filmBase!, roi: { ...negative.filmBase!.roi!, y: value } } }), { description: "调整片基 ROI" })} />
                <NumberField label="ROI 宽" value={negative.filmBase.roi.width} min={0.001} max={1 - negative.filmBase.roi.x} onChange={(value) => config !== null && onChange(updateNegative(config, { filmBase: { ...negative.filmBase!, roi: { ...negative.filmBase!.roi!, width: value } } }), { description: "调整片基 ROI" })} />
                <NumberField label="ROI 高" value={negative.filmBase.roi.height} min={0.001} max={1 - negative.filmBase.roi.y} onChange={(value) => config !== null && onChange(updateNegative(config, { filmBase: { ...negative.filmBase!, roi: { ...negative.filmBase!.roi!, height: value } } }), { description: "调整片基 ROI" })} />
              </div>
            )}
            {negative?.filmBase?.kind === "manual" && (
              <div className="filmFieldGrid">
                {(["R", "G", "B"] as const).map((channel, index) => (
                  <NumberField
                    key={channel}
                    label={`片基 ${channel}`}
                    value={negative.filmBase?.rgb?.[index] ?? 1}
                    min={0.001}
                    max={4}
                    step={0.001}
                    disabled={disabled}
                    onChange={(value) => {
                      if (config === null) return
                      const rgb = [...(negative?.filmBase?.rgb ?? [1, 1, 1])]
                      rgb[index] = value
                      onChange(updateNegative(config, { filmBase: { ...negative!.filmBase!, rgb: [rgb[0]!, rgb[1]!, rgb[2]!] as [number, number, number] } }), { description: "修改手工片基" })
                    }}
                  />
                ))}
              </div>
            )}
            <p className="settingsCapabilityHint">在预览区点击「框选片基」，可直接框选未曝光片边；也可选择同卷片基参考帧。</p>
          </fieldset>

          <fieldset className="filmSection" disabled={disabled}>
            <legend>转正与密度</legend>
            <div className="filmFieldGrid">
              <NumberField label="密度下限" value={negative?.density?.min ?? 0} min={0} max={(negative?.density?.max ?? 3) - 0.1} onChange={(value) => config !== null && onChange(updateNegative(config, { density: { ...negative?.density, min: value } }), { description: "修改密度范围" })} />
              <NumberField label="密度上限" value={negative?.density?.max ?? 3} min={(negative?.density?.min ?? 0) + 0.1} max={6} onChange={(value) => config !== null && onChange(updateNegative(config, { density: { ...negative?.density, max: value } }), { description: "修改密度范围" })} />
            </div>
            <p className="settingsCapabilityHint">通用彩负 T=image/base、D=-log10(T)；Gold/Portra 专属配置需校准证据。</p>
          </fieldset>
          </>}

          <details className="filmDisclosure">
            <summary>源图裁切与校平</summary>
            <fieldset className="filmSection" disabled={disabled} aria-label="源图裁切与校平">
              <div className="filmFieldGrid">
                <NumberField label="裁切 X" value={geometry.crop?.x ?? 0} min={0} max={1 - (geometry.crop?.width ?? 1)} disabled={disabled} onChange={(value) => config !== null && onChange(updateGeometry(config, { crop: { ...(geometry.crop ?? { x: 0, y: 0, width: 1, height: 1 }), x: value } }), { description: "调整源图裁切" })} />
                <NumberField label="裁切 Y" value={geometry.crop?.y ?? 0} min={0} max={1 - (geometry.crop?.height ?? 1)} disabled={disabled} onChange={(value) => config !== null && onChange(updateGeometry(config, { crop: { ...(geometry.crop ?? { x: 0, y: 0, width: 1, height: 1 }), y: value } }), { description: "调整源图裁切" })} />
                <NumberField label="裁切宽" value={geometry.crop?.width ?? 1} min={0.01} max={1 - (geometry.crop?.x ?? 0)} disabled={disabled} onChange={(value) => config !== null && onChange(updateGeometry(config, { crop: { ...(geometry.crop ?? { x: 0, y: 0, width: 1, height: 1 }), width: value } }), { description: "调整源图裁切" })} />
                <NumberField label="裁切高" value={geometry.crop?.height ?? 1} min={0.01} max={1 - (geometry.crop?.y ?? 0)} disabled={disabled} onChange={(value) => config !== null && onChange(updateGeometry(config, { crop: { ...(geometry.crop ?? { x: 0, y: 0, width: 1, height: 1 }), height: value } }), { description: "调整源图裁切" })} />
                <NumberField label="校平角度" value={geometry.rotationDegrees ?? 0} min={-45} max={45} step={0.1} disabled={disabled} onChange={(value) => config !== null && onChange(updateGeometry(config, { rotationDegrees: value }), { historyTag: "geometry:rotation", description: "调整校平" })} />
              </div>
            </fieldset>
          </details>

          {!pendingBase && onSync !== undefined && onOperationScopeChange !== undefined && (
            <details className="filmDisclosure">
              <summary>同卷同步</summary>
              <fieldset className="filmSection" disabled={disabled} aria-label="同卷同步">
                <label className="filmField">
                  <span>范围</span>
                  <select value={operationScope} onChange={(event) => onOperationScopeChange(event.target.value as OperationScope)} disabled={disabled}>
                    <option value="active">当前图片</option>
                    <option value="checked">已选图片</option>
                    <option value="all">全部图片</option>
                  </select>
                </label>
                <div className="filmFieldGrid" role="group" aria-label="同步字段">
                  {([
                    ["lightSource", "光源"],
                    ["filmBase", "片基"],
                    ["density", "密度"],
                    ["positive", "基础调整"],
                    ["curves", "曲线"],
                    ["sourceGeometry", "裁切/校平"]
                  ] as const).map(([field, label]) => (
                    <label key={field} className="filmField filmCheckboxField">
                      <input
                        type="checkbox"
                        checked={syncFields.includes(field)}
                        disabled={disabled}
                        onChange={(event) => setSyncFields((previous) => event.target.checked
                          ? [...previous, field]
                          : previous.filter((candidate) => candidate !== field))}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="primaryButton"
                  disabled={disabled || syncing || syncFields.length === 0}
                  onClick={() => {
                    const controller = new AbortController(); syncController.current = controller; setSyncing(true)
                    void onSync(operationScope, config!, syncFields, { signal: controller.signal, onProgress: (done, total) => setSyncStatus(`已检查 ${done}/${total}`) })
                      .then(result => setSyncStatus(result.cancelled ? "已取消，未提交变更" : `已同步 ${result.applied.length} · 未变化 ${result.unchanged.length} · 跳过 ${result.skipped.length} · 失败 ${result.failed.length}。${[...result.skipped, ...result.failed].map(item => item.reason).join("；")}`))
                      .catch(error => setSyncStatus(error instanceof Error ? error.message : "同步失败"))
                      .finally(() => setSyncing(false))
                  }}
                >
                  同步到{operationScope === "active" ? "当前图片" : operationScope === "checked" ? "已选图片" : "全部图片"}
                </button>
                {syncing && <button type="button" onClick={() => syncController.current?.abort()}>取消同步</button>}
                <p role="status">{syncStatus}</p>
                <p className="settingsCapabilityHint">只复制勾选字段组；跳过不同输入类型的图片。参考帧按内容指纹解析，相机、白平衡和输入空间须匹配。</p>
              </fieldset>
            </details>
          )}
        </div>
      )}
    </section>
  )
}
