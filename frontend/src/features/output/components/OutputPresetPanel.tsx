import { useCallback, useState } from "react"
import type { RenderSettings } from "../../settings/types"
import { useOutputPresets } from "../hooks/useOutputPresets"
import { outputPresetSettingsFrom, type OutputPreset } from "../types"

type OutputPresetPanelProps = {
  readonly settings: RenderSettings
  readonly onApply: (patch: Partial<RenderSettings>) => void
}

/** 输出预设管理；输出预设不参与用户版式序列化。 */
export const OutputPresetPanel = ({ settings, onApply }: OutputPresetPanelProps): JSX.Element => {
  const controller = useOutputPresets()
  const [name, setName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")

  const applyPreset = useCallback((preset: OutputPreset): void => {
    onApply(preset.settings)
  }, [onApply])

  const saveCurrent = useCallback((): void => {
    controller.savePreset(name, outputPresetSettingsFrom(settings))
    if (name.trim().length > 0) setName("")
  }, [controller, name, settings])

  return (
    <fieldset className="settingGroup outputPresetGroup">
      <legend className="settingLabel">输出预设</legend>
      <p className="settingsCapabilityHint">输出预设只保存格式、尺寸和质量，可独立套用到任意版式。</p>
      {controller.lastError !== null && (
        <div className="settingsCapabilityHint templateErrorRow">
          <span>{controller.lastError}</span>
          <button type="button" className="ghostButton" onClick={controller.clearError}>关闭</button>
        </div>
      )}
      <div className="templateNameRow">
        <input
          type="text"
          className="settingTextInput"
          value={name}
          placeholder="保存当前输出为…"
          onChange={(event) => setName(event.target.value)}
        />
        <button type="button" className="ghostButton" disabled={name.trim().length === 0} onClick={saveCurrent}>保存</button>
      </div>
      {controller.presets.length === 0 ? (
        <p className="settingsCapabilityHint">暂无输出预设。</p>
      ) : (
        <ul className="templateList outputPresetList">
          {controller.presets.map((preset) => (
            <li key={preset.id} className="templateItem outputPresetItem">
              {editingId === preset.id ? (
                <input
                  className="settingTextInput"
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      controller.updatePreset(preset.id, editingName, preset.settings)
                      setEditingId(null)
                    }
                    if (event.key === "Escape") setEditingId(null)
                  }}
                  autoFocus
                />
              ) : (
                <span className="templateName" title={preset.name}>{preset.name}</span>
              )}
              <div className="templateActions">
                <button type="button" className="ghostButton" onClick={() => applyPreset(preset)}>应用</button>
                <button
                  type="button"
                  className="ghostButton"
                  onClick={() => controller.updatePreset(preset.id, preset.name, outputPresetSettingsFrom(settings))}
                >
                  覆盖当前
                </button>
                <button type="button" className="ghostButton" onClick={() => {
                  setEditingId(preset.id)
                  setEditingName(preset.name)
                }}>重命名</button>
                <button type="button" className="ghostButton" onClick={() => controller.duplicatePreset(preset.id)}>复制</button>
                <button type="button" className="ghostButton" onClick={() => controller.deletePreset(preset.id)}>删除</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}
