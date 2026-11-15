import { useEffect, useRef, useState } from "react"
import { probeImage } from "../../../services/engine/imageProbeApi"
import { analyzeImage } from "../../../services/engine/imageAnalysisApi"
import { requestPreview } from "../../../services/engine/previewApi"
import { isFilmCancellation } from "../../../services/engine/filmRequestsApi"
import { migrateImageProcessing } from "../../queue/imageProcessingSession"
import { FilmColorPresets } from "./FilmColorPresets"
import { loadLocalImagePreview } from "../../../services/desktop/localImagePreview"
import type { RenderSettings } from "../../settings/types"
import type { PreviewState } from "../../preview/types"
import type { ImageAnalysisResponse, ImageAnalysisStage, ImageProcessingConfig, NeutralBalanceSuggestion, NormalizedCrop } from "../../../types/imageProcessing"

type Props = {
  state: Extract<PreviewState, { kind: "active" }>
  settings: RenderSettings
  config: ImageProcessingConfig | null
  onChange?: ((config: ImageProcessingConfig, options?: { historyTag?: string; description?: string }) => void) | undefined
  onSourceVersion?: ((version: string) => void) | undefined
  viewportCommand?: { type: "fit" | "actual"; sequence: number } | null | undefined
}
const inputIdentity = (config: ImageProcessingConfig): string => config.inputSource ?? config.inputMode ?? ""

type SavedCalibration = { id: string; name: string; version: number; inputMode: string; negative: ImageProcessingConfig["negative"] }
const STORAGE_KEY = "film.calibrations.v1"
const client = () => `film_${Math.random().toString(36).slice(2)}`
const message = (e: unknown) => e instanceof Error ? e.message : "底片请求失败"
const readSaved = (): SavedCalibration[] => {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
    return Array.isArray(data) ? data.filter((item): item is SavedCalibration => item !== null && typeof item === "object"
      && typeof item.id === "string" && typeof item.name === "string" && item.version === 1 && item.negative !== null && typeof item.negative === "object") : []
  } catch { return [] }
}

