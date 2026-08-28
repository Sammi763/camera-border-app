/**
 * 快速出图模式主视图。
 *
 * 快速模式只显示四类信息：
 * - 当前照片（预览，含导出按钮）；
 * - 模板卡片（首屏精选模板画廊，含推荐标记）；
 * - 摄影信息摘要（含来源标识与摄影预设快速栏）；
 * - 导出（复用 PreviewPanel 的导出逻辑，不复制渲染实现）。
 *
 * 左侧保留源图片队列（导入 / 当前图切换 / 批量选中）。
 * 详细边框、渐变、字体、图层、模板管理能力在「高级编辑」中提供。
 */

import type { PreviewState } from "../../preview/types"
import type { RenderSettings } from "../../settings/types"
import type { QueueController, QueueItem } from "../../queue/types"
import type { PhotoIdentity, ShootingPreset } from "../../metadata/types"
import type { IdentitySourceMap } from "../../metadata/utils/resolveIdentityFieldSources"
import type { BatchScope } from "../../queue/types"
import { PreviewPanel } from "../../preview/components/PreviewPanel"
import type { ResolvedQueueItem } from "../../preview/components/PreviewPanel"
import { QueuePanel } from "../../queue/components/QueuePanel"
import { QuickInfoSummary } from "./QuickInfoSummary"
import type { PresetDraft } from "./QuickInfoSummary"
import { QuickTemplateGallery } from "./QuickTemplateGallery"

type QuickWorkspaceProps = {
  readonly queue: QueueController
  readonly preview: PreviewState
  readonly settings: RenderSettings
  readonly activeItem: QueueItem
  readonly selectedIdentity: PhotoIdentity
  readonly identitySources: IdentitySourceMap | null
  readonly presets: readonly ShootingPreset[]
  /** 当前活跃的内置模板 id。 */
  readonly activePresetId: string | null
  /** 推荐模板 id（确定性规则给出）。 */
  readonly recommendedTemplateId: string | null
  /** 当前预览照片（模板卡片实时缩略图用）。 */
  readonly currentImage: HTMLImageElement | null
  readonly resolveQueueItem: (item: QueueItem) => ResolvedQueueItem
  readonly prepareExifForExport: (paths: readonly string[]) => Promise<void>
  readonly resolvedBrand: string | null
  readonly resolvedTextOverride: string | null
  readonly resolvedTextLayers: readonly (string | null)[] | null
  /** 批量导出目标图片（按作用范围计算）。 */
  readonly batchExportItems: readonly QueueItem[]
  /** 批量导出按钮文案。 */
  readonly batchExportLabel: string
  /**
   * 引擎是否可用。仅 ready 时为 true；loading/error 时为 false。
   * 快速模式与高级模式共用 PreviewPanel 的导出禁用逻辑（高保真导出必须由 Java 引擎完成）。
   */
  readonly engineAvailable: boolean
  /** 引擎不可用原因（用于导出按钮 title 与提示）。 */
  readonly engineUnavailableReason: string | null
  readonly onApplyTemplate: (patch: Partial<RenderSettings>) => void
  readonly onApplyInfoCardVariant: (variantId: string) => void
  readonly onApplyPreset: (presetId: string, scope: BatchScope) => void
  readonly onClearPreset: (scope: BatchScope) => void
  readonly onCreatePresetFromText: (draft: PresetDraft, scope: BatchScope) => void
}

export const QuickWorkspace = ({
  queue,
  preview,
  settings,
  activeItem,
  selectedIdentity,
  identitySources,
  presets,
  activePresetId,
  recommendedTemplateId,
  currentImage,
  resolveQueueItem,
  prepareExifForExport,
  resolvedBrand,
  resolvedTextOverride,
  resolvedTextLayers,
  batchExportItems,
  batchExportLabel,
  engineAvailable,
  engineUnavailableReason,
  onApplyTemplate,
  onApplyInfoCardVariant,
  onApplyPreset,
  onClearPreset,
  onCreatePresetFromText
}: QuickWorkspaceProps): JSX.Element => {
  return (
    <div className="quickWorkspace">
      <div className="quickMain">
        <div className="quickLeft">
          <QueuePanel queue={queue} />
        </div>
        <div className="quickCenter">
          <PreviewPanel
            state={preview}
            settings={settings}
            hasSelectedImage={queue.activeFilePath !== null}
            queueItems={queue.items}
            batchExportItems={batchExportItems}
            batchExportLabel={batchExportLabel}
            resolveQueueItem={resolveQueueItem}
            prepareExifForExport={prepareExifForExport}
            resolvedBrand={resolvedBrand}
            resolvedTextOverride={resolvedTextOverride}
            resolvedTextLayers={resolvedTextLayers}
            autoOpenExportDirectory
            engineAvailable={engineAvailable}
            engineUnavailableReason={engineUnavailableReason}
          />
        </div>
        <div className="quickRight">
          <QuickInfoSummary
            activeItem={activeItem}
            effectiveIdentity={selectedIdentity}
            sources={identitySources ?? {
              camera: null,
              lens: null,
              film: null,
              location: null,
              frameNumber: null,
              captureFormat: null
            }}
            presets={presets}
            checkedCount={queue.checkedCount}
            onApplyPreset={onApplyPreset}
            onClearPreset={onClearPreset}
            onCreatePresetFromText={onCreatePresetFromText}
          />
        </div>
      </div>
      <QuickTemplateGallery
        activePresetId={activePresetId}
        recommendedTemplateId={recommendedTemplateId}
        currentImage={currentImage}
        currentSettings={settings}
        onApply={onApplyTemplate}
        onApplyInfoCardVariant={onApplyInfoCardVariant}
      />
    </div>
  )
}
