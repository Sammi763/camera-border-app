import type { PhotoIdentity } from "../types"
import { captureFormatLabel } from "../constants/captureFormats"
import { IDENTITY_SOURCE_LABELS } from "../utils/resolveIdentityFieldSources"
import type { IdentitySourceMap, IdentityFieldSource } from "../utils/resolveIdentityFieldSources"

type PhotoInfoSummaryProps = {
  readonly effectiveIdentity: PhotoIdentity
  readonly sources: IdentitySourceMap
  /**
   * 当前照片 EXIF 读取状态（U12）：区分「正在读取」「未包含拍摄信息」
   * 「读取失败」，不再用连续的「未设置」掩盖真实原因。缺省时保持原行为。
   */
  readonly exifState?: PhotoInfoExifState | null
  /** 读取失败后的重试入口。 */
  readonly onRetryExif?: () => void
}

export type PhotoInfoExifState =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly message: string }
  | { readonly status: "empty" }

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
export const PhotoInfoSummary = ({ effectiveIdentity, sources, exifState = null, onRetryExif = undefined }: PhotoInfoSummaryProps): JSX.Element => {
  const identityAllEmpty = effectiveIdentity.camera.trim().length === 0
    && effectiveIdentity.lens.trim().length === 0
    && effectiveIdentity.film.trim().length === 0
    && effectiveIdentity.captureFormat.trim().length === 0
  return (
    <section className="photoInfoSummary" aria-label="摄影信息摘要">
      <div className="photoInfoSummaryHeading">当前照片</div>
      {exifState !== null && exifState.status === "loading" && (
        <p className="photoInfoExifStatus" role="status" data-testid="photo-info-exif-status">正在读取拍摄信息…</p>
      )}
      {exifState !== null && exifState.status === "failed" && (
        <div className="photoInfoExifStatus photoInfoExifFailed" role="alert" data-testid="photo-info-exif-status">
          <span>拍摄信息读取失败：{exifState.message}</span>
          {onRetryExif !== undefined && (
            <button type="button" className="ghostButton photoInfoExifRetry" onClick={onRetryExif}>重试读取</button>
          )}
        </div>
      )}
      {exifState !== null && exifState.status === "empty" && identityAllEmpty && (
        <p className="photoInfoExifStatus" role="status" data-testid="photo-info-exif-status">
          引擎已检查：这张照片未包含拍摄信息。可直接补充或选择预设。
        </p>
      )}
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
        {effectiveIdentity.fNumber?.trim().length ? <span>光圈：{effectiveIdentity.fNumber}</span> : null}
        {effectiveIdentity.exposureTime?.trim().length ? <span>快门：{effectiveIdentity.exposureTime}</span> : null}
        {effectiveIdentity.iso?.trim().length ? <span>ISO：{effectiveIdentity.iso}</span> : null}
        {effectiveIdentity.focalLength?.trim().length ? <span>焦距：{effectiveIdentity.focalLength}</span> : null}
      </div>
    </section>
  )
}
