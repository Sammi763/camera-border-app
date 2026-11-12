import { memo, useCallback, useId, useMemo, useState } from "react"
import { BUILT_IN_TEMPLATES, FEATURED_GALLERY_TEMPLATE_IDS, PHOTO_INFO_CARD_TEMPLATE_IDS } from "../presets/builtInTemplates"
import type { BuiltInTemplate } from "../presets/builtInTemplates"
import { TemplateThumbnail } from "./TemplateThumbnail"
import { LiveTemplateThumbnail, MAX_RENDER_DIM } from "./LiveTemplateThumbnail"
import { normalizeTemplatePatch } from "../utils/normalizeTemplate"
import type { CanvasDrawableSource } from "../../preview/canvas/canvasRenderer"
import type { RenderSettings } from "../../settings/types"

type TemplateGalleryProps = {
  readonly activePresetId: string | null
  readonly recommendedTemplateId: string | null
  readonly currentImage: HTMLImageElement | null
  /** 已按当前图片解析过的有效渲染设置（变量/覆盖/品牌），与主预览同源（U03）。 */
  readonly currentSettings: RenderSettings
  /** 当前照片的原图像素事实（与主预览同源）；缺省时缩略图退化为代理图语义。 */
  readonly sourceDimensions?: { readonly width: number; readonly height: number } | null
  readonly onApply: (patch: Partial<RenderSettings>) => void
  readonly onApplyInfoCardVariant: (variantId: string) => void
}

type InfoCardVariant = {
  readonly id: string
  readonly layout: "center" | "left"
  readonly border: "white" | "black"
}

const INFO_CARD_VARIANTS: readonly InfoCardVariant[] = [
  { id: PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite, layout: "center", border: "white" },
  { id: PHOTO_INFO_CARD_TEMPLATE_IDS.centerBlack, layout: "center", border: "black" },
  { id: PHOTO_INFO_CARD_TEMPLATE_IDS.leftWhite, layout: "left", border: "white" },
  { id: PHOTO_INFO_CARD_TEMPLATE_IDS.leftBlack, layout: "left", border: "black" }
]

const isInfoCardVariant = (id: string | null): id is string =>
  id !== null && INFO_CARD_VARIANTS.some((variant) => variant.id === id)

/** 未应用摄影信息卡时，缩略图与应用按钮都回退到默认白边居中变体。 */
const resolveInfoCardVariant = (id: string | null): InfoCardVariant =>
  INFO_CARD_VARIANTS.find((variant) => variant.id === id) ?? INFO_CARD_VARIANTS[0]!

const findTemplate = (id: string): BuiltInTemplate | undefined => BUILT_IN_TEMPLATES.find((template) => template.id === id)

/** 精选项排在前面，其余内置版式继续在同一画廊中可用，不再维护第二个入口。 */
const GALLERY_TEMPLATE_IDS: readonly string[] = [
  ...new Set([...FEATURED_GALLERY_TEMPLATE_IDS, ...BUILT_IN_TEMPLATES.map((template) => template.id)])
].filter((id) => id === PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite || !isInfoCardVariant(id))

/** 「展开全部版式」偏好：记住用户选择，跨会话保持（U10）。 */
const GALLERY_EXPANDED_STORAGE_KEY = "camborder.gallery.showAllTemplates"

