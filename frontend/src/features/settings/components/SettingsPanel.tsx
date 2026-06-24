import { useCallback, useEffect, useState } from "react"
import { NumberInput } from "../../../components/form/NumberInput"
import { Panel } from "../../../components/layout/Panel"
import { fetchFilmFormats } from "../../../services/engine/filmFormatsApi"
import { fetchPhotoMetadata } from "../../../services/engine/photoMetadataApi"
import { FONT_OPTIONS } from "../hooks/useSettings"
import type { NumberSettingKey, RenderSettings, SettingsController } from "../types"
import type { TemplateController } from "../../template/types"
import { TemplatePanel } from "../../template/components/TemplatePanel"
import type { FilmFormatInfo } from "../../../types/preview"

type SettingsPanelProps = {
  readonly controller: SettingsController
  readonly templateController: TemplateController
  /** 当前是否有选中的图片。无选图时显示提示。 */
  readonly hasSelectedImage: boolean
  /** 当前选中的图片路径（用于 EXIF 查询）。 */
  readonly selectedFilePath: string | null
  /** 每张图独立文字覆盖。 */
  readonly textOverride: string | null
  /** 设置当前图片的文字覆盖。 */
  readonly setTextOverride: (text: string | null) => void
  /** 加载模板设置到当前设置。 */
  readonly onLoadTemplate: (settings: RenderSettings) => void
}

/** 内置画幅选项（后端不可用时的回退）。 */
const FALLBACK_FORMATS: readonly FilmFormatInfo[] = [
  { id: "half-frame", label: "半格", recommendedBorder: { top: 40, bottom: 40, left: 20, right: 20, color: "#ffffff" } },
  { id: "135", label: "135", recommendedBorder: { top: 30, bottom: 30, left: 30, right: 30, color: "#ffffff" } },
  { id: "645", label: "645", recommendedBorder: { top: 30, bottom: 50, left: 30, right: 30, color: "#ffffff" } },
  { id: "6x6", label: "6x6", recommendedBorder: { top: 40, bottom: 40, left: 40, right: 40, color: "#ffffff" } },
  { id: "6x7", label: "6x7", recommendedBorder: { top: 30, bottom: 50, left: 35, right: 35, color: "#ffffff" } },
  { id: "6x8", label: "6x8", recommendedBorder: { top: 30, bottom: 50, left: 35, right: 35, color: "#ffffff" } },
  { id: "6x9", label: "6x9", recommendedBorder: { top: 30, bottom: 50, left: 40, right: 40, color: "#ffffff" } },
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
  templateController,
  hasSelectedImage,
  selectedFilePath,
  textOverride,
  setTextOverride,
  onLoadTemplate
}: SettingsPanelProps): JSX.Element => {
  const { settings, update, updateNumber } = controller
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

  const handleNumberCommit = useCallback(
    (key: NumberSettingKey) => (value: number) => {
      updateNumber(key, value, 0, 500)
    },
    [updateNumber]
  )

  const handleFilmFormatChange = useCallback((formatId: string): void => {
    if (formatId === "") {
      update({ filmFormat: null })
      return
    }
    const format = filmFormats.find((f) => f.id === formatId)
    update({
      filmFormat: formatId,
      borderTop: format?.recommendedBorder.top ?? settings.borderTop,
      borderBottom: format?.recommendedBorder.bottom ?? settings.borderBottom,
      borderLeft: format?.recommendedBorder.left ?? settings.borderLeft,
      borderRight: format?.recommendedBorder.right ?? settings.borderRight
    })
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

  const currentTextValue = textOverride ?? settings.textContent
  const isTextOverridden = textOverride !== null

  return (
    <Panel label="设置" title="渲染设置" className="settingsPanel">
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
              <div key={index} className="settingRow" style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
                <label className="settingFieldLabel">
                  停靠点 {index + 1}
                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
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

            <div className="settingRow" style={{ display: "flex", gap: "var(--space-2)" }}>
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

      {/* 文字 */}
      <fieldset className="settingGroup">
        <legend className="settingLabel">文字</legend>

        <div className="settingRow">
          <label className="settingFieldLabel">
            文字放置区域
            <select
              className="settingSelect"
              value={settings.textArea}
              onChange={(e) => update({ textArea: e.target.value as "image" | "border" })}
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
              value={settings.textPlacement}
              onChange={(e) => update({ textPlacement: e.target.value })}
            >
              <option value="top-center">顶部居中</option>
              <option value="center">居中</option>
              <option value="bottom-center">底部居中</option>
            </select>
          </label>
        </div>

        <div className="settingRow">
          <label className="settingFieldLabel">
            {isTextOverridden ? "当前图片文字（已覆盖）" : "全局文字内容"}
            <input
              type="text"
              className="settingTextInput"
              placeholder="留空则不添加文字"
              value={currentTextValue}
              onChange={(e) => {
                if (isTextOverridden) {
                  setTextOverride(e.target.value.length > 0 ? e.target.value : null)
                } else {
                  update({ textContent: e.target.value })
                }
              }}
            />
          </label>
          {isTextOverridden && (
            <button
              type="button"
              className="ghostButton"
              onClick={() => setTextOverride(null)}
              style={{ marginTop: "var(--space-1)" }}
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
              value={settings.textFontSize}
              min={8}
              max={200}
              onCommit={handleNumberCommit("textFontSize")}
            />
          </label>
        </div>

        <div className="settingRow">
          <label className="settingFieldLabel">
            文字颜色
            <input
              type="color"
              className="settingColorInput"
              value={settings.textColor}
              onChange={(e) => update({ textColor: e.target.value })}
            />
          </label>
        </div>

        <div className="settingRow">
          <label className="settingFieldLabel">
            字体
            <select
              className="settingSelect"
              value={settings.fontFamily}
              onChange={(e) => update({ fontFamily: e.target.value })}
            >
              {FONT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <p className="settingsCapabilityHint">
            字体选项已发送至引擎，实际渲染取决于引擎已安装/内置字体。
          </p>
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
            <p className="settingsCapabilityHint" style={{ color: "var(--status-error)" }}>
              EXIF 读取失败，请确认引擎正在运行。
            </p>
          )}
        </div>
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
              onChange={(e) => update({ exportFormat: e.target.value as "png" | "jpeg" })}
            >
              <option value="png">PNG（无损）</option>
              <option value="jpeg">JPEG</option>
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

      {/* 模板 */}
      <TemplatePanel
        templateController={templateController}
        currentSettings={settings}
        onLoad={onLoadTemplate}
      />
    </Panel>
  )
}
