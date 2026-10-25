import { useState } from "react"
import { NumberInput } from "../../../components/form/NumberInput"
import { useSystemFonts } from "../hooks/useSettings"
import type { FontOption } from "../../../services/desktop/fontsApi"
import type { SettingsController, TextLayerSettings } from "../types"
import { VariableHelpPanel } from "../../metadata/components/VariableHelpPanel"
import { normalizeTextPlacement, textPlacementOptions } from "../utils/textPlacementOptions"

type TextLayerEditorProps = {
  readonly controller: SettingsController
}

/**
 * 文字图层编辑器。
 *
 * 首版固定 3 段文字（文字 1 / 文字 2 / 文字 3），每段可独立配置：
 * - 开关
 * - 内容 + 变量插入
 * - 字号、颜色、字体
 * - 放置区域（图片 / 边框）、位置（顶部居中 / 居中 / 底部居中）
 * - 背景条开关 + 颜色 + 内边距
 * - 阴影开关 + 颜色 + 模糊 + 偏移
 * - 描边开关 + 颜色 + 宽度
 *
 * 每段可折叠/展开，减少首屏信息过载。
 */
export const TextLayerEditor = ({ controller }: TextLayerEditorProps): JSX.Element => {
  const { settings, updateTextLayer, resetTextLayers } = controller
  const { fonts } = useSystemFonts()

  // 空状态：无文字图层时显示提示和恢复按钮
  if (settings.textLayers.length === 0) {
    return (
      <div className="textLayerEmpty">
        <p className="settingsCapabilityHint">
          当前没有文字图层。点击下方按钮恢复默认 3 段文字。
        </p>
        <button
          type="button"
          className="ghostButton"
          onClick={() => resetTextLayers()}
        >
          恢复默认 3 段
        </button>
      </div>
    )
  }

  return (
    <div className="textLayerEditor">
      {settings.textLayers.map((layer, index) => (
        <TextLayerCard
          key={layer.id}
          layer={layer}
          index={index}
          fonts={fonts}
          onUpdate={(patch) => updateTextLayer(layer.id, patch)}
        />
      ))}
    </div>
  )
}

// ---- 单个文字图层卡片 --------------------------------------------------------

type TextLayerCardProps = {
  readonly layer: TextLayerSettings
  readonly index: number
  readonly fonts: readonly FontOption[]
  readonly onUpdate: (patch: Partial<TextLayerSettings>) => void
}

