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
import { CUSTOM_LONG_EDGE_MAX, CUSTOM_LONG_EDGE_MIN, OUTPUT_SIZE_PRESETS } from "../utils/outputSizePresets"
import type { FilmFormatInfo } from "../../../types/preview"

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
}

/** 内置画幅选项（后端不可用时的回退；含 6x10 与 6x12）。 */
const FALLBACK_FORMATS: readonly FilmFormatInfo[] = [
  { id: "half-frame", label: "半格", recommendedBorder: { top: 40, bottom: 40, left: 20, right: 20, color: "#ffffff" } },
  { id: "135", label: "135", recommendedBorder: { top: 30, bottom: 30, left: 30, right: 30, color: "#ffffff" } },
  { id: "645", label: "645", recommendedBorder: { top: 30, bottom: 50, left: 30, right: 30, color: "#ffffff" } },
  { id: "6x6", label: "6x6", recommendedBorder: { top: 40, bottom: 40, left: 40, right: 40, color: "#ffffff" } },
  { id: "6x7", label: "6x7", recommendedBorder: { top: 30, bottom: 50, left: 35, right: 35, color: "#ffffff" } },
  { id: "6x8", label: "6x8", recommendedBorder: { top: 30, bottom: 50, left: 35, right: 35, color: "#ffffff" } },
  { id: "6x9", label: "6x9", recommendedBorder: { top: 30, bottom: 50, left: 40, right: 40, color: "#ffffff" } },
  { id: "6x10", label: "6x10", recommendedBorder: { top: 30, bottom: 50, left: 45, right: 45, color: "#ffffff" } },
  { id: "6x12", label: "6x12", recommendedBorder: { top: 30, bottom: 50, left: 50, right: 50, color: "#ffffff" } }
]

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
  detectedBrandLabel
}: SettingsPanelProps): JSX.Element => {
  const { settings, update, updateNumber, updateTextLayer, resetTextLayers, replaceTextLayers, canUndo, canRedo, undo, redo } = controller
  const { fonts } = useSystemFonts()
  const [filmFormats, setFilmFormats] = useState<readonly FilmFormatInfo[]>(FALLBACK_FORMATS)
  const [exifStatus, setExifStatus] = useState<"idle" | "loading" | "error" | "empty">("idle")

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
    update(applyFilmFormatSettings(settings, formatId, format))
  }, [filmFormats, settings, update])

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
  const quickTextValue = textOverride ?? firstLayer?.content ?? ""

  /** 更新快捷文字内容：同步到 textLayers[0].content 或 textOverride。 */
  const handleQuickTextChange = useCallback((value: string): void => {
    if (isTextOverridden) {
      setTextOverride(value.length > 0 ? value : null)
    } else if (firstLayer !== null) {
      updateTextLayer(firstLayer.id, { content: value })
    }
  }, [isTextOverridden, firstLayer, setTextOverride, updateTextLayer])

  /** 变量插入回调：与 handleQuickTextChange 一致。 */
  const handleQuickTextVariableInsert = useCallback((text: string): void => {
    handleQuickTextChange(text)
  }, [handleQuickTextChange])

  /** 更新快捷文字字号：同步到 textLayers[0]。 */
  const handleQuickFontSizeCommit = useCallback((value: number): void => {
    if (firstLayer !== null) {
      updateTextLayer(firstLayer.id, { fontSize: value })
    }
  }, [firstLayer, updateTextLayer])

  /** 更新快捷文字颜色：同步到 textLayers[0]。 */
  const handleQuickColorChange = useCallback((value: string): void => {
    if (firstLayer !== null) {
      updateTextLayer(firstLayer.id, { color: value })
    }
  }, [firstLayer, updateTextLayer])

  /** 更新快捷文字字体：同步到 textLayers[0]。 */
  const handleQuickFontFamilyChange = useCallback((value: string): void => {
    if (firstLayer !== null) {
      updateTextLayer(firstLayer.id, { fontFamily: value })
    }
  }, [firstLayer, updateTextLayer])

  /** 更新快捷文字位置：同步到 textLayers[0]。 */
  const handleQuickPlacementChange = useCallback((value: string): void => {
    if (firstLayer !== null) {
      updateTextLayer(firstLayer.id, { placement: value })
    }
  }, [firstLayer, updateTextLayer])

  /** 更新快捷文字放置区域：同步到 textLayers[0]。 */
  const handleQuickTextAreaChange = useCallback((value: "image" | "border"): void => {
    if (firstLayer !== null) {
      updateTextLayer(firstLayer.id, { textArea: value })
    }
  }, [firstLayer, updateTextLayer])

  return (
    <div className="settingsPanelInner">
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
              value={settings.filmFormat ?? ""}
              onChange={(e) => handleFilmFormatChange(e.target.value)}
            >
              <option value="">不使用画幅</option>
              {filmFormats.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
          {settings.filmFormat !== null && (
            <p className="settingsCapabilityHint">
              切换画幅时已自动填充推荐边框值。可手动调整。
            </p>
          )}
        </div>
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
                  onChange={(e) => handleQuickTextAreaChange(e.target.value as "image" | "border")}
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
                  value={firstLayer.placement}
                  onChange={(e) => handleQuickPlacementChange(e.target.value)}
                >
                  <option value="top-center">顶部居中</option>
                  <option value="center">居中</option>
                  <option value="bottom-center">底部居中</option>
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
                  value={quickTextValue}
                  onChange={(e) => handleQuickTextChange(e.target.value)}
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
                  onCommit={handleQuickFontSizeCommit}
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
                  onChange={(e) => handleQuickColorChange(e.target.value)}
                />
              </label>
            </div>

            <div className="settingRow">
              <label className="settingFieldLabel">
                字体
                <select
                  className="settingSelect"
                  value={firstLayer.fontFamily}
                  onChange={(e) => handleQuickFontFamilyChange(e.target.value)}
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
              currentText={quickTextValue}
              onTextChange={handleQuickTextVariableInsert}
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
                字号
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
          </>
        )}
      </fieldset>

      {/* 裁剪 */}
      <fieldset className="settingGroup">
        <legend className="settingLabel">裁剪</legend>
        <label className="settingCheckboxLabel">
          <input
            type="checkbox"
            checked={settings.autoCrop}
            onChange={(e) => update({ autoCrop: e.target.checked })}
          />
          <span>自动裁剪</span>
        </label>
      </fieldset>

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

      {/* 专业导出 */}
      <fieldset className="settingGroup">
        <legend className="settingLabel">专业导出（实验性）</legend>
        <p className="settingHint" style={{ marginBottom: "var(--space-2)" }}>
          以下能力当前版本尚未实现，开启后导出结果中将标记为"已跳过"。
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
          <p className="settingHint">当前版本暂不支持 EXIF 保留，导出时将标记为"已跳过"。</p>
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
          <p className="settingHint">当前版本暂不支持 ICC 嵌入，导出时将标记为"已跳过"。</p>
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
          <p className="settingHint">当前版本暂不支持高位深输出，导出时将标记为"已跳过"，使用 8bit。</p>
        )}
      </fieldset>
    </div>
  )
}
