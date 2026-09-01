import type { PhotoIdentity } from "../types"
import { captureFormatLabel } from "../constants/captureFormats"
import { IDENTITY_SOURCE_LABELS } from "../utils/resolveIdentityFieldSources"
import type { IdentitySourceMap, IdentityFieldSource } from "../utils/resolveIdentityFieldSources"

type PhotoInfoSummaryProps = {
  readonly effectiveIdentity: PhotoIdentity
  readonly sources: IdentitySourceMap
}

const Value = ({
  value,
  source
}: {
  readonly value: string
  readonly source: IdentityFieldSource | null
}): JSX.Element => (
  <span className={`photoInfoValue${value.trim().length === 0 ? " photoInfoValueEmpty" : ""}`}>
    {value.trim().length === 0 ? "未设置" : value}
    {source !== null && (
      <span className={`identitySourceBadge identitySource${source}`}>
        {IDENTITY_SOURCE_LABELS[source]}
      </span>
    )}
  </span>
)

/** 当前照片的只读身份摘要；详细覆盖编辑仍由 PhotoIdentityPanel 负责。 */
export const PhotoInfoSummary = ({ effectiveIdentity, sources }: PhotoInfoSummaryProps): JSX.Element => (
  <section className="photoInfoSummary" aria-label="摄影信息摘要">
    <div className="photoInfoSummaryHeading">当前照片</div>
    <div className="photoInfoIdentityLine">
      <Value value={effectiveIdentity.camera} source={sources.camera} />
      <span className="photoInfoSeparator" aria-hidden="true">·</span>
      <Value value={effectiveIdentity.lens} source={sources.lens} />
      <span className="photoInfoSeparator" aria-hidden="true">·</span>
      <Value value={effectiveIdentity.film} source={sources.film} />
    </div>
    <div className="photoInfoMetaLine">
      <span>
        画幅：{captureFormatLabel(effectiveIdentity.captureFormat) || "未设置"}
        {sources.captureFormat !== null && (
          <span className={`identitySourceBadge identitySource${sources.captureFormat}`}>
            {IDENTITY_SOURCE_LABELS[sources.captureFormat]}
          </span>
        )}
      </span>
      {effectiveIdentity.location.trim().length > 0 && <span>地点：{effectiveIdentity.location}</span>}
      {effectiveIdentity.frameNumber.trim().length > 0 && <span>帧号：{effectiveIdentity.frameNumber}</span>}
    </div>
  </section>
)