const readExpandedPreference = (): boolean => {
  try {
    return window.localStorage.getItem(GALLERY_EXPANDED_STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

const mergedSettingsFor = (currentSettings: RenderSettings, template: BuiltInTemplate): RenderSettings => ({
  ...currentSettings,
  ...normalizeTemplatePatch(template.settingsPatch)
})

/**
 * 卡片详情：说明与字段标签默认收起，按钮只切换自身展开状态，不触发应用。
 * 每张卡使用 useId 生成唯一的详情区域 id，供 aria-controls 引用。
 */
const TemplateDetails = memo(function TemplateDetails({
  description,
  fields
}: {
  readonly description: string
  readonly fields?: readonly string[] | undefined
}): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)
  const detailsId = useId()

  return (
    <>
      <button
        type="button"
        className="templateGalleryDetailsButton"
        aria-expanded={isExpanded}
        aria-controls={detailsId}
        onClick={() => setIsExpanded((previous) => !previous)}
      >
        {isExpanded ? "收起详情" : "详情"}
      </button>
      <div id={detailsId} className="templateGalleryDetails" hidden={!isExpanded}>
        {isExpanded && (
          <>
            <span className="templateGalleryDesc">{description}</span>
            {(fields?.length ?? 0) > 0 && (
              <span className="templateGalleryFields">
                {fields!.map((field) => <span key={field} className="templateGalleryFieldChip">{field}</span>)}
              </span>
            )}
          </>
        )}
      </div>
    </>
  )
})

/** 卡片组件 memo 化（U08）：合并后的设置引用稳定时，无关状态变化不再触发全部卡片重绘。 */
const TemplateCard = memo(function TemplateCard({
  template,
  isActive,
  isRecommended,
  currentImage,
  currentSettings,
  sourceDimensions,
  sharedDrawable,
  onApply
}: {
  readonly template: BuiltInTemplate
  readonly isActive: boolean
  readonly isRecommended: boolean
  readonly currentImage: HTMLImageElement | null
  readonly currentSettings: RenderSettings
  readonly sourceDimensions: { readonly width: number; readonly height: number } | null
  readonly sharedDrawable: CanvasDrawableSource | null
  readonly onApply: (template: BuiltInTemplate) => void
}): JSX.Element {
  const mergedSettings = useMemo(
    () => mergedSettingsFor(currentSettings, template),
    [currentSettings, template]
  )
  return (
    <article className={`templateGalleryCard${isActive ? " templateGalleryCardActive" : ""}`}>
      {isRecommended && <span className="templateGalleryRecommendBadge">推荐</span>}
      {currentImage !== null ? (
        <LiveTemplateThumbnail
          image={currentImage}
          settings={mergedSettings}
          sourceDimensions={sourceDimensions}
          sharedDrawable={sharedDrawable}
        />
      ) : (
        <TemplateThumbnail thumb={template.thumb} className="templateGalleryThumb" />
      )}
      <div className="templateGalleryCaption">
        <span className="templateGalleryName">{template.name}</span>
        <TemplateDetails description={template.description} fields={template.fields} />
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
})

const InfoCardTemplateCard = memo(function InfoCardTemplateCard({
  activePresetId,
  recommendedTemplateId,
  currentImage,
  currentSettings,
  sourceDimensions,
  sharedDrawable,
  onApplyInfoCardVariant
}: {
  readonly activePresetId: string | null
  readonly recommendedTemplateId: string | null
  readonly currentImage: HTMLImageElement | null
  readonly currentSettings: RenderSettings
  readonly sourceDimensions: { readonly width: number; readonly height: number } | null
  readonly sharedDrawable: CanvasDrawableSource | null
  readonly onApplyInfoCardVariant: (variantId: string) => void
}): JSX.Element {
  const baseTemplate = findTemplate(PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite)
  const isActive = isInfoCardVariant(activePresetId)
  const variant = resolveInfoCardVariant(activePresetId)
  // U03：缩略图必须使用当前选中变体的实际配置（黑边/白边、居中/左下），
  // 不再固定使用基础白边版式。hooks 必须在条件返回之前调用。
  const variantTemplate = baseTemplate === undefined ? null : (findTemplate(variant.id) ?? baseTemplate)
  const mergedSettings = useMemo(
    () => variantTemplate === null ? null : mergedSettingsFor(currentSettings, variantTemplate),
    [currentSettings, variantTemplate]
  )
  if (baseTemplate === undefined || variantTemplate === null || mergedSettings === null) {
    return <div className="templateGalleryCard" />
  }

  return (
    <article className={`templateGalleryCard templateGalleryInfoCard${isActive ? " templateGalleryCardActive" : ""}`}>
      {recommendedTemplateId === "photo-info-card" && <span className="templateGalleryRecommendBadge">推荐</span>}
      {currentImage !== null ? (
        <LiveTemplateThumbnail
          image={currentImage}
          settings={mergedSettings}
          sourceDimensions={sourceDimensions}
          sharedDrawable={sharedDrawable}
        />
      ) : (
        <TemplateThumbnail thumb={baseTemplate.thumb} className="templateGalleryThumb" />
      )}
      <div className="templateGalleryCaption">
        <span className="templateGalleryName">{baseTemplate.name}</span>
        <TemplateDetails description={baseTemplate.description} fields={baseTemplate.fields} />
      </div>
      <button
        type="button"
        className={`templateGalleryApplyButton${isActive ? " templateGalleryApplyActive" : ""}`}
        onClick={() => onApplyInfoCardVariant(
          isInfoCardVariant(activePresetId) ? activePresetId : PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite
        )}
      >
        {isActive ? "已应用" : "应用"}
      </button>
    </article>
  )
})

/**
 * 摄影信息卡的布局／边框设置已移出卡片，作为画廊网格下方的独立分组。
 * 仅在已应用摄影信息卡（activePresetId 属于四个变体之一）时由父组件渲染。
 */
const InfoCardVariantSettings = memo(function InfoCardVariantSettings({
  activePresetId,
  onApplyInfoCardVariant
}: {
  readonly activePresetId: string
  readonly onApplyInfoCardVariant: (variantId: string) => void
}): JSX.Element {
  const titleId = useId()
  const variant = resolveInfoCardVariant(activePresetId)

  // 切换布局时沿用当前边框，切换边框时沿用当前布局。
  const layoutVariantId = (layout: InfoCardVariant["layout"]): string =>
    layout === "center"
      ? (variant.border === "white" ? PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite : PHOTO_INFO_CARD_TEMPLATE_IDS.centerBlack)
      : (variant.border === "white" ? PHOTO_INFO_CARD_TEMPLATE_IDS.leftWhite : PHOTO_INFO_CARD_TEMPLATE_IDS.leftBlack)

  const borderVariantId = (border: InfoCardVariant["border"]): string =>
    border === "white"
      ? (variant.layout === "center" ? PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite : PHOTO_INFO_CARD_TEMPLATE_IDS.leftWhite)
      : (variant.layout === "center" ? PHOTO_INFO_CARD_TEMPLATE_IDS.centerBlack : PHOTO_INFO_CARD_TEMPLATE_IDS.leftBlack)

  return (
    <section className="templateGalleryLayoutSettings" aria-labelledby={titleId}>
      <h4 id={titleId} className="templateGalleryLayoutSettingsTitle">当前版式设置</h4>
      <div className="templateGalleryLayoutSettingsControls">
        <div className="templateGalleryVariantGroup">
          <span className="templateGalleryVariantLabel">布局</span>
          <div className="templateGalleryVariantButtons">
            <button
              type="button"
              className={`templateGalleryVariantButton${variant.layout === "center" ? " templateGalleryVariantActive" : ""}`}
              aria-pressed={variant.layout === "center"}
              onClick={() => onApplyInfoCardVariant(layoutVariantId("center"))}
            >
              底部居中
            </button>
            <button
              type="button"
              className={`templateGalleryVariantButton${variant.layout === "left" ? " templateGalleryVariantActive" : ""}`}
              aria-pressed={variant.layout === "left"}
              onClick={() => onApplyInfoCardVariant(layoutVariantId("left"))}
            >
              左下
            </button>
          </div>
        </div>
        <div className="templateGalleryVariantGroup">
          <span className="templateGalleryVariantLabel">边框</span>
          <div className="templateGalleryVariantButtons">
            <button
              type="button"
              className={`templateGalleryVariantButton${variant.border === "white" ? " templateGalleryVariantActive" : ""}`}
              aria-pressed={variant.border === "white"}
              onClick={() => onApplyInfoCardVariant(borderVariantId("white"))}
            >
              白边
            </button>
            <button
              type="button"
              className={`templateGalleryVariantButton${variant.border === "black" ? " templateGalleryVariantActive" : ""}`}
              aria-pressed={variant.border === "black"}
              onClick={() => onApplyInfoCardVariant(borderVariantId("black"))}
            >
              黑边
            </button>
          </div>
        </div>
      </div>
    </section>
  )
})

/** 样式页签中的精选模板画廊；它不再占用预览区域下方的固定高度。 */
const TemplateGalleryView = ({
  activePresetId,
  recommendedTemplateId,
  currentImage,
  currentSettings,
  sourceDimensions = null,
  onApply,
  onApplyInfoCardVariant
}: TemplateGalleryProps): JSX.Element => {
  // U08：同一照片的缩小位图只建立一次，各卡片共享，不再逐卡创建离屏画布。
  const sharedDrawable = useMemo<CanvasDrawableSource | null>(() => {
    if (currentImage === null) {
      return null
    }
    const largest = Math.max(currentImage.naturalWidth, currentImage.naturalHeight)
    if (largest <= MAX_RENDER_DIM || largest <= 0) {
      return currentImage
    }
    const k = MAX_RENDER_DIM / largest
    const off = document.createElement("canvas")
    off.width = Math.max(1, Math.round(currentImage.naturalWidth * k))
    off.height = Math.max(1, Math.round(currentImage.naturalHeight * k))
    off.getContext("2d")?.drawImage(currentImage, 0, 0, off.width, off.height)
    return off
  }, [currentImage])

  // U10：默认只展示精选版式（含摄影信息卡），全部版式按需展开并记住偏好。
  const [showAllTemplates, setShowAllTemplates] = useState(readExpandedPreference)
  // 收起状态下，当前已应用的非精选内置模板仍需保留在网格中，
  // 否则收起后卡片与「已应用」状态会一起消失。摄影信息卡变体除外，
  // 它们只通过网格下方的「当前版式设置」分组切换。
  const activeGalleryTemplateId =
    activePresetId !== null
    && !isInfoCardVariant(activePresetId)
    && GALLERY_TEMPLATE_IDS.includes(activePresetId)
      ? activePresetId
      : null
  const visibleTemplateIds = useMemo(() => {
    const featuredTemplateIds = GALLERY_TEMPLATE_IDS
      .filter((id) => FEATURED_GALLERY_TEMPLATE_IDS.includes(id))
    if (showAllTemplates) {
      return GALLERY_TEMPLATE_IDS
    }
    return activeGalleryTemplateId !== null && !featuredTemplateIds.includes(activeGalleryTemplateId)
      ? [...featuredTemplateIds, activeGalleryTemplateId]
      : featuredTemplateIds
  }, [showAllTemplates, activeGalleryTemplateId])
  const hiddenCount = GALLERY_TEMPLATE_IDS.length - GALLERY_TEMPLATE_IDS
    .filter((id) => FEATURED_GALLERY_TEMPLATE_IDS.includes(id)).length

  const toggleExpanded = useCallback((): void => {
    setShowAllTemplates((previous) => {
      const next = !previous
      try {
        window.localStorage.setItem(GALLERY_EXPANDED_STORAGE_KEY, String(next))
      } catch {
        // 持久化失败只影响下次会话的初始状态，不影响本次切换。
      }
      return next
    })
  }, [])

  const applyTemplate = useCallback(
    (template: BuiltInTemplate): void => onApply(template.settingsPatch),
    [onApply]
  )

  return (
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
        <button
          type="button"
          className="ghostButton templateGalleryExpandButton"
          aria-expanded={showAllTemplates}
          onClick={toggleExpanded}
        >
          {showAllTemplates ? "收起，只看精选" : `展开全部版式（+${hiddenCount}）`}
        </button>
      </div>
      <div className="templateGalleryGrid">
        {visibleTemplateIds.map((id) => id === PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite
          ? (
            <InfoCardTemplateCard
              key={id}
              activePresetId={activePresetId}
              recommendedTemplateId={recommendedTemplateId}
              currentImage={currentImage}
              currentSettings={currentSettings}
              sourceDimensions={sourceDimensions}
              sharedDrawable={sharedDrawable}
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
                sourceDimensions={sourceDimensions}
                sharedDrawable={sharedDrawable}
                onApply={applyTemplate}
              />
            )
          })()
        )}
      </div>
      {isInfoCardVariant(activePresetId) && (
        <InfoCardVariantSettings
          activePresetId={activePresetId}
          onApplyInfoCardVariant={onApplyInfoCardVariant}
        />
      )}
    </section>
  )
}

/**
 * 画廊 memo 化：队列勾选/活动图切换等父级状态变化时，若有效设置、当前图片、
 * 模板状态与回调均未变化，则跳过整个画廊重渲染；卡片内部仍保留各自 memo。
 */
export const TemplateGallery = memo(TemplateGalleryView)
