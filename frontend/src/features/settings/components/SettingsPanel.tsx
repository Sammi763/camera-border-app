import { useCallback, useEffect, useState } from "react"
import { NumberInput } from "../../../components/form/NumberInput"
import { fetchFilmFormats } from "../../../services/engine/filmFormatsApi"
import { fetchPhotoMetadata } from "../../../services/engine/photoMetadataApi"
import { useSystemFonts } from "../hooks/useSettings"
import type { NumberSettingKey, OutputSizePreset, RenderSettings, SettingsController, TextLayerSettings } from "../types"
import { VariableHelpPanel } from "../../metadata/components/VariableHelpPanel"
import { TextLayerEditor } from "./TextLayerEditor"
import { createDefaultTextLayers } from "../utils/defaultTextLayers"
import { applyFilmFormatSettings } from "../utils/applyFilmFormat"
import { normalizeImagePlacement } from "../../preview/canvas/imagePlacementGeometry"
import { normalizeTextPlacement, textPlacementOptions } from "../utils/textPlacementOptions"
import { CUSTOM_LONG_EDGE_MAX, CUSTOM_LONG_EDGE_MIN, OUTPUT_SIZE_PRESETS } from "../utils/outputSizePresets"
import type { FilmFormatInfo } from "../../../types/preview"
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
  showOutputSettings = true
}: SettingsPanelProps): JSX.Element => {
  const { settings, update, updateNumber, updateTextLayer, resetTextLayers, replaceTextLayers, canUndo, canRedo, undo, redo } = controller
  const { fonts } = useSystemFonts()
  const [filmFormats, setFilmFormats] = useState<readonly FilmFormatInfo[]>(FALLBACK_FORMATS)
  const [exifStatus, setExifStatus] = useState<"idle" | "loading" | "error" | "empty">("idle")
  const imagePlacement = normalizeImagePlacement(settings.imagePlacement)
  const hasCustomLogo = (settings.logo.imagePath?.trim().length ?? 0) > 0
  const borderStyleParameters = settings.borderStyle === null
    ? null
    : BORDER_STYLE_PARAMETERS[settings.borderStyle.id] ?? { edgeWidth: true, holeCount: true, paperTone: true }

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
    if (formatId === "") {
      update({
        ...patch,
        layoutPresetId: null,
        imagePlacement: { ...normalizeImagePlacement(settings.imagePlacement), targetAspectRatio: null }
      })
    } else {
      update(patch)
    }
  }, [filmFormats, settings, update])

  const updateImagePlacement = useCallback((patch: Partial<typeof imagePlacement>): void => {
    update({ imagePlacement: { ...imagePlacement, ...patch } })
  }, [imagePlacement, update])

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

      {/* 图片放置（RenderRecipe v2） */}
      <fieldset className="settingGroup">
        <legend className="settingLabel">图片放置</legend>
        <div className="settingRow formInlineRow">
          <label className="settingFieldLabel">
            模式
            <select
              className="settingSelect"
              value={imagePlacement.mode}
              onChange={(e) => updateImagePlacement({ mode: e.target.value as "fit" | "fill" })}
            >
              <option value="fit">适应（完整图片）</option>
              <option value="fill">铺满（按焦点裁切）</option>
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
              value={imagePlacement.rotation}
              onChange={(e) => updateImagePlacement({ rotation: Number(e.target.value) })}
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
              value={imagePlacement.focalX}
              disabled={imagePlacement.mode !== "fill"}
              onChange={(e) => updateImagePlacement({ focalX: Number(e.target.value) })}
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
              value={imagePlacement.focalY}
              disabled={imagePlacement.mode !== "fill"}
              onChange={(e) => updateImagePlacement({ focalY: Number(e.target.value) })}
            />
          </label>
          <label className="settingFieldLabel">
            目标比例
            <input
              type="number"
              className="settingNumberInput"
              min={0.01}
              max={20}
              step={0.01}
              value={imagePlacement.targetAspectRatio ?? ""}
              placeholder="原图比例"
              onChange={(e) => updateImagePlacement({ targetAspectRatio: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </label>
        </div>
        <p className="settingsCapabilityHint">
          适应模式保留整张图；铺满模式按焦点裁切（仅铺满模式使用焦点）。预览与导出使用同一套几何规则。
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
                  value={firstLayer.fontFamily}
                  onChange={(e) => handleTextLayerFontFamilyChange(e.target.value)}
                >
                  <optgroup label="内置字体">
                    {fonts.filter((f) => f.source === "builtin").map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}{!opt.engineAvailable ? "（候选）" : ""}
                      </option>
                    ))}
                  </optgroup>
                  {fonts.some((f) => f.source === "system") && (
                    <optgroup label="候选字体（系统）">
                      {fonts.filter((f) => f.source === "system").map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}{!opt.engineAvailable ? "（候选）" : ""}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {!fonts.some((f) => f.value === firstLayer.fontFamily && f.engineAvailable) && (
                  <span className="settingHint">
                    ⚠ 当前字体引擎可能不可用，导出时将回退到 SansSerif
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
          {/* 导出格式 */}
          <fieldset className="settingGroup">
        <legend className="settingLabel">导出格式</legend>

        <div className="settingRow">
          <label className="settingFieldLabel">
            格式
            <select
              className="settingSelect"
              value={settings.exportFormat}
              onChange={(e) => update({ exportFormat: e.target.value as "png" | "jpeg" | "tiff" })}
            >
              <option value="png">PNG（无损）</option>
              <option value="jpeg">JPEG</option>
              <option value="tiff">TIFF（专业无损）</option>
            </select>
          </label>
        </div>

        {settings.exportFormat === "jpeg" && (
          <div className="settingRow">
            <label className="settingFieldLabel">
              JPEG 质量
              <NumberInput
                className="settingNumberInput"
                value={settings.jpegQuality}
                min={1}
                max={100}
                onCommit={handleNumberCommit("jpegQuality")}
              />
            </label>
          </div>
        )}
          </fieldset>

          {/* 输出尺寸 */}
          <fieldset className="settingGroup">
        <legend className="settingLabel">输出尺寸</legend>
        <p className="settingHint" style={{ marginBottom: "var(--space-2)" }}>
          默认按原图尺寸导出，不缩放。选择预设时按长边等比缩小，适合社交平台分享。
        </p>

        <div className="settingRow">
          <label className="settingFieldLabel">
            尺寸预设
            <select
              className="settingSelect"
              value={settings.outputSizePreset}
              onChange={(e) => update({ outputSizePreset: e.target.value as OutputSizePreset })}
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
                onCommit={handleNumberCommit("customOutputLongEdge")}
              />
            </label>
          </div>
        )}
          </fieldset>

          {/* 输出能力 */}
          <fieldset className="settingGroup">
        <legend className="settingLabel">输出选项</legend>
        <p className="settingHint" style={{ marginBottom: "var(--space-2)" }}>
          导出时按这里的选项生成文件；无法应用的能力会在任务结果中明确标记。
        </p>

        <div className="settingRow">
          <label className="settingCheckboxLabel">
            <input
              type="checkbox"
              checked={settings.preserveMetadata}
              onChange={(e) => update({ preserveMetadata: e.target.checked })}
            />
            保留 EXIF 元数据
          </label>
        </div>
        {settings.preserveMetadata && (
          <p className="settingHint">引擎会尽量保留源图中可读取的 EXIF 信息。</p>
        )}

        <div className="settingRow">
          <label className="settingCheckboxLabel">
            <input
              type="checkbox"
              checked={settings.preserveColorProfile}
              onChange={(e) => update({ preserveColorProfile: e.target.checked })}
            />
            保留 ICC 色彩配置
          </label>
        </div>
        {settings.preserveColorProfile && (
          <p className="settingHint">引擎会在输出格式支持时保留源图 ICC 配置。</p>
        )}

        <div className="settingRow">
          <label className="settingCheckboxLabel">
            <input
              type="checkbox"
              checked={settings.preferHighBitDepth}
              onChange={(e) => update({ preferHighBitDepth: e.target.checked })}
            />
            优先高位深（&gt;8bit）
          </label>
        </div>
        {settings.preferHighBitDepth && (
          <p className="settingHint">TIFF 可保留高位深；PNG/JPEG 会按编码器能力降级并报告结果。</p>
        )}
          </fieldset>
          <OutputPresetPanel
            settings={settings}
            onApply={(patch) => update(patch)}
          />
        </>
      )}
    </div>
  )
}
