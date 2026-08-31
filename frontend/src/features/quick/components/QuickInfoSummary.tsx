/**
 * 快速出图模式摄影信息摘要。
 *
 * 显示当前照片的有效摄影身份（相机 · 镜头 · 胶片 + 画幅），
 * 并为每个字段标注来源（EXIF / 摄影预设 / 每图覆盖）。
 *
 * 内置「摄影预设」快速栏：选择已有预设或直接创建预设，应用到
 * 当前图片 / 已选图片 / 全部图片（作用范围明确提示）。
 */

import { useCallback, useState } from "react"
import type { PhotoIdentity, ShootingPreset } from "../../metadata/types"
import { captureFormatLabel } from "../../metadata/constants/captureFormats"
import { CAPTURE_FORMAT_GROUPS } from "../../metadata/constants/captureFormats"
import { IDENTITY_SOURCE_LABELS } from "../../metadata/utils/resolveIdentityFieldSources"
import type { IdentitySourceMap } from "../../metadata/utils/resolveIdentityFieldSources"
import type { OperationScope, QueueItem } from "../../queue/types"

type QuickInfoSummaryProps = {
  readonly activeItem: QueueItem
  readonly effectiveIdentity: PhotoIdentity
  readonly sources: IdentitySourceMap
  readonly presets: readonly ShootingPreset[]
  /** 批量选中数量（用于作用范围提示）。 */
  readonly checkedCount: number
  readonly operationScope: OperationScope
  readonly onOperationScopeChange: (scope: OperationScope) => void
  readonly onApplyPreset: (presetId: string, scope: OperationScope) => void
  readonly onClearPreset: (scope: OperationScope) => void
  readonly onCreatePresetFromText: (draft: PresetDraft, scope: OperationScope) => void
}

