import { useCallback, useRef, useState } from "react"
import type { RenderSettings } from "../../settings/types"
import type { LayoutSettings, Template, TemplateController } from "../types"
import { encodeTemplateJson, decodeTemplateJson, deduplicateTemplateName } from "../utils/templateJsonCodec"
import { buildTemplateExportFileName } from "../utils/templateFileName"
import { LiveTemplateThumbnail } from "./LiveTemplateThumbnail"
import { TemplateThumbnail } from "./TemplateThumbnail"
import type { BuiltInTemplate } from "../presets/builtInTemplates"

type TemplatePanelProps = {
  readonly templateController: TemplateController
  readonly currentSettings: RenderSettings
  /** 当前照片；存在时用户版式缩略图使用真实 Canvas 渲染。 */
  readonly currentImage: HTMLImageElement | null
  readonly onLoad: (settings: LayoutSettings) => void
  /** 导入模板后的回调（用于将模板保存到模板库）。 */
  readonly onImportTemplate: ((template: Template) => void) | undefined
}

export const TemplatePanel = ({
  templateController,
  currentSettings,
  currentImage,
  onLoad,
  onImportTemplate,
}: TemplatePanelProps): JSX.Element => {
  const [newName, setNewName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const {
    templates,
    defaultTemplateId,
    lastError,
    saveTemplate,
    updateTemplate,
    duplicateTemplate,
    renameTemplate,
    deleteTemplate,
    setDefault,
    clearError
  } = templateController

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

  // ---- 导出 ----------------------------------------------------------------

  const handleExport = useCallback((template: Template) => {
    const json = encodeTemplateJson(template)
    const fileName = buildTemplateExportFileName(template.name)

    if (window.desktop !== undefined) {
      // Electron 模式：走安全 IPC 保存对话框
      void window.desktop.exportTemplateJson(fileName, json)
        .then((savedPath) => {
          if (savedPath !== null) {
            console.log(`[模板导出] 已导出到：${savedPath}`)
          }
        })
        .catch((err: unknown) => {
          console.error("[模板导出] 导出失败", err)
        })
    } else {
      // 浏览器模式：Blob + download
      const blob = new Blob([json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [])

  // ---- 导入 ----------------------------------------------------------------

  const processImportedJson = useCallback((json: string) => {
    const result = decodeTemplateJson(json)
    if (!result.ok) {
      setImportError(result.error)
      return
    }

    // 去重名称
    const existingNames = templates.map((t) => t.name)
    const uniqueName = deduplicateTemplateName(result.template.name, existingNames)
    const finalTemplate: Template = { ...result.template, name: uniqueName }

    if (onImportTemplate !== undefined) {
      onImportTemplate(finalTemplate)
    } else {
      saveTemplate(finalTemplate.name, finalTemplate.settings)
    }
    setImportError(null)
  }, [templates, saveTemplate, onImportTemplate])

  const handleImportClick = useCallback(() => {
    setImportError(null)

    if (window.desktop !== undefined) {
      // Electron 模式：走安全 IPC 文件选择对话框
      void window.desktop.importTemplateJson()
        .then((json) => {
          if (json === null) {
            return // 用户取消
          }
          processImportedJson(json)
        })
        .catch((err: unknown) => {
          console.error("[模板导入] 导入失败", err)
          setImportError("模板导入失败，请检查文件权限。")
        })
    } else {
      // 浏览器模式：触发隐藏 file input
      fileInputRef.current?.click()
    }
  }, [processImportedJson])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file === undefined) {
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : ""
      processImportedJson(text)
    }
    reader.onerror = () => {
      setImportError("文件读取失败。")
    }
    reader.readAsText(file)
    // 重置 input，允许重复选择同一文件
    e.target.value = ""
  }, [processImportedJson])

  const thumbFor = (settings: LayoutSettings): BuiltInTemplate["thumb"] => {
    const bottom = Math.max(0, settings.borderBottom)
    const total = Math.max(1, settings.borderTop + bottom + 100)
    return {
      borderColor: settings.borderColor || "#ffffff",
      photoColor: "#6f7278",
      textColor: settings.textColor || "#222222",
      bottomRatio: Math.min(0.8, Math.max(0.05, bottom / total))
    }
  }

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

      {importError !== null && (
        <div className="settingsCapabilityHint templateErrorRow">
          <span>{importError}</span>
          <button
            type="button"
            className="ghostButton"
            onClick={() => setImportError(null)}
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

      {/* 导入按钮 */}
      <div className="settingRow">
        <button
          type="button"
          className="ghostButton"
          onClick={handleImportClick}
        >
          导入模板
        </button>
        {/* 浏览器模式的隐藏 file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={handleFileInputChange}
        />
      </div>

      {templates.length === 0 ? (
        <p className="settingsCapabilityHint">暂无保存的模板。</p>
      ) : (
        <ul className="templateList">
          {templates.map((t) => (
            <li key={t.id} className="templateItem">
              <div className="templateItemThumbnail" aria-hidden="true">
                {currentImage !== null ? (
                  <LiveTemplateThumbnail
                    image={currentImage}
                    settings={{ ...currentSettings, ...t.settings }}
                  />
                ) : (
                  <TemplateThumbnail thumb={thumbFor(t.settings)} />
                )}
              </div>
              {editingId === t.id ? (
                <input
                  className="settingTextInput templateInlineNameInput"
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      renameTemplate(t.id, editingName)
                      setEditingId(null)
                    }
                    if (event.key === "Escape") setEditingId(null)
                  }}
                  autoFocus
                />
              ) : (
                <span className="templateName" title={t.name}>{t.name}</span>
              )}
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
                  onClick={() => updateTemplate(t.id, t.name, currentSettings)}
                >
                  覆盖更新
                </button>
                <button
                  type="button"
                  className="ghostButton"
                  onClick={() => {
                    setEditingId(t.id)
                    setEditingName(t.name)
                  }}
                >
                  重命名
                </button>
                <button
                  type="button"
                  className="ghostButton"
                  onClick={() => duplicateTemplate(t.id)}
                >
                  复制
                </button>
                <button
                  type="button"
                  className="ghostButton"
                  onClick={() => handleExport(t)}
                >
                  导出
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
