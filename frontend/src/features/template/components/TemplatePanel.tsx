import { useCallback, useState } from "react"
import type { RenderSettings } from "../../settings/types"
import type { TemplateController } from "../types"

type TemplatePanelProps = {
  readonly templateController: TemplateController
  readonly currentSettings: RenderSettings
  readonly onLoad: (settings: RenderSettings) => void
}

export const TemplatePanel = ({
  templateController,
  currentSettings,
  onLoad
}: TemplatePanelProps): JSX.Element => {
  const [newName, setNewName] = useState("")
  const { templates, defaultTemplateId, lastError, saveTemplate, deleteTemplate, setDefault, clearError } = templateController

  const handleSave = useCallback(() => {
    const trimmed = newName.trim()
    if (trimmed.length === 0) {
      return
    }
    saveTemplate(trimmed, currentSettings)
    setNewName("")
  }, [newName, currentSettings, saveTemplate])

  const handleLoad = useCallback((id: string) => {
    const settings = templateController.loadTemplate(id)
    if (settings !== null) {
      onLoad(settings)
    }
  }, [templateController, onLoad])

  return (
    <fieldset className="settingGroup">
      <legend className="settingLabel">模板</legend>

      {lastError !== null && (
        <div className="settingsCapabilityHint templateErrorRow">
          <span>{lastError}</span>
          <button
            type="button"
            className="ghostButton"
            onClick={clearError}
          >
            关闭
          </button>
        </div>
      )}

      <div className="settingRow">
        <label className="settingFieldLabel">
          模板名称
          <div className="templateNameRow">
            <input
              type="text"
              className="settingTextInput templateNameInput"
              placeholder="输入模板名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button
              type="button"
              className="ghostButton"
              disabled={newName.trim().length === 0}
              onClick={handleSave}
            >
              保存
            </button>
          </div>
        </label>
      </div>

      {templates.length === 0 ? (
        <p className="settingsCapabilityHint">暂无保存的模板。</p>
      ) : (
        <ul className="templateList">
          {templates.map((t) => (
            <li key={t.id} className="templateItem">
              <span className="templateName" title={t.name}>{t.name}</span>
              {defaultTemplateId === t.id && (
                <span className="templateDefaultBadge">默认</span>
              )}
              <div className="templateActions">
                <button
                  type="button"
                  className="ghostButton"
                  onClick={() => handleLoad(t.id)}
                >
                  加载
                </button>
                <button
                  type="button"
                  className="ghostButton"
                  onClick={() => setDefault(defaultTemplateId === t.id ? null : t.id)}
                >
                  {defaultTemplateId === t.id ? "取消默认" : "设为默认"}
                </button>
                <button
                  type="button"
                  className="ghostButton"
                  onClick={() => deleteTemplate(t.id)}
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}