/** 快速创建预设的表单草稿（与 utils/buildPresetFromText 对齐）。 */
export type PresetDraft = {
  readonly name: string
  readonly category: string
  readonly captureFormat: string
  readonly camera: string
  readonly lens: string
  readonly film: string
  readonly location: string
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

/** 单行身份摘要（相机 · 镜头 · 胶片）。 */
const IdentityLine = ({
  value,
  source
}: {
  readonly value: string
  readonly source: IdentitySourceMap[keyof IdentitySourceMap]
}): JSX.Element => {
  if (value.trim().length === 0) {
    return <span className="quickInfoEmpty">未设置</span>
  }
  return (
    <span className="quickInfoIdentityValue">
      {value}
      {source !== null && (
        <span className={`quickInfoSourceBadge quickInfoSource${source}`}>
          {IDENTITY_SOURCE_LABELS[source]}
        </span>
      )}
    </span>
  )
}

/** 作用范围分段选择。 */
const ScopeSelector = ({
  value,
  checkedCount,
  onChange
}: {
  readonly value: OperationScope
  readonly checkedCount: number
  readonly onChange: (scope: OperationScope) => void
}): JSX.Element => {
  const options: readonly { readonly scope: OperationScope; readonly label: string }[] = [
    { scope: "active", label: "当前图片" },
    { scope: "checked", label: `已选 ${checkedCount} 张` },
    { scope: "all", label: "全部图片" }
  ]
  return (
    <div className="quickScopeSelector" role="group" aria-label="应用范围">
      {options.map((option) => (
        <button
          key={option.scope}
          type="button"
          className={`quickScopeBtn${value === option.scope ? " quickScopeActive" : ""}`}
          onClick={() => onChange(option.scope)}
          disabled={option.scope === "checked" && checkedCount === 0}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export const QuickInfoSummary = ({
  activeItem,
  effectiveIdentity,
  sources,
  presets,
  checkedCount,
  operationScope,
  onOperationScopeChange,
  onApplyPreset,
  onClearPreset,
  onCreatePresetFromText
}: QuickInfoSummaryProps): JSX.Element => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>("")
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [draft, setDraft] = useState<PresetDraft>(EMPTY_DRAFT)
  const [draftError, setDraftError] = useState<string | null>(null)

  const boundPreset = activeItem.presetId !== null
    ? presets.find((p) => p.id === activeItem.presetId) ?? null
    : null

  /** 应用选中预设到当前作用范围。 */
  const handleApplyPreset = useCallback((): void => {
    if (selectedPresetId.length === 0) {
      return
    }
    onApplyPreset(selectedPresetId, operationScope)
  }, [selectedPresetId, operationScope, onApplyPreset])

  /** 提交创建预设表单。 */
  const handleSubmitCreate = useCallback((): void => {
    if (draft.name.trim().length === 0) {
      setDraftError("请填写预设名称。")
      return
    }
    if (draft.captureFormat.length === 0) {
      setDraftError("请选择拍摄画幅。")
      return
    }
    if (draft.camera.trim().length === 0 && draft.film.trim().length === 0) {
      setDraftError("请至少填写相机或胶片。")
      return
    }
    setDraftError(null)
    onCreatePresetFromText(draft, operationScope)
    setShowCreateForm(false)
    setDraft(EMPTY_DRAFT)
  }, [draft, operationScope, onCreatePresetFromText])

  const presetOptions = presets.length > 0
    ? presets
    : []

  return (
    <section className="quickInfoSummary" aria-label="摄影信息摘要">
      <div className="quickInfoHeader">
        <span className="quickInfoTitle">摄影信息</span>
        {boundPreset !== null && (
          <span className="quickInfoBoundPreset">P: {boundPreset.name}</span>
        )}
      </div>

      <div className="quickInfoIdentity">
        <IdentityLine value={effectiveIdentity.camera} source={sources.camera} />
        {effectiveIdentity.camera.trim().length > 0 && <span className="quickInfoSeparator">·</span>}
        <IdentityLine value={effectiveIdentity.lens} source={sources.lens} />
        {effectiveIdentity.lens.trim().length > 0 && <span className="quickInfoSeparator">·</span>}
        <IdentityLine value={effectiveIdentity.film} source={sources.film} />
      </div>

      <div className="quickInfoMeta">
        {captureFormatLabel(effectiveIdentity.captureFormat).length > 0 ? (
          <span className="quickInfoFormat">
            画幅：{captureFormatLabel(effectiveIdentity.captureFormat)}
            {sources.captureFormat !== null && (
              <span className={`quickInfoSourceBadge quickInfoSource${sources.captureFormat}`}>
                {IDENTITY_SOURCE_LABELS[sources.captureFormat]}
              </span>
            )}
          </span>
        ) : (
          <span className="quickInfoFormat quickInfoEmpty">画幅未设置</span>
        )}
        {effectiveIdentity.location.trim().length > 0 && (
          <span className="quickInfoLocation">
            地点：{effectiveIdentity.location}
          </span>
        )}
      </div>

      {/* 摄影预设快速栏 */}
      <div className="quickPresetBar">
        <div className="quickPresetBarHeader">
          <span className="quickInfoTitle">摄影预设</span>
          <span className="quickPresetScopeHint">
            应用范围：{operationScope === "all" ? "全部图片" : operationScope === "checked" ? `已选 ${checkedCount} 张` : "当前图片"}
          </span>
        </div>

        {presetOptions.length > 0 && (
          <>
            <div className="quickPresetSelectRow">
              <select
                className="settingSelect quickPresetSelect"
                aria-label="选择预设"
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
              >
                <option value="" disabled>选择预设…</option>
                {presetOptions.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name || "未命名预设"}（{captureFormatLabel(preset.captureFormat)}）
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ghostButton"
                disabled={selectedPresetId.length === 0}
                onClick={handleApplyPreset}
              >
                应用
              </button>
            </div>
            <ScopeSelector value={operationScope} checkedCount={checkedCount} onChange={onOperationScopeChange} />
            <div className="quickPresetClearRow">
              <button
                type="button"
                className="ghostButton"
                disabled={activeItem.presetId === null && operationScope === "active"}
                onClick={() => onClearPreset(operationScope)}
              >
                清除该范围预设
              </button>
            </div>
          </>
        )}

        {showCreateForm ? (
          <div className="quickPresetCreateForm">
            <div className="settingRow">
              <label className="settingFieldLabel">
                预设名称
                <input
                  type="text"
                  className="settingTextInput"
                  placeholder="例如：135 Portra 日常"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
            </div>
            <div className="settingRow">
              <label className="settingFieldLabel">
                分类
                <input
                  type="text"
                  className="settingTextInput"
                  placeholder="例如：135 胶片"
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                />
              </label>
            </div>
            <div className="settingRow">
              <label className="settingFieldLabel">
                拍摄画幅
                <select
                  className="settingSelect"
                  value={draft.captureFormat}
                  onChange={(e) => setDraft({ ...draft, captureFormat: e.target.value })}
                >
                  <option value="">— 选择拍摄画幅 —</option>
                  {CAPTURE_FORMAT_GROUPS.map((group) => (
                    <optgroup key={group.kind} label={group.label}>
                      {group.formats.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}（{f.aspectRatio}）
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>
            <div className="settingRow">
              <label className="settingFieldLabel">
                相机
                <input
                  type="text"
                  className="settingTextInput"
                  placeholder="例如：Leica M6"
                  value={draft.camera}
                  onChange={(e) => setDraft({ ...draft, camera: e.target.value })}
                />
              </label>
            </div>
            <div className="settingRow">
              <label className="settingFieldLabel">
                镜头
                <input
                  type="text"
                  className="settingTextInput"
                  placeholder="例如：Voigtlander 35mm F1.4"
                  value={draft.lens}
                  onChange={(e) => setDraft({ ...draft, lens: e.target.value })}
                />
              </label>
            </div>
            <div className="settingRow">
              <label className="settingFieldLabel">
                胶片
                <input
                  type="text"
                  className="settingTextInput"
                  placeholder="例如：Kodak Gold 200"
                  value={draft.film}
                  onChange={(e) => setDraft({ ...draft, film: e.target.value })}
                />
              </label>
            </div>
            <div className="settingRow">
              <label className="settingFieldLabel">
                默认地点（可选）
                <input
                  type="text"
                  className="settingTextInput"
                  placeholder="例如：Kyoto"
                  value={draft.location}
                  onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                />
              </label>
            </div>
            {draftError !== null && (
              <p className="panelErrorText">{draftError}</p>
            )}
            <div className="quickPresetCreateActions">
              <button type="button" className="primaryButton" onClick={handleSubmitCreate}>保存并应用</button>
              <button type="button" className="ghostButton" onClick={() => { setShowCreateForm(false); setDraft(EMPTY_DRAFT); setDraftError(null) }}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="ghostButton quickPresetCreateToggle"
            onClick={() => setShowCreateForm(true)}
          >
            创建摄影预设
          </button>
        )}
      </div>
    </section>
  )
}