const TextLayerCard = ({ layer, index, fonts, onUpdate }: TextLayerCardProps): JSX.Element => {
  const [expanded, setExpanded] = useState(index === 0)
  const normalizedPlacement = normalizeTextPlacement(layer.textArea, layer.placement)
  const availableFonts = fonts.filter((font) => font.engineAvailable)
  const selectedFont = availableFonts.some((font) => font.value === layer.fontFamily)
    ? layer.fontFamily
    : "sans-serif"

  const title = `文字 ${index + 1}`
  const summary = layer.enabled
    ? (layer.content.length > 0 ? layer.content.slice(0, 30) : "（空内容）")
    : "已禁用"

  return (
    <div className={`textLayerCard ${layer.enabled ? "" : "textLayerCardDisabled"}`}>
      {/* 摘要行 */}
      <div
        className="textLayerCardHeader"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === "Enter") setExpanded(!expanded) }}
      >
        <label
          className="settingCheckboxLabel"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={layer.enabled}
            onChange={(e) => onUpdate({ enabled: e.target.checked })}
          />
          <span>{title}</span>
        </label>
        <span className="textLayerCardSummary">{summary}</span>
        <span className="textLayerCardToggle">{expanded ? "收起" : "展开"}</span>
      </div>

      {/* 展开后的编辑区 */}
      {expanded && (
        <div className="textLayerCardBody">
          {/* 内容 */}
          <div className="settingRow">
            <label className="settingFieldLabel">
              内容
              <input
                type="text"
                className="settingTextInput"
                placeholder="留空则不绘制该图层"
                value={layer.content}
                onChange={(e) => onUpdate({ content: e.target.value })}
              />
            </label>
          </div>

          {/* 变量插入 */}
          <VariableHelpPanel
            currentText={layer.content}
            onTextChange={(text) => onUpdate({ content: text })}
          />

          {/* 字号 + 颜色 */}
          <div className="settingRow formInlineRow">
            <label className="settingFieldLabel">
              字号
              <NumberInput
                className="settingNumberInput"
                value={layer.fontSize}
                min={8}
                max={200}
                onCommit={(value) => onUpdate({ fontSize: value })}
              />
            </label>
            <label className="settingFieldLabel">
              颜色
              <input
                type="color"
                className="settingColorInput"
                value={layer.color}
                onChange={(e) => onUpdate({ color: e.target.value })}
              />
            </label>
          </div>

          {/* 字体 */}
          <div className="settingRow">
            <label className="settingFieldLabel">
              字体
              <select
                className="settingSelect"
                value={selectedFont}
                onChange={(e) => onUpdate({ fontFamily: e.target.value })}
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
              {!availableFonts.some((f) => f.value === layer.fontFamily) && (
                <span className="settingHint">
                  当前保存的字体不在已验证清单中，本次导出将使用 SansSerif。
                </span>
              )}
            </label>
          </div>

          {/* 放置区域 + 位置 */}
          <div className="settingRow formInlineRow">
            <label className="settingFieldLabel">
              放置区域
              <select
                className="settingSelect"
                value={layer.textArea}
                onChange={(e) => {
                  const area = e.target.value as "image" | "border"
                  onUpdate({ textArea: area, placement: normalizeTextPlacement(area, layer.placement) })
                }}
              >
                <option value="image">图片上</option>
                <option value="border">边框上</option>
              </select>
            </label>
            <label className="settingFieldLabel">
              位置
              <select
                className="settingSelect"
                value={normalizedPlacement}
                onChange={(e) => onUpdate({ placement: e.target.value })}
              >
                {textPlacementOptions(layer.textArea).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          {/* 边距与字形间距 */}
          <div className="settingRow formInlineRow">
            <label className="settingFieldLabel">
              水平边距 (px)
              <NumberInput
                className="settingNumberInput"
                value={layer.marginX}
                min={0}
                max={500}
                onCommit={(value) => onUpdate({ marginX: value })}
              />
            </label>
            <label className="settingFieldLabel">
              垂直偏移 (px)
              <NumberInput
                className="settingNumberInput"
                value={layer.marginY}
                min={0}
                max={200}
                onCommit={(value) => onUpdate({ marginY: value })}
              />
            </label>
          </div>
          <div className="settingRow formInlineRow">
            <label className="settingFieldLabel">
              行距 (px)
              <NumberInput
                className="settingNumberInput"
                value={layer.lineSpacing ?? 0}
                min={-100}
                max={200}
                onCommit={(value) => onUpdate({ lineSpacing: value })}
              />
            </label>
            <label className="settingFieldLabel">
              字距 (px)
              <NumberInput
                className="settingNumberInput"
                value={layer.letterSpacing ?? 0}
                min={-20}
                max={100}
                onCommit={(value) => onUpdate({ letterSpacing: value })}
              />
            </label>
          </div>

          {/* 背景条 */}
          <div className="textLayerStyleGroup">
            <label className="settingCheckboxLabel">
              <input
                type="checkbox"
                checked={layer.backgroundEnabled}
                onChange={(e) => onUpdate({ backgroundEnabled: e.target.checked })}
              />
              <span>背景条</span>
            </label>
            {layer.backgroundEnabled && (
              <div className="settingRow formInlineRow">
                <label className="settingFieldLabel">
                  背景颜色
                  <input
                    type="color"
                    className="settingColorInput"
                    value={layer.backgroundColor}
                    onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
                  />
                </label>
                <label className="settingFieldLabel">
                  水平内边距
                  <NumberInput
                    className="settingNumberInput"
                    value={layer.backgroundPaddingX}
                    min={0}
                    max={50}
                    onCommit={(value) => onUpdate({ backgroundPaddingX: value })}
                  />
                </label>
                <label className="settingFieldLabel">
                  垂直内边距
                  <NumberInput
                    className="settingNumberInput"
                    value={layer.backgroundPaddingY}
                    min={0}
                    max={50}
                    onCommit={(value) => onUpdate({ backgroundPaddingY: value })}
                  />
                </label>
              </div>
            )}
          </div>

          {/* 阴影 */}
          <div className="textLayerStyleGroup">
            <label className="settingCheckboxLabel">
              <input
                type="checkbox"
                checked={layer.shadowEnabled}
                onChange={(e) => onUpdate({ shadowEnabled: e.target.checked })}
              />
              <span>阴影</span>
            </label>
            {layer.shadowEnabled && (
              <>
                <div className="settingRow formInlineRow">
                  <label className="settingFieldLabel">
                    阴影颜色
                    <input
                      type="color"
                      className="settingColorInput"
                      value={layer.shadowColor}
                      onChange={(e) => onUpdate({ shadowColor: e.target.value })}
                    />
                  </label>
                  <label className="settingFieldLabel">
                    模糊
                    <NumberInput
                      className="settingNumberInput"
                      value={layer.shadowBlur}
                      min={0}
                      max={20}
                      onCommit={(value) => onUpdate({ shadowBlur: value })}
                    />
                  </label>
                </div>
                <div className="settingRow formInlineRow">
                  <label className="settingFieldLabel">
                    水平偏移
                    <NumberInput
                      className="settingNumberInput"
                      value={layer.shadowOffsetX}
                      min={-20}
                      max={20}
                      onCommit={(value) => onUpdate({ shadowOffsetX: value })}
                    />
                  </label>
                  <label className="settingFieldLabel">
                    垂直偏移
                    <NumberInput
                      className="settingNumberInput"
                      value={layer.shadowOffsetY}
                      min={-20}
                      max={20}
                      onCommit={(value) => onUpdate({ shadowOffsetY: value })}
                    />
                  </label>
                </div>
              </>
            )}
          </div>

          {/* 描边 */}
          <div className="textLayerStyleGroup">
            <label className="settingCheckboxLabel">
              <input
                type="checkbox"
                checked={layer.strokeEnabled}
                onChange={(e) => onUpdate({ strokeEnabled: e.target.checked })}
              />
              <span>描边</span>
            </label>
            {layer.strokeEnabled && (
              <div className="settingRow formInlineRow">
                <label className="settingFieldLabel">
                  描边颜色
                  <input
                    type="color"
                    className="settingColorInput"
                    value={layer.strokeColor}
                    onChange={(e) => onUpdate({ strokeColor: e.target.value })}
                  />
                </label>
                <label className="settingFieldLabel">
                  描边宽度
                  <NumberInput
                    className="settingNumberInput"
                    value={layer.strokeWidth}
                    min={1}
                    max={10}
                    onCommit={(value) => onUpdate({ strokeWidth: value })}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
