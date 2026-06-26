import { useCallback, useState } from "react"
import type { PhotoAssetStore, PhotoIdentity, Roll } from "../types"

type PhotoIdentityPanelProps = {
  /** 当前选中图片的有效摄影身份（已合并覆盖 > Roll > 空默认）。 */
  readonly effectiveIdentity: PhotoIdentity
  /** 当前选中图片的每图覆盖（null 表示无覆盖，继承 Roll）。 */
  readonly identityOverride: Partial<PhotoIdentity> | null
  /** 当前选中图片绑定的 Roll ID。 */
  readonly rollId: string | null
  /** Roll 列表。 */
  readonly rolls: readonly Roll[]
  /** 资产库（用于候选选择）。 */
  readonly assetStore: PhotoAssetStore
  /** 更新当前选中图片的覆盖字段。 */
  readonly onUpdateOverride: (patch: Partial<PhotoIdentity>) => void
  /** 清除当前选中图片的全部覆盖。 */
  readonly onClearOverride: () => void
  /** 是否有选中图片。 */
  readonly hasSelectedImage: boolean
}

/**
 * 当前图片摄影信息覆盖面板。
 *
 * 显示当前图片的有效身份（合并结果），允许用户对单张图片设置覆盖。
 * 覆盖字段留空表示继承 Roll。
 */
export const PhotoIdentityPanel = ({
  effectiveIdentity,
  identityOverride,
  rollId,
  rolls,
  assetStore,
  onUpdateOverride,
  onClearOverride,
  hasSelectedImage
}: PhotoIdentityPanelProps): JSX.Element => {
  // 所有 hook 必须在任何条件 return 之前调用（React Hooks 规则）
  const [expanded, setExpanded] = useState(false)

  const handleChange = useCallback((field: keyof PhotoIdentity, value: string): void => {
    onUpdateOverride({ [field]: value })
  }, [onUpdateOverride])

  const boundRoll = rollId !== null ? rolls.find((r) => r.id === rollId) ?? null : null

  if (!hasSelectedImage) {
    return (
      <div className="photoIdentityPanelInner">
        <p className="settingsCapabilityHint">请先选择一张图片。</p>
      </div>
    )
  }

  const hasOverride = identityOverride !== null && Object.values(identityOverride).some((v) => v !== "")

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
          {boundRoll && (
            <span className="identityRollBadge">R: {boundRoll.name}</span>
          )}
          {hasOverride && (
            <span className="identityOverrideBadge">I</span>
          )}
          <span className="identitySummaryText">
            {effectiveIdentity.camera || "未设置相机"}
            {effectiveIdentity.film && ` · ${effectiveIdentity.film}`}
          </span>
        </div>
        <span className="identityExpandToggle">{expanded ? "收起" : "展开"}</span>
      </div>

      {/* 展开后的覆盖编辑区 */}
      {expanded && (
        <div className="identityEditor">
          <p className="settingsCapabilityHint">
            覆盖字段留空表示继承 Roll。{!boundRoll && "当前图片未绑定 Roll。"}
          </p>

          <IdentityField
            label="帧号"
            value={identityOverride?.frameNumber ?? ""}
            effectiveValue={effectiveIdentity.frameNumber}
            placeholder="例如：12"
            onChange={(v) => handleChange("frameNumber", v)}
            assetSuggestions={[]}
          />
          <IdentityField
            label="相机"
            value={identityOverride?.camera ?? ""}
            effectiveValue={effectiveIdentity.camera}
            placeholder="例如：Leica M6"
            onChange={(v) => handleChange("camera", v)}
            assetSuggestions={assetStore.cameras.map((c) => c.alias || `${c.brand} ${c.model}`)}
          />
          <IdentityField
            label="镜头"
            value={identityOverride?.lens ?? ""}
            effectiveValue={effectiveIdentity.lens}
            placeholder="例如：Voigtlander 35mm F1.4"
            onChange={(v) => handleChange("lens", v)}
            assetSuggestions={assetStore.lenses.map((l) => `${l.brand} ${l.model}`)}
          />
          <IdentityField
            label="胶片"
            value={identityOverride?.film ?? ""}
            effectiveValue={effectiveIdentity.film}
            placeholder="例如：Kodak Portra 400"
            onChange={(v) => handleChange("film", v)}
            assetSuggestions={assetStore.films.map((f) => `${f.brand} ${f.name}`)}
          />
          <IdentityField
            label="冲洗工艺"
            value={identityOverride?.developer ?? ""}
            effectiveValue={effectiveIdentity.developer}
            placeholder="例如：C-41"
            onChange={(v) => handleChange("developer", v)}
            assetSuggestions={assetStore.developers.map((d) => d.name)}
          />
          <IdentityField
            label="扫描仪"
            value={identityOverride?.scanner ?? ""}
            effectiveValue={effectiveIdentity.scanner}
            placeholder="例如：Noritsu HS-1800"
            onChange={(v) => handleChange("scanner", v)}
            assetSuggestions={assetStore.scanners.map((s) => `${s.brand} ${s.model}`)}
          />
          <IdentityField
            label="实验室"
            value={identityOverride?.lab ?? ""}
            effectiveValue={effectiveIdentity.lab}
            placeholder="例如：Local Lab"
            onChange={(v) => handleChange("lab", v)}
            assetSuggestions={assetStore.labs.map((l) => l.name)}
          />
          <IdentityField
            label="拍摄地点"
            value={identityOverride?.location ?? ""}
            effectiveValue={effectiveIdentity.location}
            placeholder="例如：Kyoto"
            onChange={(v) => handleChange("location", v)}
            assetSuggestions={[]}
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
}

const IdentityField = ({
  label,
  value,
  effectiveValue,
  placeholder,
  onChange,
  assetSuggestions
}: IdentityFieldProps): JSX.Element => {
  const isOverridden = value.length > 0
  const datalistId = `identity-suggest-${label}`

  return (
    <div className="settingRow">
      <label className="settingFieldLabel">
        <span>
          {label}
          {isOverridden && <span className="identityFieldOverride"> (覆盖)</span>}
          {!isOverridden && effectiveValue.length > 0 && (
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
