import { useCallback, useState } from "react"
import { CAPTURE_FORMAT_GROUPS } from "../constants/captureFormats"
import type { OperationScope } from "../../queue/types"
import type { PresetDraft } from "../../quick/utils/buildPresetFromText"

type PresetTextComposerProps = {
  /** 新预设会应用到工作台当前共享的作用范围。 */
  readonly operationScope: OperationScope
  readonly onCreate: (draft: PresetDraft, scope: OperationScope) => void
}

const EMPTY_DRAFT: PresetDraft = {
  name: "",
  category: "",
  captureFormat: "",
  camera: "",
  lens: "",
  film: "",
  location: ""
}

const scopeLabel = (scope: OperationScope): string => {
  switch (scope) {
    case "active":
      return "当前图片"
    case "checked":
      return "已选图片"
    case "all":
      return "全部图片"
  }
}

/**
 * 从自由文本创建摄影预设的迁移入口。
 *
 * 这是原快速工作台的能力迁移到「管理拍摄信息预设」抽屉后的表单；
 * 资产去重、保存与作用范围应用仍由 WorkspacePage 统一协调。
 */
export const PresetTextComposer = ({ operationScope, onCreate }: PresetTextComposerProps): JSX.Element => {
  const [draft, setDraft] = useState<PresetDraft>(EMPTY_DRAFT)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateDraft = useCallback(<K extends keyof PresetDraft>(key: K, value: PresetDraft[K]): void => {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setError(null)
  }, [])

  const reset = useCallback((): void => {
    setDraft(EMPTY_DRAFT)
    setError(null)
    setOpen(false)
  }, [])

  const handleSubmit = useCallback((event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (draft.name.trim().length === 0) {
      setError("请填写预设名称。")
      return
    }
    if (draft.captureFormat.length === 0) {
      setError("请选择拍摄画幅。")
      return
    }
    if (draft.camera.trim().length === 0 && draft.film.trim().length === 0) {
      setError("请至少填写相机或胶片。")
      return
    }
    onCreate(draft, operationScope)
    reset()
  }, [draft, onCreate, operationScope, reset])

  if (!open) {
    return (
      <section className="presetTextComposer" aria-label="从文字创建摄影预设">
        <div className="presetTextComposerHeader">
          <div>
            <h3 className="presetTextComposerTitle">快速录入预设</h3>
            <p className="presetTextComposerHint">直接填写相机、镜头或胶片，保存后应用到{scopeLabel(operationScope)}。</p>
          </div>
          <button type="button" className="ghostButton" onClick={() => setOpen(true)}>开始录入</button>
        </div>
      </section>
    )
  }

  return (
    <section className="presetTextComposer" aria-label="从文字创建摄影预设">
      <div className="presetTextComposerHeader">
        <div>
          <h3 className="presetTextComposerTitle">快速录入预设</h3>
          <p className="presetTextComposerHint">保存并应用到{scopeLabel(operationScope)}。</p>
        </div>
        <button type="button" className="ghostButton" onClick={reset}>收起</button>
      </div>
      <form className="presetTextComposerForm" onSubmit={handleSubmit}>
        <label className="settingFieldLabel">
          预设名称
          <input
            type="text"
            className="settingTextInput"
            placeholder="例如：135 Portra 日常"
            value={draft.name}
            onChange={(event) => updateDraft("name", event.target.value)}
          />
        </label>
        <label className="settingFieldLabel">
          分类
          <input
            type="text"
            className="settingTextInput"
            placeholder="例如：135 胶片"
            value={draft.category}
            onChange={(event) => updateDraft("category", event.target.value)}
          />
        </label>
        <label className="settingFieldLabel">
          拍摄画幅
          <select
            className="settingSelect"
            value={draft.captureFormat}
            onChange={(event) => updateDraft("captureFormat", event.target.value)}
          >
            <option value="">— 选择拍摄画幅 —</option>
            {CAPTURE_FORMAT_GROUPS.map((group) => (
              <optgroup key={group.kind} label={group.label}>
                {group.formats.map((format) => (
                  <option key={format.id} value={format.id}>{format.label}（{format.aspectRatio}）</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="settingFieldLabel">
          相机
          <input
            type="text"
            className="settingTextInput"
            placeholder="例如：Leica M6"
            value={draft.camera}
            onChange={(event) => updateDraft("camera", event.target.value)}
          />
        </label>
        <label className="settingFieldLabel">
          镜头
          <input
            type="text"
            className="settingTextInput"
            placeholder="例如：Voigtlander 35mm F1.4"
            value={draft.lens}
            onChange={(event) => updateDraft("lens", event.target.value)}
          />
        </label>
        <label className="settingFieldLabel">
          胶片
          <input
            type="text"
            className="settingTextInput"
            placeholder="例如：Kodak Gold 200"
            value={draft.film}
            onChange={(event) => updateDraft("film", event.target.value)}
          />
        </label>
        <label className="settingFieldLabel">
          默认地点（可选）
          <input
            type="text"
            className="settingTextInput"
            placeholder="例如：Kyoto"
            value={draft.location}
            onChange={(event) => updateDraft("location", event.target.value)}
          />
        </label>
        {error !== null && <p className="panelErrorText" role="alert">{error}</p>}
        <div className="presetTextComposerActions">
          <button type="submit" className="primaryButton">保存并应用</button>
          <button type="button" className="ghostButton" onClick={reset}>取消</button>
        </div>
      </form>
    </section>
  )
}
