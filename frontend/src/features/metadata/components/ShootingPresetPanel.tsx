import { useCallback, useMemo, useState } from "react"
import type { PhotoAssetStore, ShootingPreset } from "../types"
import { createEmptyPreset } from "../types"
import { CAPTURE_FORMAT_GROUPS, captureFormatLabel } from "../constants/captureFormats"
import { validatePresetInput } from "../utils/shootingPresetCodec"
import type { PresetFieldError } from "../utils/shootingPresetCodec"
import type { OperationScope } from "../../queue/types"

type ShootingPresetPanelProps = {
  readonly presets: readonly ShootingPreset[]
  readonly lastError: string | null
  readonly onSavePreset: (preset: ShootingPreset) => void
  /** 复制预设，返回复制出的新预设（用于立即进入编辑态）。 */
  readonly onDuplicatePreset: (id: string) => ShootingPreset | null
  readonly onDeletePreset: (id: string) => void
  readonly onClearError: () => void
  /** 应用预设到指定作用范围（当前 / 已选 / 全部）。 */
  readonly onApplyToScope: (presetId: string, scope: OperationScope) => void
  /** 清除指定作用范围的预设绑定。 */
  readonly onClearScope: (scope: OperationScope) => void
  /** WorkspacePage 唯一持有的操作范围。 */
  readonly operationScope: OperationScope
  readonly onOperationScopeChange: (scope: OperationScope) => void
  /** 当前是否有当前预览图片。 */
  readonly hasSelectedImage: boolean
  /** 当前队列图片数量。 */
  readonly queueCount: number
  /** 批量选中图片数量。 */
  readonly checkedCount: number
  /** 资产库数据（用于相机/镜头/胶片资产引用选择）。 */
  readonly assetStore: PhotoAssetStore
  /** 各预设被多少张队列图片引用（用于展示应用范围）。 */
  readonly presetUsageCounts: ReadonlyMap<string, number>
}

/** 校验错误码到中文提示。 */
const ERROR_LABELS: Record<PresetFieldError, string> = {
  "empty-name": "预设名称不能为空。",
  "missing-capture-format": "请选择拍摄画幅。",
  "invalid-capture-format": "拍摄画幅无效，请重新选择。",
  "invalid-asset-id": "资产引用无效，请重新选择或清空。"
}

/** 相机资产显示名。 */
const cameraLabel = (store: PhotoAssetStore, assetId: string): string => {
  const asset = store.cameras.find((c) => c.id === assetId)
  if (asset === undefined) {
    return ""
  }
  return asset.alias.trim().length > 0 ? asset.alias : `${asset.brand} ${asset.model}`.trim()
}

const lensLabel = (store: PhotoAssetStore, assetId: string): string => {
  const asset = store.lenses.find((l) => l.id === assetId)
  if (asset === undefined) {
    return ""
  }
  return `${asset.brand} ${asset.model}`.trim()
}

const filmLabel = (store: PhotoAssetStore, assetId: string): string => {
  const asset = store.films.find((f) => f.id === assetId)
  if (asset === undefined) {
    return ""
  }
  return `${asset.brand} ${asset.name}`.trim()
}

/**
 * 摄影预设面板（P0-05）：创建、编辑、复制、删除、分类筛选与应用范围选择。
 *
 * 预设、模板与图片队列是三个独立对象：删除预设不会删除图片、资产或模板；
 * 被图片引用的预设删除时由 WorkspacePage 清理队列绑定，不会产生悬空绑定崩溃。
 */
