import { BUILT_IN_TEMPLATES, PHOTO_INFO_CARD_TEMPLATE_IDS, QUICK_GALLERY_TEMPLATE_IDS } from "../presets/builtInTemplates"
import type { BuiltInTemplate } from "../presets/builtInTemplates"
import { TemplateThumbnail } from "./TemplateThumbnail"
import { LiveTemplateThumbnail } from "./LiveTemplateThumbnail"
import { normalizeTemplatePatch } from "../utils/normalizeTemplate"
import type { RenderSettings } from "../../settings/types"

type TemplateGalleryProps = {
  readonly activePresetId: string | null
  readonly recommendedTemplateId: string | null
  readonly currentImage: HTMLImageElement | null
  readonly currentSettings: RenderSettings
  readonly onApply: (patch: Partial<RenderSettings>) => void
  readonly onApplyInfoCardVariant: (variantId: string) => void
}

const INFO_CARD_VARIANTS: readonly {
  readonly id: string
  readonly layout: "center" | "left"
  readonly border: "white" | "black"
}[] = [
  { id: PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite, layout: "center", border: "white" },
  { id: PHOTO_INFO_CARD_TEMPLATE_IDS.centerBlack, layout: "center", border: "black" },
  { id: PHOTO_INFO_CARD_TEMPLATE_IDS.leftWhite, layout: "left", border: "white" },
  { id: PHOTO_INFO_CARD_TEMPLATE_IDS.leftBlack, layout: "left", border: "black" }
]

const isInfoCardVariant = (id: string | null): boolean =>
  id !== null && INFO_CARD_VARIANTS.some((variant) => variant.id === id)

const findTemplate = (id: string): BuiltInTemplate | undefined => BUILT_IN_TEMPLATES.find((template) => template.id === id)

/** 精选项排在前面，其余内置版式继续在同一画廊中可用，不再维护第二个入口。 */
const GALLERY_TEMPLATE_IDS: readonly string[] = [
  ...new Set([...QUICK_GALLERY_TEMPLATE_IDS, ...BUILT_IN_TEMPLATES.map((template) => template.id)])
].filter((id) => id === PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite || !isInfoCardVariant(id))

