/**
 * 快速出图模式模板画廊。
 *
 * 首屏展示精选模板卡片（QUICK_GALLERY_TEMPLATE_IDS），
 * 每张卡片包含：真实布局缩略图、适用场景（description）、信息字段（fields）、
 * 「推荐」标记（由确定性推荐规则给出，仅提示不修改用户设置）。
 *
 * 摄影信息卡卡片额外提供「布局 / 边框」变体切换（底部居中/左下 × 白/黑），
 * 一键在 PHOTO_INFO_CARD_TEMPLATE_IDS 的四个变体间切换。
 */

import { BUILT_IN_TEMPLATES, PHOTO_INFO_CARD_TEMPLATE_IDS, QUICK_GALLERY_TEMPLATE_IDS } from "../../template/presets/builtInTemplates"
import type { BuiltInTemplate } from "../../template/presets/builtInTemplates"
import { TemplateThumbnail } from "../../template/components/TemplateThumbnail"
import { LiveTemplateThumbnail } from "../../template/components/LiveTemplateThumbnail"
import { normalizeTemplatePatch } from "../../template/utils/normalizeTemplate"
import type { RenderSettings } from "../../settings/types"

type QuickTemplateGalleryProps = {
  /** 当前活跃的内置模板 id（选中态与信息卡变体态）。 */
  readonly activePresetId: string | null
  /** 推荐模板 id（确定性规则给出；只标记，不自动应用）。 */
  readonly recommendedTemplateId: string | null
  /** 当前预览照片（实时缩略图用；null 时回退 CSS 布局示意）。 */
  readonly currentImage: HTMLImageElement | null
  /** 当前渲染设置（与模板 patch 合并后供实时缩略图使用）。 */
  readonly currentSettings: RenderSettings
  /** 应用某个内置模板 patch。点击后中间预览立即更新（同一渲染器）。 */
  readonly onApply: (patch: Partial<RenderSettings>) => void
  /** 应用摄影信息卡指定变体。 */
  readonly onApplyInfoCardVariant: (variantId: string) => void
}

/** 模板 patch 与当前设置合并后的「已渲染态」（与主预览同一配置）。 */
const mergedSettingsFor = (currentSettings: RenderSettings, template: BuiltInTemplate): RenderSettings =>
  ({ ...currentSettings, ...normalizeTemplatePatch(template.settingsPatch) })

/** 摄影信息卡变体分组映射：变体 id -> 布局/边框。 */
const INFO_CARD_VARIANTS: readonly {
  readonly id: string
  readonly layout: "center" | "left"
  readonly border: "white" | "black"
}[] = [
  { id: PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite, layout: "center", border: "white" },
  { id: PHOTO_INFO_CARD_TEMPLATE_IDS.centerBlack, layout: "center", border: "black" },
  { id: PHOTO_INFO_CARD_TEMPLATE_IDS.leftWhite, layout: "left", border: "white" },
  { id: PHOTO_INFO_CARD_TEMPLATE_IDS.leftBlack, layout: "left", border: "black" },
]

const isInfoCardVariant = (id: string | null): boolean =>
  id !== null && INFO_CARD_VARIANTS.some((v) => v.id === id)

const findTemplate = (id: string): BuiltInTemplate | undefined =>
  BUILT_IN_TEMPLATES.find((t) => t.id === id)

/** 单个普通模板卡片。 */
const TemplateCard = ({
  template,
  isActive,
  isRecommended,
  currentImage,
  currentSettings,
  onApply
}: {
  readonly template: BuiltInTemplate
  readonly isActive: boolean
  readonly isRecommended: boolean
  readonly currentImage: HTMLImageElement | null
  readonly currentSettings: RenderSettings
  readonly onApply: (template: BuiltInTemplate) => void
}): JSX.Element => (
  <div className={`quickTemplateCard${isActive ? " quickTemplateCardActive" : ""}`}>
    {isRecommended && (
      <span className="quickTemplateRecommendBadge">推荐</span>
    )}
    {currentImage !== null ? (
      <LiveTemplateThumbnail image={currentImage} settings={mergedSettingsFor(currentSettings, template)} />
    ) : (
      <TemplateThumbnail thumb={template.thumb} className="quickTemplateThumb" />
    )}
    <div className="quickTemplateCaption">
      <span className="quickTemplateName">{template.name}</span>
      <span className="quickTemplateDesc">{template.description}</span>
      {(template.fields?.length ?? 0) > 0 && (
        <span className="quickTemplateFields">
          {template.fields!.map((field) => (
            <span key={field} className="quickTemplateFieldChip">{field}</span>
          ))}
        </span>
      )}
    </div>
    <button
      type="button"
      className={`quickTemplateApplyButton${isActive ? " quickTemplateApplyActive" : ""}`}
      onClick={() => onApply(template)}
    >
      {isActive ? "已应用" : "使用"}
    </button>
  </div>
)

