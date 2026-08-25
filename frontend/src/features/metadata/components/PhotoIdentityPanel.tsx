import { useCallback, useState } from "react"
import type { PhotoAssetStore, PhotoIdentity, ShootingPreset } from "../types"
import { captureFormatLabel } from "../constants/captureFormats"
import { BUILT_IN_CAMERA_MODELS } from "../constants/cameraModels"
import { IDENTITY_SOURCE_LABELS } from "../utils/resolveIdentityFieldSources"
import type { IdentityFieldSource, IdentitySourceMap } from "../utils/resolveIdentityFieldSources"

type PhotoIdentityPanelProps = {
  /** 当前选中图片的有效摄影身份（已合并覆盖 > 摄影预设 > EXIF > 空）。 */
  readonly effectiveIdentity: PhotoIdentity
  /** 当前选中图片的每图覆盖（null 表示无覆盖，继承摄影预设）。 */
  readonly identityOverride: Partial<PhotoIdentity> | null
  /** 当前选中图片绑定的摄影预设 ID。 */
  readonly presetId: string | null
  /** 摄影预设列表。 */
  readonly presets: readonly ShootingPreset[]
  /** 资产库（用于候选选择）。 */
  readonly assetStore: PhotoAssetStore
  /** 更新当前选中图片的覆盖字段。 */
  readonly onUpdateOverride: (patch: Partial<PhotoIdentity>) => void
  /** 清除当前选中图片的全部覆盖。 */
  readonly onClearOverride: () => void
  /** 是否有选中图片。 */
  readonly hasSelectedImage: boolean
  /** 各展示字段的来源标识（EXIF / 摄影预设 / 每图覆盖）。 */
  readonly sources?: IdentitySourceMap | undefined
}

/**
 * 当前图片摄影信息覆盖面板。
 *
 * 显示当前图片的有效身份（合并结果），允许用户对单张图片设置覆盖。
 * 覆盖字段留空表示继承摄影预设（或 EXIF）。
 * 相机字段支持内置机型快速选择。
 */