export const ShootingPresetPanel = ({
  presets,
  lastError,
  onSavePreset,
  onDuplicatePreset,
  onDeletePreset,
  onClearError,
  onApplyToScope,
  onClearScope,
  operationScope,
  onOperationScopeChange,
  hasSelectedImage,
  queueCount,
  checkedCount,
  assetStore,
  presetUsageCounts
}: ShootingPresetPanelProps): JSX.Element => {
  const [editing, setEditing] = useState<ShootingPreset>(createEmptyPreset)
  const [isEditing, setIsEditing] = useState(false)
  const [errors, setErrors] = useState<readonly PresetFieldError[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string>("")
  const [selectedPresetId, setSelectedPresetId] = useState<string>("")

  /** 全部存在的分类（去重排序）。 */
  const categories = useMemo(() => {
    const set = new Set(presets.map((p) => p.category.trim()).filter((c) => c.length > 0))
    return [...set].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
  }, [presets])

  /** 按分类筛选后的预设列表。 */
  const filteredPresets = useMemo(() => {
    if (categoryFilter.length === 0) {
      return presets
    }
    return presets.filter((p) => p.category === categoryFilter)
  }, [presets, categoryFilter])

  const handleStartCreate = useCallback((): void => {
    setEditing({ ...createEmptyPreset(), id: crypto.randomUUID() })
    setErrors([])
    setIsEditing(true)
  }, [])

  const handleStartEdit = useCallback((preset: ShootingPreset): void => {
    setEditing(preset)
    setErrors([])
    setIsEditing(true)
  }, [])

  const handleDuplicate = useCallback((id: string): void => {
    const copy = onDuplicatePreset(id)
    if (copy !== null) {
      setEditing(copy)
      setErrors([])
      setIsEditing(true)
    }
  }, [onDuplicatePreset])

  const handleDelete = useCallback((preset: ShootingPreset): void => {
    const usage = presetUsageCounts.get(preset.id) ?? 0
    if (usage > 0 && !window.confirm(`该预设正被 ${usage} 张图片引用，删除后这些图片将不再使用它（图片本身不受影响）。确定删除？`)) {
      return
    }
    onDeletePreset(preset.id)
  }, [onDeletePreset, presetUsageCounts])

  const handleSave = useCallback((): void => {
    const result = validatePresetInput(editing)
    if (result.length > 0) {
      setErrors(result)
      return
    }
    onSavePreset(editing)
    setIsEditing(false)
    setEditing(createEmptyPreset())
    setErrors([])
  }, [editing, onSavePreset])

  const handleCancel = useCallback((): void => {
    setIsEditing(false)
    setEditing(createEmptyPreset())
    setErrors([])
  }, [])

  const updateField = useCallback(<K extends keyof ShootingPreset>(key: K, value: ShootingPreset[K]): void => {
    // 同步计算新值：既更新编辑态，也用于即时重校验（避免用陈旧闭包校验）
    const next = { ...editing, [key]: value }
    setEditing(next)
    setErrors((prevErrors) => {
      if (prevErrors.length === 0) {
        return prevErrors
      }
      return validatePresetInput(next)
    })
  }, [editing])

  const handleApply = useCallback((): void => {
    if (selectedPresetId.length === 0) {
      return
    }
    onApplyToScope(selectedPresetId, operationScope)
  }, [selectedPresetId, operationScope, onApplyToScope])

  return (
    <div className="presetPanelInner">
      {lastError !== null && (
        <div className="templateErrorRow">
          <span className="panelErrorText">{lastError}</span>
          <button type="button" className="ghostButton" onClick={onClearError}>关闭</button>
        </div>
      )}

      {!isEditing && (
        <>
          {/* 分类筛选 */}
          {categories.length > 0 && (
            <div className="presetFilterRow">
              <label className="settingFieldLabel">
                分类
                <select
                  className="settingSelect presetFilterSelect"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="">全部分类</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* 预设列表 */}
          <div className="presetList">
            {filteredPresets.length === 0 && (
              <p className="settingsCapabilityHint">
                {presets.length === 0 ? "暂无摄影预设，点击下方按钮创建。" : "该分类下暂无预设。"}
              </p>
            )}
            {filteredPresets.map((preset) => {
              const usage = presetUsageCounts.get(preset.id) ?? 0
              const summary = [
                captureFormatLabel(preset.captureFormat),
                cameraLabel(assetStore, preset.cameraAssetId ?? ""),
                filmLabel(assetStore, preset.filmAssetId ?? "")
              ].filter(Boolean).join(" · ")
              return (
                <div key={preset.id} className="presetItem">
                  <div className="presetItemInfo">
                    <span className="presetItemName">
                      {preset.name || "未命名预设"}
                      {preset.category.trim().length > 0 && (
                        <span className="presetCategoryChip">{preset.category}</span>
                      )}
                    </span>
                    <span className="presetItemDetail">
                      {summary.length > 0 ? summary : "未引用资产"}
                    </span>
                    {usage > 0 && (
                      <span className="presetUsageHint">{usage} 张图片使用中</span>
                    )}
                  </div>
                  <div className="presetItemActions">
                    <button type="button" className="ghostButton" onClick={() => handleStartEdit(preset)}>编辑</button>
                    <button type="button" className="ghostButton" onClick={() => handleDuplicate(preset.id)}>复制</button>
                    <button type="button" className="ghostButton" onClick={() => handleDelete(preset)}>删除</button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="presetActions">
            <button type="button" className="ghostButton" onClick={handleStartCreate}>
              新建摄影预设
            </button>
          </div>

          {/* 应用范围选择：当前图片 / 已选图片 / 全部图片 */}
          {presets.length > 0 && (
            <fieldset className="settingGroup">
              <legend className="settingLabel">应用到图片</legend>
              <p className="settingsCapabilityHint">
                应用范围：当前图片、已选图片（{checkedCount} 张）或全部图片（{queueCount} 张）。
                应用预设不会改变边框、文字布局或导出设置。
              </p>
              <div className="presetScopeSelector" role="group" aria-label="应用范围">
                <button
                  type="button"
                  className={`ghostButton${operationScope === "active" ? " presetScopeActive" : ""}`}
                  onClick={() => onOperationScopeChange("active")}
                >
                  当前图片
                </button>
                <button
                  type="button"
                  className={`ghostButton${operationScope === "checked" ? " presetScopeActive" : ""}`}
                  onClick={() => onOperationScopeChange("checked")}
                  disabled={checkedCount === 0}
                >
                  已选 {checkedCount} 张
                </button>
                <button
                  type="button"
                  className={`ghostButton${operationScope === "all" ? " presetScopeActive" : ""}`}
                  onClick={() => onOperationScopeChange("all")}
                >
                  全部图片
                </button>
              </div>
              <div className="presetApplyRow">
                <select
                  className="settingSelect presetApplySelect"
                  aria-label="选择预设"
                  value={selectedPresetId}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                >
                  <option value="" disabled>选择预设…</option>
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name || "未命名预设"}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="ghostButton"
                  disabled={!hasSelectedImage || selectedPresetId.length === 0 || (operationScope === "checked" && checkedCount === 0)}
                  onClick={handleApply}
                  title={`应用预设到${operationScope === "active" ? "当前图片" : operationScope === "checked" ? `已选 ${checkedCount} 张图片` : `全部 ${queueCount} 张图片`}`}
                >
                  应用{operationScope === "active" ? "当前" : operationScope === "checked" ? "已选" : "全部"}
                </button>
              </div>
              <div className="presetApplyRow">
                <button
                  type="button"
                  className="ghostButton"
                  disabled={!hasSelectedImage || (operationScope === "checked" && checkedCount === 0)}
                  onClick={() => onClearScope(operationScope)}
                  title={`清除${operationScope === "active" ? "当前图片" : operationScope === "checked" ? `已选 ${checkedCount} 张图片` : `全部 ${queueCount} 张图片`}的预设绑定`}
                >
                  清除{operationScope === "active" ? "当前" : operationScope === "checked" ? "已选" : "全部"}预设
                </button>
              </div>
            </fieldset>
          )}
        </>
      )}

      {/* 编辑/创建预设 */}
      {isEditing && (
        <div className="presetEditor">
          <div className="settingRow">
            <label className="settingFieldLabel">
              预设名称
              <input
                type="text"
                className="settingTextInput"
                placeholder="例如：135 Portra 日常"
                value={editing.name}
                onChange={(e) => updateField("name", e.target.value)}
              />
            </label>
          </div>

          <div className="settingRow">
            <label className="settingFieldLabel">
              分类
              <input
                type="text"
                className="settingTextInput"
                placeholder="例如：135 胶片 / 数码常用 / 旅行"
                value={editing.category}
                onChange={(e) => updateField("category", e.target.value)}
                list="preset-category-suggestions"
              />
              <datalist id="preset-category-suggestions">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          </div>

          <div className="settingRow">
            <label className="settingFieldLabel">
              拍摄画幅
              <select
                className="settingSelect"
                value={editing.captureFormat}
                onChange={(e) => updateField("captureFormat", e.target.value)}
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
              相机资产
              <select
                className="settingSelect"
                value={editing.cameraAssetId ?? ""}
                onChange={(e) => updateField("cameraAssetId", e.target.value === "" ? null : e.target.value)}
              >
                <option value="">不引用相机</option>
                {assetStore.cameras.map((c) => (
                  <option key={c.id} value={c.id}>{c.alias || `${c.brand} ${c.model}`}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="settingRow">
            <label className="settingFieldLabel">
              镜头资产
              <select
                className="settingSelect"
                value={editing.lensAssetId ?? ""}
                onChange={(e) => updateField("lensAssetId", e.target.value === "" ? null : e.target.value)}
              >
                <option value="">不引用镜头</option>
                {assetStore.lenses.map((l) => (
                  <option key={l.id} value={l.id}>{`${l.brand} ${l.model}`}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="settingRow">
            <label className="settingFieldLabel">
              胶片资产
              <select
                className="settingSelect"
                value={editing.filmAssetId ?? ""}
                onChange={(e) => updateField("filmAssetId", e.target.value === "" ? null : e.target.value)}
              >
                <option value="">不引用胶片</option>
                {assetStore.films.map((f) => (
                  <option key={f.id} value={f.id}>{`${f.brand} ${f.name}`}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="settingRow">
            <label className="settingFieldLabel">
              默认地点
              <input
                type="text"
                className="settingTextInput"
                placeholder="例如：Kyoto"
                value={editing.defaultLocation ?? ""}
                onChange={(e) => updateField("defaultLocation", e.target.value.length === 0 ? null : e.target.value)}
              />
            </label>
          </div>

          <div className="settingRow">
            <label className="settingFieldLabel">
              备注
              <input
                type="text"
                className="settingTextInput"
                placeholder="可选备注"
                value={editing.notes ?? ""}
                onChange={(e) => updateField("notes", e.target.value.length === 0 ? null : e.target.value)}
              />
            </label>
          </div>

          {errors.length > 0 && (
            <ul className="presetErrorList">
              {errors.map((err) => (
                <li key={err} className="presetErrorItem">{ERROR_LABELS[err]}</li>
              ))}
            </ul>
          )}

          <div className="presetEditorActions">
            <button type="button" className="ghostButton" onClick={handleSave}>保存</button>
            <button type="button" className="ghostButton" onClick={handleCancel}>取消</button>
          </div>
        </div>
      )}
    </div>
  )
}
