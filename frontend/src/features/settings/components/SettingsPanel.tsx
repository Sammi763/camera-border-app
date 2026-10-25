import { useCallback, useEffect, useState } from "react"
import { NumberInput } from "../../../components/form/NumberInput"
import { fetchFilmFormats } from "../../../services/engine/filmFormatsApi"
import { fetchPhotoMetadata } from "../../../services/engine/photoMetadataApi"
import { useSystemFonts } from "../hooks/useSettings"
import type { ImageAreaSettings, NumberSettingKey, OutputSizePreset, RenderSettings, SettingsController, TextLayerSettings } from "../types"
import { VariableHelpPanel } from "../../metadata/components/VariableHelpPanel"
import { TextLayerEditor } from "./TextLayerEditor"
import { createDefaultTextLayers } from "../utils/defaultTextLayers"
import { applyFilmFormatSettings } from "../utils/applyFilmFormat"
import {
  IMAGE_AREA_ORIENTATION_OPTIONS,
  IMAGE_AREA_RATIO_OPTIONS,
  imagePlacementFromArea,
  normalizeImageAreaSettings,
  summarizeImageArea
} from "../utils/imageArea"
import { normalizeTextPlacement, textPlacementOptions } from "../utils/textPlacementOptions"
import { CUSTOM_LONG_EDGE_MAX, CUSTOM_LONG_EDGE_MIN, OUTPUT_SIZE_PRESETS } from "../utils/outputSizePresets"
import type { CapabilitiesResponse, FidelityTier, FilmFormatInfo } from "../../../types/preview"
import { OutputPresetPanel } from "../../output/components/OutputPresetPanel"

type SettingsPanelProps = {
  readonly controller: SettingsController
  /** 当前是否有选中的图片。无选图时显示提示。 */
  readonly hasSelectedImage: boolean
  /** 当前选中的图片路径（用于 EXIF 查询）。 */
  readonly selectedFilePath: string | null
  /** 每张图独立文字覆盖（快捷单段，覆盖 textLayers[0]）。 */
  readonly textOverride: string | null
  /** 设置当前图片的文字覆盖。 */
  readonly setTextOverride: (text: string | null) => void
  /** 当前图片识别到的品牌文字（如 "NIKON"），null 表示未识别。 */
  readonly detectedBrandLabel?: string | null
  /** 是否渲染样式控制组；输出页签复用本组件时关闭。 */
  readonly showStyleSettings?: boolean
  /** 是否渲染输出控制组；样式页签复用本组件时关闭。 */
  readonly showOutputSettings?: boolean
  /** 当前进程能力快照；缺失或探测失败时不渲染专业输出控件。 */
  readonly capabilities?: CapabilitiesResponse | null
}

/** 内置画幅选项（后端不可用时的回退；含 6x10 与 6x12）。 */
const FALLBACK_FORMATS: readonly FilmFormatInfo[] = [
  { id: "half-frame", label: "半格", targetAspectRatio: 3 / 4, recommendedBorder: { top: 40, bottom: 40, left: 20, right: 20, color: "#ffffff" } },
  { id: "135", label: "135", targetAspectRatio: 3 / 2, recommendedBorder: { top: 30, bottom: 30, left: 30, right: 30, color: "#ffffff" } },
  { id: "645", label: "645", targetAspectRatio: 4 / 3, recommendedBorder: { top: 30, bottom: 50, left: 30, right: 30, color: "#ffffff" } },
  { id: "6x6", label: "6x6", targetAspectRatio: 1, recommendedBorder: { top: 40, bottom: 40, left: 40, right: 40, color: "#ffffff" } },
  { id: "6x7", label: "6x7", targetAspectRatio: 5 / 4, recommendedBorder: { top: 30, bottom: 50, left: 35, right: 35, color: "#ffffff" } },
  { id: "6x8", label: "6x8", targetAspectRatio: 10 / 7, recommendedBorder: { top: 30, bottom: 50, left: 35, right: 35, color: "#ffffff" } },
  { id: "6x9", label: "6x9", targetAspectRatio: 45 / 28, recommendedBorder: { top: 30, bottom: 50, left: 40, right: 40, color: "#ffffff" } },
  { id: "6x10", label: "6x10", targetAspectRatio: 25 / 14, recommendedBorder: { top: 30, bottom: 50, left: 45, right: 45, color: "#ffffff" } },
  { id: "6x12", label: "6x12", targetAspectRatio: 15 / 7, recommendedBorder: { top: 30, bottom: 50, left: 50, right: 50, color: "#ffffff" } }
]

/** 每种边框风格实际消费的参数；界面不展示不会影响渲染的“摆设控件”。 */
const BORDER_STYLE_PARAMETERS: Readonly<Record<string, {
  readonly edgeWidth: boolean
  readonly holeCount: boolean
  readonly paperTone: boolean
}>> = {
  "exhibition-line": { edgeWidth: true, holeCount: false, paperTone: true },
  "polaroid-shadow": { edgeWidth: true, holeCount: false, paperTone: false },
  "film-perforation": { edgeWidth: false, holeCount: true, paperTone: true },
  "mat-double-line": { edgeWidth: true, holeCount: false, paperTone: true },
  "torn-edge": { edgeWidth: true, holeCount: false, paperTone: true },
  "negative-band": { edgeWidth: false, holeCount: true, paperTone: true },
  "magazine-keyline": { edgeWidth: true, holeCount: false, paperTone: true },
  "archive-label-box": { edgeWidth: true, holeCount: false, paperTone: true }
}