export const PhotoIdentityPanel = ({
  effectiveIdentity,
  identityOverride,
  presetId,
  presets,
  assetStore,
  onUpdateOverride,
  onClearOverride,
  hasSelectedImage,
  sources
}: PhotoIdentityPanelProps): JSX.Element => {
  // 所有 hook 必须在任何条件 return 之前调用（React Hooks 规则）
  const [expanded, setExpanded] = useState(false)

  const handleChange = useCallback((field: keyof PhotoIdentity, value: string): void => {
    onUpdateOverride({ [field]: value })
  }, [onUpdateOverride])

  /** 选择内置机型时，把 label 写入 camera 覆盖。 */
  const handleCameraModelSelect = useCallback((label: string): void => {
    if (label === "") {
      // 选空选项时清除相机覆盖
      handleChange("camera", "")
      return
    }
    handleChange("camera", label)
  }, [handleChange])

  const boundPreset = presetId !== null ? presets.find((p) => p.id === presetId) ?? null : null

  if (!hasSelectedImage) {
    return (
      <div className="photoIdentityPanelInner">
        <p className="settingsCapabilityHint">请先选择一张图片。</p>
      </div>
    )
  }

  const hasOverride = identityOverride !== null && Object.values(identityOverride).some((v) => v !== "")

  // 内置机型下拉当前选中值：如果相机覆盖值与某个内置机型 label 一致则选中它
  const cameraOverrideValue = identityOverride?.camera ?? ""
  const builtInSelected = BUILT_IN_CAMERA_MODELS.find((m) => m.label === cameraOverrideValue)?.id ?? ""

  return (
    <div className="photoIdentityPanelInner">
      {/* 摘要行 */}
      <div
        className="identitySummary"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === "Enter") setExpanded(!expanded) }}
      >
        <div className="identitySummaryContent">
          {boundPreset && (
            <span className="identityPresetBadge">P: {boundPreset.name}</span>
          )}
          {hasOverride && (
            <span className="identityOverrideBadge">I</span>
          )}
          <span className="identitySummaryText">
            {effectiveIdentity.camera || "未设置相机"}
            {effectiveIdentity.film && ` · ${effectiveIdentity.film}`}
          </span>
          {/* 来源标识：EXIF / 摄影预设 / 每图覆盖 */}
          {(sources?.camera ?? null) !== null && (
            <span className={`identitySourceBadge identitySource${sources!.camera}`}>
              {IDENTITY_SOURCE_LABELS[sources!.camera!]}
            </span>
          )}
        </div>
        <span className="identityExpandToggle">{expanded ? "收起" : "展开"}</span>
      </div>

      {/* 展开后的覆盖编辑区 */}
      {expanded && (
        <div className="identityEditor">
          <p className="settingsCapabilityHint">
            覆盖字段留空表示继承摄影预设。{!boundPreset && "当前图片未绑定摄影预设。"}
            {boundPreset && captureFormatLabel(boundPreset.captureFormat).length > 0
              ? ` 当前预设画幅：${captureFormatLabel(boundPreset.captureFormat)}。`
              : ""}
          </p>

          <IdentityField
            label="帧号"
            value={identityOverride?.frameNumber ?? ""}
            effectiveValue={effectiveIdentity.frameNumber}
            placeholder="例如：12"
            onChange={(v) => handleChange("frameNumber", v)}
            assetSuggestions={[]}
            source={sources?.frameNumber ?? null}
          />

          {/* 内置机型快速选择 */}
          <div className="settingRow">
            <label className="settingFieldLabel">
              <span>内置机型</span>
              <select
                className="settingSelect"
                value={builtInSelected}
                onChange={(e) => {
                  const id = e.target.value
                  if (id === "") {
                    handleCameraModelSelect("")
                    return
                  }
                  const model = BUILT_IN_CAMERA_MODELS.find((m) => m.id === id)
                  if (model !== undefined) {
                    handleCameraModelSelect(model.label)
                  }
                }}
              >
                <option value="">— 手动输入或清空 —</option>
                {BUILT_IN_CAMERA_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
          </div>

          <IdentityField
            label="相机"
            value={identityOverride?.camera ?? ""}
            effectiveValue={effectiveIdentity.camera}
            placeholder="例如：Leica M6"
            onChange={(v) => handleChange("camera", v)}
            assetSuggestions={assetStore.cameras.map((c) => c.alias || `${c.brand} ${c.model}`)}
            source={sources?.camera ?? null}
          />
          <IdentityField
            label="镜头"
            value={identityOverride?.lens ?? ""}
            effectiveValue={effectiveIdentity.lens}
            placeholder="例如：Voigtlander 35mm F1.4"
            onChange={(v) => handleChange("lens", v)}
            assetSuggestions={assetStore.lenses.map((l) => `${l.brand} ${l.model}`)}
            source={sources?.lens ?? null}
          />
          <IdentityField
            label="胶片"
            value={identityOverride?.film ?? ""}
            effectiveValue={effectiveIdentity.film}
            placeholder="例如：Kodak Portra 400"
            onChange={(v) => handleChange("film", v)}
            assetSuggestions={assetStore.films.map((f) => `${f.brand} ${f.name}`)}
            source={sources?.film ?? null}
          />
          <IdentityField
            label="拍摄地点"
            value={identityOverride?.location ?? ""}
            effectiveValue={effectiveIdentity.location}
            placeholder="例如：Kyoto"
            onChange={(v) => handleChange("location", v)}
            assetSuggestions={[]}
            source={sources?.location ?? null}
          />

          {hasOverride && (
            <button type="button" className="ghostButton" onClick={onClearOverride}>
              清除当前图片覆盖
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---- 单个身份字段 ----------------------------------------------------------------

type IdentityFieldProps = {
  readonly label: string
  readonly value: string
  readonly effectiveValue: string
  readonly placeholder: string
  readonly onChange: (value: string) => void
  readonly assetSuggestions: readonly string[]
  /** 字段来源标识（EXIF / 摄影预设 / 每图覆盖）。 */
  readonly source?: IdentityFieldSource | null
}

const IdentityField = ({
  label,
  value,
  effectiveValue,
  placeholder,
  onChange,
  assetSuggestions,
  source
}: IdentityFieldProps): JSX.Element => {
  const isOverridden = value.length > 0
  const datalistId = `identity-suggest-${label}`

  return (
    <div className="settingRow">
      <label className="settingFieldLabel">
        <span>
          {label}
          {isOverridden && <span className="identityFieldOverride"> (覆盖)</span>}
          {source !== null && source !== undefined && (
            <span className={`identityFieldSourceBadge identitySource${source}`}>
              {IDENTITY_SOURCE_LABELS[source]}
            </span>
          )}
          {!isOverridden && source === null && effectiveValue.length > 0 && (
            <span className="identityFieldInherited"> (继承: {effectiveValue})</span>
          )}
        </span>
        <input
          type="text"
          className="settingTextInput"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          list={assetSuggestions.length > 0 ? datalistId : undefined}
        />
        {assetSuggestions.length > 0 && (
          <datalist id={datalistId}>
            {assetSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </label>
    </div>
  )
}