/** 对比、实际像素检查和取样共用引擎配方；取样模式切到完整源图，避免显示坐标混淆。 */
export const FilmWorkspacePreview = ({ state, settings, config, onChange, onSourceVersion, viewportCommand }: Props): JSX.Element => {
  const [stage, setStage] = useState<ImageAnalysisStage>("current-positive")
  const [picking, setPicking] = useState(false)
  const [neutralPicking, setNeutralPicking] = useState(false)
  const [neutral, setNeutral] = useState<NeutralBalanceSuggestion | null>(null)
  const [neutralForSignature, setNeutralForSignature] = useState<string | null>(null)
  const [actual, setActual] = useState(false)
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ImageAnalysisResponse | null>(null)
  const [reference, setReference] = useState<{ path: string; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [roi, setRoi] = useState<NormalizedCrop | null>(null)
  const [saved, setSaved] = useState(readSaved)
  const [name, setName] = useState("")
  const [chosen, setChosen] = useState("")
  const image = useRef<HTMLImageElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const callback = useRef(onSourceVersion); callback.current = onSourceVersion
  const signature = JSON.stringify(config)
  const identity = `${state.filePath}|${signature}`
  const currentIdentity = useRef(identity); currentIdentity.current = identity
  const pending = useRef(0)
  const operation = useRef(0)
  const neutralVersion = useRef<string | null>(null)
  const neutralOrigin = useRef<{ signature: string; binding: string | null } | null>(null)
  const [stagePreviewDone, setStagePreviewDone] = useState(false)
  const decodeRef = useRef(state.engineResponse?.sourceDecode ?? null); decodeRef.current = state.engineResponse?.sourceDecode ?? null
  useEffect(() => { if (viewportCommand != null) setActual(viewportCommand.type === "actual") }, [viewportCommand?.sequence])
  const stableRecipe = state.engineRecipe ?? null
  const engineClientId = state.engineClientId ?? null
  const engineGeneration = state.engineGeneration ?? null
  const effectiveStage: ImageAnalysisStage = neutralPicking ? "base-positive" : picking ? "raw-linear" : stage
  const needStagePreview = effectiveStage !== "current-positive" || picking || neutralPicking || actual
  useEffect(() => { setStage("current-positive"); setPicking(false); setNeutralPicking(false); setActual(false); setRoi(null); setStagePreviewDone(false); setNeutral(null); setNeutralForSignature(null); setReference(null); setError(null); operation.current++ }, [state.filePath])
  useEffect(() => { setStagePreviewDone(false); setUrl(null); setAnalysis(null) }, [effectiveStage, picking, neutralPicking, actual, stableRecipe, engineGeneration])
  useEffect(() => { setNeutral(null); setNeutralForSignature(null) ; operation.current++ }, [signature])

  const begin = (): void => {
    pending.current += 1
    setBusy(true)
  }
  const end = (): void => {
    pending.current = Math.max(0, pending.current - 1)
    if (pending.current === 0) setBusy(false)
  }

  // 阶段对比/取样/100%：优先请求可见预览；与主预览共用稳定配方和同一代次。
  useEffect(() => {
    if (config === null || stableRecipe === null || engineClientId === null || engineGeneration === null) return
    if (actual && Math.max(decodeRef.current?.fullWidth ?? 0,
      decodeRef.current?.fullHeight ?? 0) > 8192) {
      setError("完整像素超过检查预算，请切回适应窗口")
      return
    }
    if (!needStagePreview) {
      setStagePreviewDone(true)
      return
    }
    let active = true
    const controller = new AbortController()
    setError(null)
    begin()
    void requestPreview({
      recipe: stableRecipe,
      maxWidth: actual ? 0 : 1280,
      maxHeight: actual ? 0 : 1280,
      stage: effectiveStage,
      sourceCoordinates: picking || neutralPicking,
      actualPixels: actual,
      clientId: engineClientId,
      generation: engineGeneration
    }, undefined, controller.signal)
      .then((result) => {
        if (!active) return
        setUrl(result.previewAvailable && /^\/previews\/[A-Za-z0-9_-]+$/.test(result.previewUrl)
          ? result.previewUrl : null)
        setStagePreviewDone(true)
      })
      .catch((e: unknown) => {
        if (!active || controller.signal.aborted || isFilmCancellation(e)) return
        setError(message(e))
      })
      .finally(end)
    return () => { active = false; controller.abort() }
  }, [stableRecipe, engineClientId, engineGeneration, effectiveStage, picking, neutralPicking, actual, needStagePreview])

  // 直方图：当前结果等待主预览同步后执行；阶段对比等待该阶段预览完成后再执行。
  useEffect(() => {
    if (config === null || stableRecipe === null || engineClientId === null || engineGeneration === null) return
    const ready = needStagePreview ? stagePreviewDone : state.engineSyncStatus === "synced"
    if (!ready) return
    let active = true
    const controller = new AbortController()
    const identityAtStart = currentIdentity.current
    setAnalysis(null)
    begin()
    void analyzeImage({
      recipe: stableRecipe,
      stage: effectiveStage,
      outputSpace: settings.filmOutput === "tiff16-rec2020" ? "linear-rec2020" : "srgb",
      clientId: engineClientId,
      generation: engineGeneration
    }, undefined, controller.signal)
      .then((result) => {
        if (!active || currentIdentity.current !== identityAtStart) return
        setAnalysis(result)
        callback.current?.(result.sourceVersion)
      })
      .catch((e: unknown) => {
        if (!active || controller.signal.aborted || isFilmCancellation(e)) return
        setError(message(e))
      })
      .finally(end)
    return () => { active = false; controller.abort() }
  }, [stableRecipe, engineClientId, engineGeneration, effectiveStage, needStagePreview,
    stagePreviewDone, state.engineSyncStatus, settings.filmOutput])

  const point = (event: React.PointerEvent) => {
    const box = image.current?.getBoundingClientRect()
    if (box === undefined || box.width <= 0 || box.height <= 0) return null
    return { x: Math.round(Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * 1e6) / 1e6,
      y: Math.round(Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) * 1e6) / 1e6 }
  }
  const finish = () => {
    start.current = null
    if (roi === null || roi.width < 0.001 || roi.height < 0.001) return
    if (neutralPicking) {
      setNeutralPicking(false)
      if (stableRecipe === null) return
      begin()
      const requestedIdentity = currentIdentity.current
      const requestNumber = ++operation.current
      void analyzeImage({
        recipe: stableRecipe,
        purpose: "neutral-balance",
        roi,
        ...(engineClientId === null ? {} : { clientId: engineClientId }),
        ...(engineGeneration === null ? {} : { generation: engineGeneration })
      }).then((result) => {
        if (currentIdentity.current !== requestedIdentity || requestNumber !== operation.current) return
        neutralVersion.current = result.sourceVersion
        neutralOrigin.current = { signature: result.recipeSignature, binding: result.neutralBalance?.binding ?? null }
        setNeutral(result.neutralBalance ?? null)
        setNeutralForSignature(signature)
      }).catch((e: unknown) => { if (currentIdentity.current === requestedIdentity && requestNumber === operation.current) setError(message(e)) }).finally(end)
      return
    }
    if (config?.negative == null) return
    onChange?.({ ...config, negative: { ...config.negative, filmBase: { kind: "roi", stage: "linear-working", roi } } },
      { description: "从负片源图选取片基" })
  }
  const pickReference = async (): Promise<void> => {
    try {
      const requestedIdentity = currentIdentity.current
      const files = await window.desktop?.selectImageFiles?.()
      const path = files?.[0]
      if (path === undefined) return
      const preview = await loadLocalImagePreview(path, 1280, 1280)
      if (preview === null) {
        setError("参考图无法在本机预览；仅对照用途，不影响当前校色配方")
        return
      }
      if (currentIdentity.current === requestedIdentity) setReference({ path, url: preview.dataUrl })
    } catch (caught) {
      setError(message(caught))
    }
  }

  const applyNeutral = async (): Promise<void> => {
    if (config === null || neutral === null || !neutral.available
      || neutral.suggestedRgbBalanceEv == null || neutralForSignature !== signature || !neutralOrigin.current?.signature || neutral.binding !== neutralOrigin.current.binding) return
    const requestedIdentity = currentIdentity.current
    begin()
    try {
      const probe = await probeImage({ imagePath: state.filePath })
      if (currentIdentity.current !== requestedIdentity) return
      if (probe.sourceVersion !== neutralVersion.current) { setNeutral(null); setError("源文件已变化，请重新取样"); return }
    const value = neutral.suggestedRgbBalanceEv
    onChange?.({ ...config, positive: { ...(config.positive ?? {}), rgbBalanceEv: [value[0], value[1], value[2]] } },
      { historyTag: "positive:balance:neutral", description: "应用中性区域建议" })
    setNeutral(null)
    setNeutralForSignature(null)
    } catch (e) { if (currentIdentity.current === requestedIdentity) setError(message(e)) } finally { end() }
  }
  const selectReference = async (kind: "base" | "light") => {
    if (config?.negative == null || stableRecipe === null) return
    try {
      const files = await window.desktop?.selectImageFiles()
      if (currentIdentity.current !== identity) return
      const path = files?.[0]
      if (path === undefined) return
      const result = await analyzeImage({ recipe: { ...stableRecipe, imagePath: path }, stage: "raw-linear" })
      if (currentIdentity.current !== identity) return
      const fingerprint = /^sha256:([0-9a-f]{64});/.exec(result.sourceVersion)?.[1]
      if (fingerprint === undefined) throw new Error("参考帧没有有效的内容指纹")
      if (analysis?.calibrationSpaceKey != null && result.calibrationSpaceKey !== analysis.calibrationSpaceKey)
        throw new Error("参考帧与当前照片的相机、白平衡或输入空间不同")
      onChange?.({ ...config, negative: { ...config.negative,
        calibrationSpaceKey: result.calibrationSpaceKey ?? null,
        ...(kind === "base" ? { filmBase: { kind: "reference-frame", stage: "linear-working", referenceImagePath: path,
          referenceFingerprint: fingerprint, roi: { x: 0, y: 0, width: 1, height: 1 } } }
          : { lightSource: { kind: "calibration", referenceImagePath: path, referenceFingerprint: fingerprint } }) } },
      { description: kind === "base" ? "选择同卷片基参考" : "选择翻拍光源参考" })
    } catch (e) { setError(message(e)) }
  }
  const save = () => {
    if (config?.negative == null || stableRecipe === null || analysis?.calibrationSpaceKey == null || !name.trim()) return
    // 保存引擎实际解析的片基/光源数值，避免把 ROI 坐标或可变参考路径盲套到其他照片。
    const saveConfig = async () => {
      const requestedIdentity = currentIdentity.current
      const resolved = await analyzeImage({ recipe: stableRecipe, stage: "current-positive" })
      if (currentIdentity.current !== requestedIdentity) return
      if (analysis?.sourceVersion !== resolved.sourceVersion) throw new Error("源文件已变化，请刷新后保存校准")
      if (resolved.resolvedFilmBase == null || resolved.resolvedLightGain == null)
        throw new Error("引擎没有返回已解析的片基和光源，无法保存校准")
      const negative = { ...config.negative!, calibrationSpaceKey: resolved.calibrationSpaceKey ?? null,
        filmBase: { kind: "manual" as const, stage: "linear-working" as const, rgb: resolved.resolvedFilmBase },
        lightSource: { kind: "calibration" as const, rgbGain: resolved.resolvedLightGain } }
      const entry: SavedCalibration = { id: client(), name: name.trim(), version: 1, inputMode: inputIdentity(config), negative }
      const next = [...saved, entry]
      const existing: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
      if (!Array.isArray(existing) || existing.length !== saved.length) throw new Error("已有校准库损坏，未覆盖原数据")
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setSaved(next); setChosen(entry.id); setName("")
    }
    void saveConfig().catch((e: unknown) => setError(message(e)))
  }
  const displayUrl = effectiveStage === "current-positive" && !picking && !neutralPicking && !actual ? state.engineDisplayUrl : url
  const histogram = analysis?.histogram
  const maximum = Math.max(1, ...(histogram?.red ?? []), ...(histogram?.green ?? []), ...(histogram?.blue ?? []))
  const overBudget = actual && Math.max(state.engineResponse?.sourceDecode?.fullWidth ?? 0, state.engineResponse?.sourceDecode?.fullHeight ?? 0) > 8192
  return <div className="filmWorkspacePreview" data-testid="film-engine-preview">
    {config?.inputSource === "flextight-fff" && <p role="status">FFF 实验输入域未标定；当前结果依赖人工选择的输入空间。</p>}
    <div className="filmPreviewTools" role="group" aria-label="底片对比阶段">
      {([ ["raw-linear", config?.filmPolarity === "positive" ? "原图" : "原始负片"],
        ["base-positive", config?.filmPolarity === "positive" ? "基础正片" : "基础转正"],
        ["current-positive", "当前结果"] ] as const).map(([value, label]) =>
        <button key={value} type="button" aria-pressed={stage === value && !picking && !neutralPicking} onClick={() => { setStage(value); setPicking(false); setNeutralPicking(false) }}>{label}</button>)}
      <button type="button" aria-pressed={picking} disabled={onChange === undefined || config?.negative == null} onClick={() => { setPicking(!picking); setNeutralPicking(false); setActual(false) }}>框选片基</button>
      <button type="button" aria-pressed={neutralPicking} disabled={onChange === undefined} onClick={() => { setNeutralPicking(!neutralPicking); setPicking(false); setActual(false) }}>中性取样</button>
      <button type="button" aria-pressed={actual} onClick={() => setActual(!actual)}>100% 像素</button>
      <button type="button" disabled={typeof window.desktop?.selectImageFiles !== "function"}
        onClick={() => void pickReference()}>选择参考图</button>
    </div>
    {picking && <p>正在显示完整有向负片。拖动框选未曝光片边；取样坐标不受裁切和校平影响。</p>}
    {neutralPicking && <p>正在显示基础正片。拖动框选中性区域；过暗、近剪裁样本会被过滤，建议不会自动应用。</p>}
    {neutral !== null && <div className="filmCalibrationTools" role="status">
      {neutral.available
        ? <><span>中性建议 RGB 平衡：{neutral.suggestedRgbBalanceEv?.map((value) => value.toFixed(3)).join(" / ")} EV · 样本 {neutral.sampleCount} · 置信 {neutral.confidence}</span>
          <button type="button" onClick={() => void applyNeutral()} disabled={busy || neutralForSignature !== signature}>应用建议</button></>
        : <span>{neutral.note ?? "中性样本不足，未生成建议"}</span>}
    </div>}
    {overBudget ? <p role="alert">完整像素超过检查预算，请切回适应窗口。</p> : <div className="filmImageScroll">
      <div className="filmImageBoard" onPointerDown={(event) => {
        if ((!picking && !neutralPicking) || displayUrl === null || loadedUrl !== displayUrl) return
        start.current = point(event); setRoi(null)
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }} onPointerMove={(event) => {
        const end = point(event); if (start.current === null || end === null) return
        setRoi({ x: Math.min(start.current.x, end.x), y: Math.min(start.current.y, end.y),
          width: Math.round(Math.abs(end.x - start.current.x) * 1e6) / 1e6, height: Math.round(Math.abs(end.y - start.current.y) * 1e6) / 1e6 })
      }} onPointerUp={finish} onPointerCancel={() => { start.current = null; setRoi(null) }}>
        {displayUrl !== null ? <img ref={image} src={displayUrl} alt="底片校色预览" draggable={false} onLoad={(event) => setLoadedUrl(event.currentTarget.getAttribute("src"))}
          style={actual ? { maxWidth: "none", maxHeight: "none" } : { maxWidth: "100%", maxHeight: "52vh" }} />
          : <p role={state.engineSyncStatus === "error" ? "alert" : "status"}>{state.engineSyncStatus === "error" ? state.engineResponse?.message ?? "底片预览不可用" : "正在等待引擎校色结果"}</p>}
        {(picking || neutralPicking) && roi !== null && <span className="filmRoi" style={{ left: `${roi.x * 100}%`, top: `${roi.y * 100}%`, width: `${roi.width * 100}%`, height: `${roi.height * 100}%` }} />}
      </div>
    </div>}
    <p role="status">{busy || state.engineSyncStatus === "syncing" ? "引擎同步中" : "引擎结果"}{actual ? " · 100%（一个图像像素对应一个 CSS 像素）" : ""}</p>
    {reference !== null && <figure className="filmReferenceCompare">
      <img src={reference.url} alt="参考图对照" draggable={false} />
      <figcaption>参考图（仅人工对照，不进入片基/光源/配方）· {reference.path}</figcaption>
    </figure>}
    {error !== null && <p role="alert">{error}</p>}
    {histogram !== undefined && <figure className="filmHistogram"><figcaption>线性工作空间直方图 · {analysis?.sampling}</figcaption>
      <svg viewBox="0 0 256 80" role="img" aria-label="RGB 直方图">{(["red", "green", "blue"] as const).map((channel) =>
        <polyline key={channel} fill="none" stroke={channel} strokeWidth="1" points={histogram[channel].map((n, i) => `${i},${78 - n / maximum * 76}`).join(" ")} />)}</svg>
      <p>均值 RGB：{analysis?.stats.mean.map((v) => v.toFixed(4)).join(" / ")} · 范围外样本：{histogram.underflow + histogram.overflow}</p>
      <p>目标输出空间边界样本：{analysis?.clipping.stages["output"]?.available === true ? [...analysis.clipping.stages["output"].clippedLow, ...analysis.clipping.stages["output"].clippedHigh].reduce((sum, value) => sum + value, 0) : "未指定"}</p>
      <p>{analysis?.clipping.stages["sensor"]?.available === true ? "传感器剪裁统计可用" : "传感器原始剪裁统计不可用"}</p>
    </figure>}
    {onChange !== undefined && config !== null && <FilmColorPresets config={config} onChange={onChange} />}
    {onChange !== undefined && config !== null && config.negative != null && <div className="filmCalibrationTools">
      <button type="button" disabled={typeof window.desktop?.selectImageFiles !== "function"} onClick={() => { void selectReference("base") }}>选择同卷片基参考帧</button>
      <button type="button" disabled={typeof window.desktop?.selectImageFiles !== "function"} onClick={() => { void selectReference("light") }}>选择光源参考帧</button>
      <label>校准名称<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <button type="button" disabled={!name.trim() || analysis === null} onClick={save}>保存校准</button>
      <label>已保存校准<select value={chosen} onChange={(e) => setChosen(e.target.value)}><option value="">选择校准</option>{saved.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
      <button type="button" disabled={!chosen} onClick={() => {
        const entry = saved.find((item) => item.id === chosen)
        if (entry === undefined || entry.inputMode !== inputIdentity(config) || entry.negative?.calibrationSpaceKey !== analysis?.calibrationSpaceKey) { setError("校准输入模式、相机或白平衡不同，无法应用"); return }
        const copy = JSON.parse(JSON.stringify(entry.negative)) as NonNullable<ImageProcessingConfig["negative"]>
        if (migrateImageProcessing({ ...config, negative: copy }).error !== null) { setError("保存的校准参数不合法，未应用"); return }
        onChange({ ...config, negative: { ...copy, density: config.negative?.density ?? null,
          lightSource: copy.lightSource == null ? null : { ...copy.lightSource, calibrationId: entry.id, calibrationVersion: entry.version },
          filmBase: copy.filmBase == null ? null : { ...copy.filmBase, calibrationId: entry.id, calibrationVersion: entry.version } } }, { description: "应用已保存校准" })
      }}>应用校准</button>
    </div>}
  </div>
}