/** 固定档位允许的格式变体；能力探测仍是最终可用性的前置条件。 */
const OUTPUT_FORMATS_BY_TIER: Readonly<Record<FidelityTier, readonly RenderSettings["exportFormat"][]>> = {
  "quick-share": ["jpeg", "png"],
  "standard-delivery": ["jpeg", "png"],
  "high-fidelity-archive": ["tiff", "png"],
  custom: ["jpeg", "png", "tiff"]
}

/**
 * 将 EXIF 元数据格式化为可读文本。
 */
const formatMetadataText = (meta: {
  readonly cameraModel?: string
  readonly lensModel?: string
  readonly aperture?: string
  readonly shutterSpeed?: string
  readonly iso?: string
  readonly focalLength?: string
  readonly filmName?: string
}): string => {
  const parts: string[] = []
  if (meta.cameraModel) parts.push(meta.cameraModel)
  if (meta.lensModel) parts.push(meta.lensModel)
  if (meta.aperture) parts.push(meta.aperture)
  if (meta.shutterSpeed) parts.push(meta.shutterSpeed)
  if (meta.iso) parts.push(meta.iso)
  if (meta.focalLength) parts.push(meta.focalLength)
  if (meta.filmName) parts.push(meta.filmName)
  return parts.join(" · ")
}

