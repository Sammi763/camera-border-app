/**
 * 内置视觉模板面板。
 *
 * 按分类展示内置模板卡片，用户点击「应用」即可一键将模板 patch
 * 合并到当前设置，触发实时预览。
 *
 * 模板缩略图优先使用「当前照片」经同一套 Canvas 渲染器绘制的实时效果；
 * 无当前照片时回退到纯 CSS 布局示意缩略图。
 */

import { useCallback, useState } from "react"
import { BUILT_IN_TEMPLATES } from "../presets/builtInTemplates"
import type { BuiltInTemplate, TemplateCategory } from "../presets/builtInTemplates"
import type { RenderSettings } from "../../settings/types"
import { normalizeTemplatePatch } from "../utils/normalizeTemplate"
import { TemplateThumbnail } from "./TemplateThumbnail"
import { LiveTemplateThumbnail } from "./LiveTemplateThumbnail"

type BuiltInTemplatePanelProps = {
  /** 将模板 patch 合并到当前设置。 */
  readonly onApply: (patch: Partial<RenderSettings>) => void
  /** 当前活跃的内置模板 id（用于选中态）。 */
  readonly activePresetId: string | null
  /** 当前预览照片（用于实时缩略图；null 时回退 CSS 缩略图）。 */
  readonly currentImage?: HTMLImageElement | null
  /** 当前渲染设置（与模板 patch 合并后供实时缩略图使用）。 */
  readonly currentSettings?: RenderSettings
}

/** 分类展示顺序。 */
const CATEGORY_ORDER: readonly TemplateCategory[] = ["经典", "风格", "胶片", "暗房", "档案"]

export const BuiltInTemplatePanel = ({
  onApply,
  activePresetId,
  currentImage = null,
  currentSettings
}: BuiltInTemplatePanelProps): JSX.Element => {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>("经典")

  const handleApply = useCallback((template: BuiltInTemplate) => {
    onApply(template.settingsPatch)
  }, [onApply])

  /** 模板 patch 与当前设置合并后的「已渲染态」，供实时缩略图与主预览一致。 */
  const mergedSettingsFor = useCallback((template: BuiltInTemplate): RenderSettings | null => {
    if (currentSettings === undefined) {
      return null
    }
    return { ...currentSettings, ...normalizeTemplatePatch(template.settingsPatch) }
  }, [currentSettings])

  return (
    <fieldset className="settingGroup builtInTemplatePanel">
      <legend className="settingLabel">视觉模板</legend>

      {/* 分类标签 */}
      <div className="templatePresetCategory">
        {CATEGORY_ORDER.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`ghostButton ${activeCategory === cat ? "templatePresetCategoryActive" : ""}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 当前分类下的模板卡片网格 */}
      {CATEGORY_ORDER.map((cat) => {
        const templates = BUILT_IN_TEMPLATES.filter((t) => t.category === cat)
        if (cat !== activeCategory) {
          return null
        }
        return (
          <div key={cat} className="templatePresetGrid">
            {templates.map((t) => {
              const isActive = activePresetId === t.id
              const merged = mergedSettingsFor(t)
              return (
                <div
                  key={t.id}
                  className={`templatePresetCard ${isActive ? "templatePresetCardActive" : ""}`}
                >
                  {currentImage !== null && merged !== null ? (
                    <LiveTemplateThumbnail image={currentImage} settings={merged} />
                  ) : (
                    <TemplateThumbnail thumb={t.thumb} className="templatePresetThumb" />
                  )}
                  <div className="templatePresetCaption">
                    <span className="templatePresetName">{t.name}</span>
                    <span className="templatePresetDesc">{t.description}</span>
                  </div>
                  <div className="templatePresetMeta">
                    <button
                      type="button"
                      className="ghostButton"
                      onClick={() => handleApply(t)}
                    >
                      {isActive ? "已应用" : "应用"}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </fieldset>
  )
}