/** 摄影信息卡卡片（带布局/边框变体切换）。 */
const InfoCardTemplateCard = ({
  activePresetId,
  recommendedTemplateId,
  currentImage,
  currentSettings,
  onApplyInfoCardVariant
}: {
  readonly activePresetId: string | null
  readonly recommendedTemplateId: string | null
  readonly currentImage: HTMLImageElement | null
  readonly currentSettings: RenderSettings
  readonly onApplyInfoCardVariant: (variantId: string) => void
}): JSX.Element => {
  const baseTemplate = findTemplate(PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite)!
  const baseMerged = mergedSettingsFor(currentSettings, baseTemplate)
  const activeVariant = isInfoCardVariant(activePresetId) ? activePresetId! : PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite
  const layout = INFO_CARD_VARIANTS.find((v) => v.id === activeVariant)?.layout ?? "center"
  const border = INFO_CARD_VARIANTS.find((v) => v.id === activeVariant)?.border ?? "white"
  const isActive = isInfoCardVariant(activePresetId)
  const isRecommended = recommendedTemplateId === "photo-info-card"

  return (
    <div className={`quickTemplateCard quickInfoCardCard${isActive ? " quickTemplateCardActive" : ""}`}>
      {isRecommended && (
        <span className="quickTemplateRecommendBadge">推荐</span>
      )}
      {currentImage !== null ? (
        <LiveTemplateThumbnail image={currentImage} settings={baseMerged} />
      ) : (
        <TemplateThumbnail thumb={baseTemplate.thumb} className="quickTemplateThumb" />
      )}
      <div className="quickTemplateCaption">
        <span className="quickTemplateName">{baseTemplate.name}</span>
        <span className="quickTemplateDesc">{baseTemplate.description}</span>
        <span className="quickTemplateFields">
          {(baseTemplate.fields ?? []).map((field) => (
            <span key={field} className="quickTemplateFieldChip">{field}</span>
          ))}
        </span>
      </div>
      <div className="quickInfoCardVariants">
        <span className="quickInfoCardVariantLabel">布局</span>
        <div className="quickInfoCardVariantGroup">
          <button
            type="button"
            className={`quickInfoCardVariantBtn${layout === "center" ? " quickInfoCardVariantActive" : ""}`}
            onClick={() => {
              const target = border === "white" ? PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite : PHOTO_INFO_CARD_TEMPLATE_IDS.centerBlack
              onApplyInfoCardVariant(target)
            }}
          >
            底部居中
          </button>
          <button
            type="button"
            className={`quickInfoCardVariantBtn${layout === "left" ? " quickInfoCardVariantActive" : ""}`}
            onClick={() => {
              const target = border === "white" ? PHOTO_INFO_CARD_TEMPLATE_IDS.leftWhite : PHOTO_INFO_CARD_TEMPLATE_IDS.leftBlack
              onApplyInfoCardVariant(target)
            }}
          >
            左下
          </button>
        </div>
        <span className="quickInfoCardVariantLabel">边框</span>
        <div className="quickInfoCardVariantGroup">
          <button
            type="button"
            className={`quickInfoCardVariantBtn${border === "white" ? " quickInfoCardVariantActive" : ""}`}
            onClick={() => {
              const target = layout === "center" ? PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite : PHOTO_INFO_CARD_TEMPLATE_IDS.leftWhite
              onApplyInfoCardVariant(target)
            }}
          >
            白边
          </button>
          <button
            type="button"
            className={`quickInfoCardVariantBtn${border === "black" ? " quickInfoCardVariantActive" : ""}`}
            onClick={() => {
              const target = layout === "center" ? PHOTO_INFO_CARD_TEMPLATE_IDS.centerBlack : PHOTO_INFO_CARD_TEMPLATE_IDS.leftBlack
              onApplyInfoCardVariant(target)
            }}
          >
            黑边
          </button>
        </div>
      </div>
      <button
        type="button"
        className={`quickTemplateApplyButton${isActive ? " quickTemplateApplyActive" : ""}`}
        onClick={() => onApplyInfoCardVariant(isInfoCardVariant(activePresetId) ? activePresetId! : PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite)}
      >
        {isActive ? "已应用" : "使用"}
      </button>
    </div>
  )
}

export const QuickTemplateGallery = ({
  activePresetId,
  recommendedTemplateId,
  currentImage,
  currentSettings,
  onApply,
  onApplyInfoCardVariant
}: QuickTemplateGalleryProps): JSX.Element => {
  return (
    <section className="quickTemplateGallery" aria-label="选择模板">
      <div className="quickTemplateGalleryHeader">
        <span className="quickTemplateGalleryTitle">选择模板</span>
        <span className="quickTemplateGalleryHint">
          {recommendedTemplateId !== null
            ? `根据这张照片推荐「${findTemplate(recommendedTemplateId)?.name ?? ""}」`
            : "导入照片后自动套用摄影信息卡"}
        </span>
      </div>
      <div className="quickTemplateGalleryStrip">
        {QUICK_GALLERY_TEMPLATE_IDS.map((id) => {
          if (id === PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite) {
            return (
              <InfoCardTemplateCard
                key={id}
                activePresetId={activePresetId}
                recommendedTemplateId={recommendedTemplateId}
                currentImage={currentImage}
                currentSettings={currentSettings}
                onApplyInfoCardVariant={onApplyInfoCardVariant}
              />
            )
          }
          const template = findTemplate(id)
          if (template === undefined) {
            return null
          }
          return (
            <TemplateCard
              key={id}
              template={template}
              isActive={activePresetId === id}
              isRecommended={recommendedTemplateId === id}
              currentImage={currentImage}
              currentSettings={currentSettings}
              onApply={() => onApply(template.settingsPatch)}
            />
          )
        })}
      </div>
    </section>
  )
}