export const SettingsPanel = ({
  controller,
  hasSelectedImage,
  selectedFilePath,
  textOverride,
  setTextOverride,
  detectedBrandLabel,
  showStyleSettings = true,
  showOutputSettings = true,
  capabilities = null
}: SettingsPanelProps): JSX.Element => {
  const { settings, update, updateNumber, updateTextLayer, resetTextLayers, replaceTextLayers, canUndo, canRedo, undo, redo } = controller
  const { fonts } = useSystemFonts()
  const availableFonts = fonts.filter((font) => font.engineAvailable)
  const [filmFormats, setFilmFormats] = useState<readonly FilmFormatInfo[]>(FALLBACK_FORMATS)
  const [exifStatus, setExifStatus] = useState<"idle" | "loading" | "error" | "empty">("idle")
  const imageArea = normalizeImageAreaSettings(settings.imageArea, settings.imagePlacement)
  const imagePlacement = imagePlacementFromArea(imageArea, settings.imagePlacement)
  const imageAreaSummary = summarizeImageArea(settings)
  const hasCustomLogo = (settings.logo.imagePath?.trim().length ?? 0) > 0
  const borderStyleParameters = settings.borderStyle === null
    ? null
    : BORDER_STYLE_PARAMETERS[settings.borderStyle.id] ?? { edgeWidth: true, holeCount: true, paperTone: true }

  const effectiveTier: FidelityTier = settings.tier ?? "standard-delivery"
  const availableTiers = (Object.keys(capabilities?.tiers ?? {}) as FidelityTier[])
    .filter((tier) => tier !== "custom" && capabilities?.tiers[tier]?.available === true)
  const availableFormats = (["jpeg", "png", "tiff"] as const)
    .filter((format) => capabilities?.output[format]?.available === true
      && OUTPUT_FORMATS_BY_TIER[effectiveTier].includes(format))
  const updateCustomOutput = useCallback((patch: Partial<RenderSettings>): void => {
    update({ ...patch, tier: "custom" })
  }, [update])
  const applyTier = useCallback((tier: FidelityTier): void => {
    if (tier === "quick-share") {
      update({ tier, exportFormat: "jpeg", jpegQuality: 92, outputSizePreset: "2k", customOutputLongEdge: 2048,
        preserveMetadata: true, preserveColorProfile: true, preferHighBitDepth: false,
        colorProfilePolicy: "srgb", metadataPolicy: "remove-location", bitDepthPolicy: "8" })
    } else if (tier === "standard-delivery") {
      update({ tier, exportFormat: "jpeg", jpegQuality: 95, outputSizePreset: "original",
        preserveMetadata: true, preserveColorProfile: true, preferHighBitDepth: false,
        colorProfilePolicy: "source", metadataPolicy: "preserve", bitDepthPolicy: "8" })
    } else if (tier === "high-fidelity-archive") {
      update({ tier, exportFormat: "tiff", jpegQuality: 95, outputSizePreset: "original",
        preserveMetadata: true, preserveColorProfile: true, preferHighBitDepth: true,
        colorProfilePolicy: "source", metadataPolicy: "preserve", bitDepthPolicy: "source" })
    } else {
      update({ tier: "custom" })
    }
  }, [update])

  // 加载画幅格式列表
  useEffect(() => {
    let active = true
    void fetchFilmFormats()
      .then((formats) => {
        if (active && formats.length > 0) {
          setFilmFormats(formats)
        }
      })
      .catch(() => {
        // 后端不可用时使用内置回退
      })
    return () => { active = false }
  }, [])

  /** 各数字设置项的合法范围（提交时钳制，避免越界值泄漏到状态/引擎）。 */
  const NUMBER_RANGES: Record<NumberSettingKey, { readonly min: number; readonly max: number }> = {
    borderTop: { min: 0, max: 500 },
    borderBottom: { min: 0, max: 500 },
    borderLeft: { min: 0, max: 500 },
    borderRight: { min: 0, max: 500 },
    textFontSize: { min: 0, max: 500 },
    jpegQuality: { min: 1, max: 100 },
    customOutputLongEdge: { min: CUSTOM_LONG_EDGE_MIN, max: CUSTOM_LONG_EDGE_MAX }
  }

  const handleNumberCommit = useCallback(
    (key: NumberSettingKey) => (value: number) => {
      const range = NUMBER_RANGES[key] ?? { min: 0, max: 500 }
      updateNumber(key, value, range.min, range.max)
    },
    [updateNumber]
  )

  const handleFilmFormatChange = useCallback((formatId: string): void => {
    const format = filmFormats.find((f) => f.id === formatId)
    const patch = applyFilmFormatSettings(settings, formatId, format)
    update(patch)
  }, [filmFormats, settings, update])

  const updateImageArea = useCallback((patch: Partial<ImageAreaSettings>): void => {
    const nextArea = normalizeImageAreaSettings({ ...imageArea, ...patch }, imagePlacement)
    update({
      imageArea: nextArea,
      imagePlacement: imagePlacementFromArea(nextArea, imagePlacement)
    })
  }, [imageArea, imagePlacement, update])

  const handleImageAreaOrientationChange = useCallback((orientation: ImageAreaSettings["orientation"]): void => {
    updateImageArea(orientation === "square"
      ? { orientation, ratio: "1:1", targetAspectRatioOverride: null }
      : { orientation })
  }, [updateImageArea])

  const handleImageAreaRatioChange = useCallback((ratio: ImageAreaSettings["ratio"]): void => {
    updateImageArea({ ratio, targetAspectRatioOverride: null })
  }, [updateImageArea])

  const handleLogoFileSelect = useCallback(async (): Promise<void> => {
    const selectLogoFile = window.desktop?.selectLogoFile
    if (selectLogoFile === undefined) return
    const imagePath = await selectLogoFile()
    if (imagePath !== null) {
      update({ logo: { ...settings.logo, imagePath } })
    }
  }, [settings.logo, update])

  const handleExifFill = useCallback(async () => {
    if (selectedFilePath === null) {
      return
    }
    setExifStatus("loading")
    try {
      const meta = await fetchPhotoMetadata(selectedFilePath)
      const text = formatMetadataText(meta)
      if (text.length > 0) {
        setTextOverride(text)
        setExifStatus("idle")
      } else {
        setExifStatus("empty")
      }
    } catch {
      setExifStatus("error")
    }
  }, [selectedFilePath, setTextOverride])

  // 快捷文字：编辑 textLayers[0]。
  // textOverride 非空时表示当前图片有独立文字覆盖（仅覆盖第 0 层 content）。
  const firstLayer = settings.textLayers[0] ?? null
  const isTextOverridden = textOverride !== null
  const textLayerValue = textOverride ?? firstLayer?.content ?? ""
  const selectedFont = firstLayer !== null && availableFonts.some((font) => font.value === firstLayer.fontFamily)
    ? firstLayer.fontFamily
    : "sans-serif"

  /** 更新文字图层内容：同步到 textLayers[0].content 或 textOverride。 */
  const handleTextLayerChange = useCallback((value: string): void => {
    if (isTextOverridden) {
      setTextOverride(value.length > 0 ? value : null)
    } else if (firstLayer !== null) {
      updateTextLayer(firstLayer.id, { content: value })
    }
  }, [isTextOverridden, firstLayer, setTextOverride, updateTextLayer])

  /** 变量插入回调：与 handleTextLayerChange 一致。 */
  const handleTextLayerVariableInsert = useCallback((text: string): void => {
    handleTextLayerChange(text)
  }, [handleTextLayerChange])

  /** 更新文字图层字号：同步到 textLayers[0]。 */
  const handleTextLayerFontSizeCommit = useCallback((value: number): void => {
    if (firstLayer !== null) {
      updateTextLayer(firstLayer.id, { fontSize: value })
    }
  }, [firstLayer, updateTextLayer])

  /** 更新文字图层颜色：同步到 textLayers[0]。 */
  const handleTextLayerColorChange = useCallback((value: string): void => {
    if (firstLayer !== null) {
      updateTextLayer(firstLayer.id, { color: value })
    }
  }, [firstLayer, updateTextLayer])

  /** 更新文字图层字体：同步到 textLayers[0]。 */
  const handleTextLayerFontFamilyChange = useCallback((value: string): void => {
    if (firstLayer !== null) {
      updateTextLayer(firstLayer.id, { fontFamily: value })
    }
  }, [firstLayer, updateTextLayer])

  /** 更新文字图层位置：同步到 textLayers[0]。 */
  const handleTextLayerPlacementChange = useCallback((value: string): void => {
    if (firstLayer !== null) {
      updateTextLayer(firstLayer.id, { placement: value })
    }
  }, [firstLayer, updateTextLayer])

  /** 更新文字图层放置区域：同步到 textLayers[0]。 */
  const handleTextLayerTextAreaChange = useCallback((value: "image" | "border"): void => {
    if (firstLayer !== null) {
      updateTextLayer(firstLayer.id, {
        textArea: value,
        placement: normalizeTextPlacement(value, firstLayer.placement)
      })
    }
  }, [firstLayer, updateTextLayer])

  return (
    <div className="settingsPanelInner">
      {showStyleSettings && (
        <>
          <div className="presetActions" aria-label="渲染设置历史">
            <button type="button" className="ghostButton" disabled={!canUndo} onClick={undo}>撤销设置</button>
            <button type="button" className="ghostButton" disabled={!canRedo} onClick={redo}>重做设置</button>
          </div>
          {!hasSelectedImage && (
            <p className="settingsCapabilityHint">
              请先加载并选择一张图片，设置将自动生效。
            </p>
          )}

      {/* 画幅 */}
      <fieldset className="settingGroup">
        <legend className="settingLabel">画幅</legend>
        <div className="settingRow">
          <label className="settingFieldLabel">
            画幅格式
            <select
              className="settingSelect"
              value={settings.layoutPresetId ?? ""}
              onChange={(e) => handleFilmFormatChange(e.target.value)}
            >
              <option value="">不使用画幅</option>
              {filmFormats.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
          {settings.layoutPresetId !== null && settings.layoutPresetId !== undefined && (
            <p className="settingsCapabilityHint">
              切换画幅时已自动填充推荐边框值。可手动调整。
            </p>
          )}
        </div>
      </fieldset>

      {/* 图片区域：前端产品设置统一解析为 RenderRecipe.imagePlacement。 */}
      <fieldset className="settingGroup">
        <legend className="settingLabel">图片区域</legend>
        <div className="settingRow formInlineRow">
          <label className="settingFieldLabel">
            方向
            <select
              className="settingSelect"
              aria-label="图片区域方向"
              value={imageArea.orientation}
              onChange={(e) => handleImageAreaOrientationChange(e.target.value as ImageAreaSettings["orientation"])}
            >
              {IMAGE_AREA_ORIENTATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="settingFieldLabel">
            比例
            <select
              className="settingSelect"
              aria-label="图片区域比例"
              value={imageArea.ratio}
              onChange={(e) => handleImageAreaRatioChange(e.target.value as ImageAreaSettings["ratio"])}
            >
              {IMAGE_AREA_RATIO_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="settingRow formInlineRow">
          <label className="settingFieldLabel">
            显示模式
            <select
              className="settingSelect"
              aria-label="图片区域显示模式"
              value={imageArea.displayMode}
              onChange={(e) => updateImageArea({ displayMode: e.target.value as ImageAreaSettings["displayMode"] })}
            >
              <option value="fit">完整显示</option>
              <option value="fill">填满裁切</option>
            </select>
          </label>
          <label className="settingFieldLabel">
            旋转（°）
            <input
              type="number"
              className="settingNumberInput"
              min={-360}
              max={360}
              step={1}
              value={imageArea.rotation}
              onChange={(e) => updateImageArea({ rotation: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="settingRow formInlineRow">
          <label className="settingFieldLabel">
            焦点 X
            <input
              type="number"
              className="settingNumberInput"
              min={0}
              max={1}
              step={0.01}
              value={imageArea.focalX}
              disabled={imageArea.displayMode !== "fill"}
              onChange={(e) => updateImageArea({ focalX: Number(e.target.value) })}
            />
          </label>
          <label className="settingFieldLabel">
            焦点 Y
            <input
              type="number"
              className="settingNumberInput"
              min={0}
              max={1}
              step={0.01}
              value={imageArea.focalY}
              disabled={imageArea.displayMode !== "fill"}
              onChange={(e) => updateImageArea({ focalY: Number(e.target.value) })}
            />
          </label>
        </div>
        <p className="settingsCapabilityHint">
          当前区域：{imageAreaSummary.label} · {imageAreaSummary.displayModeLabel}。原图比例下方向跟随源图；预览与导出使用同一套几何规则。
        </p>
      </fieldset>

      {/* 边框风格：八种风格共用同一组明确参数。 */}
      <fieldset className="settingGroup">
        <legend className="settingLabel">边框风格</legend>
        <div className="settingRow">
          <label className="settingFieldLabel">
            风格
            <select
              className="settingSelect"
              value={settings.borderStyle?.id ?? ""}
              onChange={(e) => update({
                borderStyle: e.target.value === "" ? null : {
                  id: e.target.value,
                  intensity: settings.borderStyle?.intensity ?? 70,
                  edgeWidth: settings.borderStyle?.edgeWidth ?? 8,
                  holeCount: settings.borderStyle?.holeCount ?? 16,
                  paperTone: settings.borderStyle?.paperTone ?? "#333333"
                }
              })}
            >
              <option value="">无装饰</option>
              <option value="exhibition-line">展览线框</option>
              <option value="polaroid-shadow">宝丽来阴影</option>
              <option value="film-perforation">135 齿孔</option>
              <option value="mat-double-line">卡纸双线</option>
              <option value="torn-edge">撕边纸张</option>
              <option value="negative-band">负片边</option>
              <option value="magazine-keyline">杂志键线</option>
              <option value="archive-label-box">档案标签</option>
            </select>
          </label>
        </div>
        {settings.borderStyle !== null && (
          <>
            <div className="settingRow formInlineRow">
              <label className="settingFieldLabel">
                强度
                <NumberInput
                  className="settingNumberInput"
                  value={settings.borderStyle.intensity}
                  min={0}
                  max={100}
                  onCommit={(value) => update({ borderStyle: { ...settings.borderStyle!, intensity: value } })}
                />
              </label>
              {borderStyleParameters?.edgeWidth === true && (
                <label className="settingFieldLabel">
                  特征宽度
                  <NumberInput
                    className="settingNumberInput"
                    value={settings.borderStyle.edgeWidth}
                    min={0}
                    max={100}
                    onCommit={(value) => update({ borderStyle: { ...settings.borderStyle!, edgeWidth: value } })}
                  />
                </label>
              )}
              {borderStyleParameters?.holeCount === true && (
                <label className="settingFieldLabel">
                  齿孔/刻痕数
                  <NumberInput
                    className="settingNumberInput"
                    value={settings.borderStyle.holeCount}
                    min={2}
                    max={100}
                    onCommit={(value) => update({ borderStyle: { ...settings.borderStyle!, holeCount: value } })}
                  />
                </label>
              )}
            </div>
            {borderStyleParameters?.paperTone === true && <div className="settingRow">
              <label className="settingFieldLabel">
                装饰色
                <input
                  type="color"
                  className="settingColorInput"
                  value={settings.borderStyle.paperTone || "#333333"}
                  onChange={(e) => update({ borderStyle: { ...settings.borderStyle!, paperTone: e.target.value } })}
                />
              </label>
            </div>}
          </>
        )}
      </fieldset>

      {/* 边框 */}
      <fieldset className="settingGroup">
        <legend className="settingLabel">边框</legend>

        <div className="settingRow">
          <label className="settingFieldLabel">
            边框颜色
            <input
              type="color"
              className="settingColorInput"
              value={settings.borderColor}
              onChange={(e) => update({ borderColor: e.target.value })}
            />
          </label>
        </div>

        <div className="settingRow">
          <label className="settingFieldLabel">
            上边框 (px)
            <NumberInput
              className="settingNumberInput"
              value={settings.borderTop}
              min={0}
              max={500}
              onCommit={handleNumberCommit("borderTop")}
            />
          </label>
        </div>

        <div className="settingRow">
          <label className="settingFieldLabel">
            下边框 (px)
            <NumberInput
              className="settingNumberInput"
              value={settings.borderBottom}
              min={0}
              max={500}
              onCommit={handleNumberCommit("borderBottom")}
            />
          </label>
        </div>

        <div className="settingRow">
          <label className="settingFieldLabel">
            左边框 (px)
            <NumberInput
              className="settingNumberInput"
              value={settings.borderLeft}
              min={0}
              max={500}
              onCommit={handleNumberCommit("borderLeft")}
            />
          </label>
        </div>

        <div className="settingRow">
          <label className="settingFieldLabel">
            右边框 (px)
            <NumberInput
              className="settingNumberInput"
              value={settings.borderRight}
              min={0}
              max={500}
              onCommit={handleNumberCommit("borderRight")}
            />
          </label>
        </div>
      </fieldset>

      {/* 渐变边框 */}
      <fieldset className="settingGroup">
        <legend className="settingLabel">渐变边框</legend>

        <label className="settingCheckboxLabel">
          <input
            type="checkbox"
            checked={settings.gradient.enabled}
            onChange={(e) => update({
              gradient: { ...settings.gradient, enabled: e.target.checked }
            })}
          />
          <span>启用渐变</span>
        </label>

        {settings.gradient.enabled && (
          <>
            <div className="settingRow">
              <label className="settingFieldLabel">
                渐变类型
                <select
                  className="settingSelect"
                  value={settings.gradient.type}
                  onChange={(e) => update({
                    gradient: { ...settings.gradient, type: e.target.value as "linear" | "radial" }
                  })}
                >
                  <option value="linear">线性</option>
                  <option value="radial">径向</option>
                </select>
              </label>
            </div>

            {settings.gradient.type === "linear" && (
              <div className="settingRow">
                <label className="settingFieldLabel">
                  角度（°）
                  <NumberInput
                    className="settingNumberInput"
                    value={settings.gradient.angle}
                    min={0}
                    max={360}
                    onCommit={(value) => update({
                      gradient: { ...settings.gradient, angle: value }
                    })}
                  />
                </label>
              </div>
            )}

            {settings.gradient.stops.map((stop, index) => (
              <div key={index} className="settingRow gradientStopRow">
                <label className="settingFieldLabel">
                  停靠点 {index + 1}
                  <div className="gradientStopControls">
                    <input
                      type="color"
                      className="settingColorInput"
                      value={stop.color}
                      onChange={(e) => {
                        const newStops = [...settings.gradient.stops]
                        newStops[index] = { ...stop, color: e.target.value }
                        update({ gradient: { ...settings.gradient, stops: newStops } })
                      }}
                    />
                    <NumberInput
                      className="settingNumberInput"
                      value={Math.round(stop.offset * 100)}
                      min={0}
                      max={100}
                      onCommit={(value) => {
                        const newStops = [...settings.gradient.stops]
                        newStops[index] = { ...stop, offset: value / 100 }
                        update({ gradient: { ...settings.gradient, stops: newStops } })
                      }}
                    />
                    <span className="settingsCapabilityHint">%</span>
                  </div>
                </label>
              </div>
            ))}

            <div className="settingRow formInlineRow">
              <button
                type="button"
                className="ghostButton"
                onClick={() => {
                  const newStops = [...settings.gradient.stops, { offset: 1, color: "#ffffff" }]
                  update({ gradient: { ...settings.gradient, stops: newStops } })
                }}
              >
                添加停靠点
              </button>
              {settings.gradient.stops.length > 2 && (
                <button
                  type="button"
                  className="ghostButton"
                  onClick={() => {
                    const newStops = settings.gradient.stops.slice(0, -1)
                    update({ gradient: { ...settings.gradient, stops: newStops } })
                  }}
                >
                  移除最后
                </button>
              )}
            </div>
          </>
        )}
      </fieldset>

      {/* 快捷文字（同步到文字图层 1） */}
      <fieldset className="settingGroup">
        <legend className="settingLabel">快捷文字</legend>
        {firstLayer === null ? (
          <div className="textLayerEmpty">
            <p className="settingsCapabilityHint">
              当前没有文字图层，快捷文字不可用。请先恢复文字图层。
            </p>
            <button
              type="button"
              className="ghostButton"
              onClick={() => replaceTextLayers(createDefaultTextLayers())}
            >
              恢复默认 3 段
            </button>
          </div>
        ) : (
          <>
            <p className="settingsCapabilityHint">
              快捷编辑同步到文字图层 1。如需多段文字、背景条、阴影、描边，请在下方"文字图层"中设置。
            </p>

            <div className="settingRow">
              <label className="settingFieldLabel">
                文字放置区域
                <select
                  className="settingSelect"
                  value={firstLayer.textArea}
                  onChange={(e) => handleTextLayerTextAreaChange(e.target.value as "image" | "border")}
                >
                  <option value="image">图片上</option>
                  <option value="border">边框上</option>
                </select>
              </label>
            </div>

            <div className="settingRow">
              <label className="settingFieldLabel">
                文字位置
                <select
                  className="settingSelect"
                  value={normalizeTextPlacement(firstLayer.textArea, firstLayer.placement)}
                  onChange={(e) => handleTextLayerPlacementChange(e.target.value)}
                >
                  {textPlacementOptions(firstLayer.textArea).map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="settingRow">
              <label className="settingFieldLabel">
                {isTextOverridden ? "当前图片文字（已覆盖）" : "文字内容"}
                <input
                  type="text"
                  className="settingTextInput"
                  placeholder="留空则不绘制该图层"
                  value={textLayerValue}
                  onChange={(e) => handleTextLayerChange(e.target.value)}
                />
              </label>
              {isTextOverridden && (
                <button
                  type="button"
                  className="ghostButton settingRestoreButton"
                  onClick={() => setTextOverride(null)}
                >
                  恢复使用全局文字
                </button>
              )}
            </div>

            <div className="settingRow">
              <label className="settingFieldLabel">
                字号
                <NumberInput
                  className="settingNumberInput"
                  value={firstLayer.fontSize}
                  min={8}
                  max={200}
                  onCommit={handleTextLayerFontSizeCommit}
                />
              </label>
            </div>

            <div className="settingRow">
              <label className="settingFieldLabel">
                文字颜色
                <input
                  type="color"
                  className="settingColorInput"
                  value={firstLayer.color}
                  onChange={(e) => handleTextLayerColorChange(e.target.value)}
                />
              </label>
            </div>

            <div className="settingRow">
              <label className="settingFieldLabel">
                字体
                <select
                  className="settingSelect"
                  value={selectedFont}
                  onChange={(e) => handleTextLayerFontFamilyChange(e.target.value)}
                >
                  <optgroup label="内置字体">
                    {availableFonts.filter((f) => f.source === "builtin").map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                  {availableFonts.some((f) => f.source === "system") && (
                    <optgroup label="已验证系统字体">
                      {availableFonts.filter((f) => f.source === "system").map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {!availableFonts.some((f) => f.value === firstLayer.fontFamily) && (
                  <span className="settingHint">
                    当前保存的字体不在已验证清单中，本次导出将使用 SansSerif。
                  </span>
                )}
              </label>
            </div>

            <div className="settingRow">
              <button
                type="button"
                className="ghostButton"
                disabled={selectedFilePath === null || exifStatus === "loading"}
                onClick={() => void handleExifFill()}
              >
                {exifStatus === "loading" ? "读取 EXIF 中…" : "从 EXIF 填充"}
              </button>
              {exifStatus === "empty" && (
                <p className="settingsCapabilityHint">该图片未包含可读取的 EXIF 信息。</p>
              )}
              {exifStatus === "error" && (
                <p className="settingsCapabilityHint fieldHintError">
                  EXIF 读取失败，请确认引擎正在运行。
                </p>
              )}
            </div>

            {/* 变量插入 */}
            <VariableHelpPanel
              currentText={textLayerValue}
              onTextChange={handleTextLayerVariableInsert}
            />
          </>
        )}
      </fieldset>

      {/* 文字图层（多段） */}
      <fieldset className="settingGroup">
        <legend className="settingLabel">文字图层</legend>
        <p className="settingsCapabilityHint">
          多段文字可独立设置内容、字号、颜色、位置和样式。变量在每段中独立解析。
        </p>
        <TextLayerEditor controller={controller} />
      </fieldset>

      {/* 品牌标识 */}
      <fieldset className="settingGroup">
        <legend className="settingLabel">品牌标识</legend>

        <label className="settingCheckboxLabel">
          <input
            type="checkbox"
            checked={settings.logo.enabled}
            onChange={(e) => update({ logo: { ...settings.logo, enabled: e.target.checked } })}
          />
          <span>显示品牌标识</span>
        </label>

        {settings.logo.enabled && (
          <>
            {!hasCustomLogo && (
              <>
                <div className="settingRow">
                  <label className="settingFieldLabel">
                    显示模式
                    <select
                      className="settingSelect"
                      value={settings.logo.mode}
                      onChange={(e) => update({
                        logo: { ...settings.logo, mode: e.target.value as "auto-brand" | "brand-text" }
                      })}
                    >
                      <option value="auto-brand">自动识别品牌</option>
                      <option value="brand-text">品牌文字</option>
                    </select>
                  </label>
                </div>

                {settings.logo.mode === "auto-brand" && (
                  <div className="settingRow">
                    <label className="settingFieldLabel">
                      当前识别到的品牌
                      <p className="settingsCapabilityHint">
                        {detectedBrandLabel ?? "未识别品牌，将回退为文字或不显示"}
                      </p>
                    </label>
                  </div>
                )}

                {settings.logo.mode === "brand-text" && (
                  <div className="settingRow">
                    <label className="settingFieldLabel">
                      品牌文字
                      <input
                        type="text"
                        className="settingTextInput"
                        placeholder="例如：Canon"
                        value={settings.logo.brand ?? ""}
                        onChange={(e) => update({
                          logo: { ...settings.logo, brand: e.target.value.length > 0 ? e.target.value : null }
                        })}
                      />
                    </label>
                  </div>
                )}
              </>
            )}

            <div className="settingRow">
              <label className="settingFieldLabel">
                PNG / 签名
                <div className="templateNameRow">
                  <span className="settingsCapabilityHint logoPathLabel" title={settings.logo.imagePath ?? undefined}>
                    {settings.logo.imagePath ?? "未选择，自定义图片关闭"}
                  </span>
                  <button
                    type="button"
                    className="ghostButton"
                    disabled={window.desktop?.selectLogoFile === undefined}
                    onClick={() => void handleLogoFileSelect()}
                  >
                    选择 PNG
                  </button>
                  {settings.logo.imagePath !== null && settings.logo.imagePath !== undefined && (
                    <button
                      type="button"
                      className="ghostButton"
                      onClick={() => update({ logo: { ...settings.logo, imagePath: null } })}
                    >
                      清除
                    </button>
                  )}
                </div>
                {hasCustomLogo && (
                  <p className="settingsCapabilityHint">
                    已使用自定义 PNG；清除后可切换文字标识模式。
                  </p>
                )}
              </label>
            </div>

            <div className="settingRow">
              <label className="settingFieldLabel">
                位置
                <select
                  className="settingSelect"
                  value={settings.logo.placement}
                  onChange={(e) => update({ logo: { ...settings.logo, placement: e.target.value } })}
                >
                  <option value="border-top-left">左上角</option>
                  <option value="border-top-center">顶部居中</option>
                  <option value="border-top-right">右上角</option>
                  <option value="border-bottom-left">左下角</option>
                  <option value="border-bottom-center">底部居中</option>
                  <option value="border-bottom-right">右下角</option>
                </select>
              </label>
            </div>

            <div className="settingRow">
              <label className="settingFieldLabel">
                大小
                <NumberInput
                  className="settingNumberInput"
                  value={settings.logo.size}
                  min={8}
                  max={100}
                  onCommit={(value) => update({ logo: { ...settings.logo, size: value } })}
                />
              </label>
            </div>

            <div className="settingRow">
              <label className="settingFieldLabel">
                透明度
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round((settings.logo.opacity ?? 1) * 100)}
                  onChange={(event) => update({
                    logo: { ...settings.logo, opacity: Number(event.target.value) / 100 }
                  })}
                />
                <span className="settingHint">{Math.round((settings.logo.opacity ?? 1) * 100)}%</span>
              </label>
            </div>

            {hasCustomLogo ? (
              <label className="settingCheckboxLabel">
                <input
                  type="checkbox"
                  checked={settings.logo.autoContrast ?? true}
                  onChange={(event) => update({ logo: { ...settings.logo, autoContrast: event.target.checked } })}
                />
                自动反差
              </label>
            ) : (
              <div className="settingRow">
                <label className="settingFieldLabel">
                  颜色模式
                  <select
                    className="settingSelect"
                    value={settings.logo.colorMode}
                    onChange={(e) => update({
                      logo: { ...settings.logo, colorMode: e.target.value as "auto-contrast" | "light" | "dark" }
                    })}
                  >
                    <option value="auto-contrast">自动对比色</option>
                    <option value="light">浅色（适合深色边框）</option>
                    <option value="dark">深色（适合浅色边框）</option>
                  </select>
                </label>
                {settings.logo.colorMode === "auto-contrast" && (
                  <p className="settingsCapabilityHint">
                    根据边框颜色自动选择品牌标识深浅，确保可见性。
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </fieldset>

        </>
      )}

      {showOutputSettings && (
        <>
          <fieldset className="settingGroup">
            <legend className="settingLabel">导出档位</legend>
            {availableTiers.length === 0 ? (
              <p className="settingsCapabilityHint">专业输出能力尚未探测到，当前不显示导出控件。</p>
            ) : (
              <>
                <p className="settingHint">档位由当前引擎能力决定；格式是固定档位的可选变体，修改尺寸或策略后才会变为自定义。</p>
                <div className="settingRow" role="group" aria-label="导出档位">
                  {availableTiers.map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      className={`ghostButton${effectiveTier === tier ? " active" : ""}`}
                      data-testid={`export-tier-${tier}`}
                      aria-pressed={effectiveTier === tier}
                      onClick={() => applyTier(tier)}
                    >
                      {tier === "quick-share" ? "快速分享" : tier === "standard-delivery" ? "标准交付" : "高保真归档"}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`ghostButton${effectiveTier === "custom" ? " active" : ""}`}
                    data-testid="export-tier-custom"
                    aria-pressed={effectiveTier === "custom"}
                    onClick={() => applyTier("custom")}
                  >自定义</button>
                </div>
                <p className="settingsCapabilityHint">
                  当前：{effectiveTier === "quick-share" ? "快速分享（JPEG 92、2048 长边、sRGB、移除位置）"
                    : effectiveTier === "standard-delivery" ? "标准交付（JPEG 95、原尺寸、源 ICC、保留元数据）"
                      : effectiveTier === "high-fidelity-archive" ? "高保真归档（TIFF、源位深、源 ICC、保留元数据）"
                        : "自定义（导出前会明确报告实际降级或不支持项）"}
                </p>
              </>
            )}
          </fieldset>

          {availableTiers.length > 0 && availableFormats.length > 0 && (
            <fieldset className="settingGroup">
              <legend className="settingLabel">输出格式</legend>
              <div className="settingRow">
                <label className="settingFieldLabel">
                  格式
                  <select
                    className="settingSelect"
                    aria-label="输出格式"
                    data-testid="export-format"
                    value={settings.exportFormat}
                    onChange={(e) => update({ exportFormat: e.target.value as "png" | "jpeg" | "tiff" })}
                  >
                    {availableFormats.map((format) => (
                      <option key={format} value={format}>{format === "jpeg" ? "JPEG" : format === "png" ? "PNG（无损）" : "TIFF"}</option>
                    ))}
                  </select>
                </label>
                <p className="settingsCapabilityHint">当前选择不会改变固定档位。</p>
              </div>
            </fieldset>
          )}

          {availableTiers.length > 0 && effectiveTier === "custom" && (
            <>
              <fieldset className="settingGroup">
                <legend className="settingLabel">自定义输出</legend>
                {settings.exportFormat === "jpeg" && (
                  <div className="settingRow">
                    <label className="settingFieldLabel">
                      JPEG 质量
                      <NumberInput
                        className="settingNumberInput"
                        value={settings.jpegQuality}
                        min={1}
                        max={100}
                        onCommit={(value) => updateCustomOutput({ jpegQuality: value })}
                      />
                    </label>
                  </div>
                )}
                <div className="settingRow">
                  <label className="settingFieldLabel">
                    尺寸预设
                    <select
                      className="settingSelect"
                      value={settings.outputSizePreset}
                      onChange={(e) => updateCustomOutput({ outputSizePreset: e.target.value as OutputSizePreset })}
                    >
                      {OUTPUT_SIZE_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {settings.outputSizePreset === "custom" && (
                  <div className="settingRow">
                    <label className="settingFieldLabel">
                      自定义长边（px）
                      <NumberInput
                        className="settingNumberInput"
                        value={settings.customOutputLongEdge}
                        min={CUSTOM_LONG_EDGE_MIN}
                        max={CUSTOM_LONG_EDGE_MAX}
                        onCommit={(value) => updateCustomOutput({ customOutputLongEdge: value })}
                      />
                    </label>
                  </div>
                )}
              </fieldset>

              <fieldset className="settingGroup">
                <legend className="settingLabel">自定义保真策略</legend>
                <div className="settingRow">
                  <label className="settingFieldLabel">色彩配置
                    <select className="settingSelect" value={settings.colorProfilePolicy ?? "source"}
                      onChange={(e) => updateCustomOutput({ colorProfilePolicy: e.target.value as "source" | "srgb" | "none" })}>
                      <option value="source">源 ICC（无 ICC 按 sRGB）</option>
                      <option value="srgb">转换并嵌入 sRGB</option>
                      <option value="none">不嵌入 ICC</option>
                    </select>
                  </label>
                </div>
                <div className="settingRow">
                  <label className="settingFieldLabel">元数据
                    <select className="settingSelect" value={settings.metadataPolicy ?? "preserve"}
                      onChange={(e) => updateCustomOutput({ metadataPolicy: e.target.value as "preserve" | "remove-location" | "strip" })}>
                      <option value="preserve">保留 EXIF/XMP/IPTC/GPS/DPI</option>
                      <option value="remove-location">保留元数据并移除位置</option>
                      <option value="strip">移除源元数据</option>
                    </select>
                  </label>
                </div>
                <div className="settingRow">
                  <label className="settingFieldLabel">位深
                    <select className="settingSelect" value={settings.bitDepthPolicy ?? "8"}
                      onChange={(e) => updateCustomOutput({ bitDepthPolicy: e.target.value as "source" | "8" })}>
                      <option value="8">8-bit</option>
                      <option value="source">源位深（仅真实 8/16-bit）</option>
                    </select>
                  </label>
                </div>
              </fieldset>
            </>
          )}
          {availableTiers.length > 0 && <OutputPresetPanel settings={settings} onApply={(patch) => update(patch)} />}
        </>
      )}
    </div>
  )
}