const mergedSettingsFor = (currentSettings: RenderSettings, template: BuiltInTemplate): RenderSettings => ({
  ...currentSettings,
  ...normalizeTemplatePatch(template.settingsPatch)
})

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
  <article className={`templateGalleryCard${isActive ? " templateGalleryCardActive" : ""}`}>
    {isRecommended && <span className="templateGalleryRecommendBadge">推荐</span>}
    {currentImage !== null ? (
      <LiveTemplateThumbnail image={currentImage} settings={mergedSettingsFor(currentSettings, template)} />
    ) : (
      <TemplateThumbnail thumb={template.thumb} className="templateGalleryThumb" />
    )}
    <div className="templateGalleryCaption">
      <span className="templateGalleryName">{template.name}</span>
      <span className="templateGalleryDesc">{template.description}</span>
      {(template.fields?.length ?? 0) > 0 && (
        <span className="templateGalleryFields">
          {template.fields!.map((field) => <span key={field} className="templateGalleryFieldChip">{field}</span>)}
        </span>
      )}
    </div>
    <button
      type="button"
      className={`templateGalleryApplyButton${isActive ? " templateGalleryApplyActive" : ""}`}
      onClick={() => onApply(template)}
    >
      {isActive ? "已应用" : "应用"}
    </button>
  </article>
)

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
  const baseTemplate = findTemplate(PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite)
  if (baseTemplate === undefined) {
    return <div className="templateGalleryCard" />
  }
  const activeVariant = isInfoCardVariant(activePresetId) ? activePresetId : PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite
  const variant = INFO_CARD_VARIANTS.find((candidate) => candidate.id === activeVariant) ?? INFO_CARD_VARIANTS[0]!
  const isActive = isInfoCardVariant(activePresetId)

  return (
    <article className={`templateGalleryCard templateGalleryInfoCard${isActive ? " templateGalleryCardActive" : ""}`}>
      {recommendedTemplateId === "photo-info-card" && <span className="templateGalleryRecommendBadge">推荐</span>}
      {currentImage !== null ? (
        <LiveTemplateThumbnail image={currentImage} settings={mergedSettingsFor(currentSettings, baseTemplate)} />
      ) : (
        <TemplateThumbnail thumb={baseTemplate.thumb} className="templateGalleryThumb" />
      )}
      <div className="templateGalleryCaption">
        <span className="templateGalleryName">{baseTemplate.name}</span>
        <span className="templateGalleryDesc">{baseTemplate.description}</span>
        <span className="templateGalleryFields">
          {(baseTemplate.fields ?? []).map((field) => <span key={field} className="templateGalleryFieldChip">{field}</span>)}
        </span>
      </div>
      <div className="templateGalleryVariantGroup">
        <span className="templateGalleryVariantLabel">布局</span>
        <div className="templateGalleryVariantButtons">
          <button
            type="button"
            className={`templateGalleryVariantButton${variant.layout === "center" ? " templateGalleryVariantActive" : ""}`}
            onClick={() => onApplyInfoCardVariant(variant.border === "white" ? PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite : PHOTO_INFO_CARD_TEMPLATE_IDS.centerBlack)}
          >
            底部居中
          </button>
          <button
            type="button"
            className={`templateGalleryVariantButton${variant.layout === "left" ? " templateGalleryVariantActive" : ""}`}
            onClick={() => onApplyInfoCardVariant(variant.border === "white" ? PHOTO_INFO_CARD_TEMPLATE_IDS.leftWhite : PHOTO_INFO_CARD_TEMPLATE_IDS.leftBlack)}
          >
            左下
          </button>
        </div>
        <span className="templateGalleryVariantLabel">边框</span>
        <div className="templateGalleryVariantButtons">
          <button
            type="button"
            className={`templateGalleryVariantButton${variant.border === "white" ? " templateGalleryVariantActive" : ""}`}
            onClick={() => onApplyInfoCardVariant(variant.layout === "center" ? PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite : PHOTO_INFO_CARD_TEMPLATE_IDS.leftWhite)}
          >
            白边
          </button>
          <button
            type="button"
            className={`templateGalleryVariantButton${variant.border === "black" ? " templateGalleryVariantActive" : ""}`}
            onClick={() => onApplyInfoCardVariant(variant.layout === "center" ? PHOTO_INFO_CARD_TEMPLATE_IDS.centerBlack : PHOTO_INFO_CARD_TEMPLATE_IDS.leftBlack)}
          >
            黑边
          </button>
        </div>
      </div>
      <button
        type="button"
        className={`templateGalleryApplyButton${isActive ? " templateGalleryApplyActive" : ""}`}
        onClick={() => onApplyInfoCardVariant(isActive ? activePresetId! : PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite)}
      >
        {isActive ? "已应用" : "应用"}
      </button>
    </article>
  )
}

/** 样式页签中的精选模板画廊；它不再占用预览区域下方的固定高度。 */
export const TemplateGallery = ({
  activePresetId,
  recommendedTemplateId,
  currentImage,
  currentSettings,
  onApply,
  onApplyInfoCardVariant
}: TemplateGalleryProps): JSX.Element => (
  <section className="templateGallery" aria-label="选择模板">
    <div className="templateGalleryHeader">
      <div>
        <h3 className="templateGalleryTitle">版式画廊</h3>
        <p className="templateGalleryHint">
          {recommendedTemplateId !== null
            ? `根据这张照片推荐「${findTemplate(recommendedTemplateId)?.name ?? ""}」`
            : "导入照片后自动套用摄影信息卡"}
        </p>
      </div>
    </div>
    <div className="templateGalleryGrid">
      {GALLERY_TEMPLATE_IDS.map((id) => id === PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite
        ? (
          <InfoCardTemplateCard
            key={id}
            activePresetId={activePresetId}
            recommendedTemplateId={recommendedTemplateId}
            currentImage={currentImage}
            currentSettings={currentSettings}
            onApplyInfoCardVariant={onApplyInfoCardVariant}
          />
        )
        : (() => {
          const template = findTemplate(id)
          return template === undefined ? null : (
            <TemplateCard
              key={id}
              template={template}
              isActive={activePresetId === id}
              isRecommended={recommendedTemplateId === id}
              currentImage={currentImage}
              currentSettings={currentSettings}
              onApply={(selectedTemplate) => onApply(selectedTemplate.settingsPatch)}
            />
          )
        })()
      )}
    </div>
  </section>
)
