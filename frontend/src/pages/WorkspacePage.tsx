/**
 * 工作台页面：快速出图 / 高级编辑两种模式共享同一套状态装配。
 *
 * 模式：
 * - 快速出图（默认）：空队列显示欢迎页；有照片时显示「当前照片 + 模板卡片 +
 *   摄影信息摘要 + 导出」。隐藏详细编辑能力。
 * - 高级编辑：原有三栏专业工作台（左队列 / 中预览 / 右检查器）。
 *
 * 两条模式共享同一份 RenderRecipe、身份合并链与导出逻辑（不复制渲染实现）：
 * 预览（Canvas/引擎）、单图导出、批量导出统一走 buildRecipeFromSettings 与
 * resolveQueueItem 解析，确保四条链路结果一致。
 *
 * 所有业务状态在此组装，各面板只接收 props。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { TopBar } from "../components/layout/TopBar"
import type { WorkspaceMode } from "../components/layout/TopBar"
import { StatusPanel } from "../components/layout/StatusPanel"
import { InspectorPanel } from "../components/layout/InspectorPanel"
import type { InspectorSection } from "../components/layout/InspectorPanel"
import { QueuePanel } from "../features/queue/components/QueuePanel"
import { PreviewPanel } from "../features/preview/components/PreviewPanel"
import { SettingsPanel } from "../features/settings/components/SettingsPanel"
import { ShootingPresetPanel } from "../features/metadata/components/ShootingPresetPanel"
import { AssetLibraryPanel } from "../features/metadata/components/AssetLibraryPanel"
import { PhotoIdentityPanel } from "../features/metadata/components/PhotoIdentityPanel"
import { TemplatePanel } from "../features/template/components/TemplatePanel"
import { BuiltInTemplatePanel } from "../features/template/components/BuiltInTemplatePanel"
import { useEngineHealth } from "../features/preview/hooks/useEngineHealth"
import { useQueue } from "../features/queue/hooks/useQueue"
import { usePreview } from "../features/preview/hooks/usePreview"
import { useSettings } from "../features/settings/hooks/useSettings"
import { useTemplates } from "../features/template/hooks/useTemplates"
import { TemplateDropOverlay } from "../features/template/components/TemplateDropOverlay"
import { deduplicateTemplateName } from "../features/template/utils/templateJsonCodec"
import { normalizeTemplatePatch, normalizeTemplateSettings } from "../features/template/utils/normalizeTemplate"
import { useShootingPresets } from "../features/metadata/hooks/useShootingPresets"
import { usePhotoAssets } from "../features/metadata/hooks/usePhotoAssets"
import { useExifIndex } from "../features/metadata/hooks/useExifIndex"
import { resolveEffectiveText } from "../features/metadata/utils/resolveEffectiveText"
import { detectBrandFromIdentity } from "../features/settings/utils/brandDetection"
import { BUILT_IN_TEMPLATES, PHOTO_INFO_CARD_TEMPLATE_IDS } from "../features/template/presets/builtInTemplates"
import { fetchFilmStocks } from "../services/engine/filmStocksApi"
import { QuickWelcome } from "../features/quick/components/QuickWelcome"
import { EngineStatusBar } from "../features/engineHealth/EngineStatusBar"
import { QuickWorkspace } from "../features/quick/components/QuickWorkspace"
import type { PresetDraft } from "../features/quick/components/QuickInfoSummary"
import { buildPresetFromText } from "../features/quick/utils/buildPresetFromText"
import { recommendTemplateId, orientationFromSize } from "../features/quick/utils/recommendTemplate"
import type { DesktopRuntime } from "../types/runtime"
import type { RenderSettings } from "../features/settings/types"
import type { Template } from "../features/template/types"
import type { FilmStock } from "../features/metadata/types"
import type { QueueItem } from "../features/queue/types"
import type { BatchScope } from "../features/queue/types"

type WorkspacePageProps = {
  readonly runtime: DesktopRuntime
  /** 引擎地址迟到同步时递增，触发首屏引擎请求重新执行。 */
  readonly engineBaseUrlRevision?: number
}

// ---- 可调分栏常量 ---------------------------------------------------------
const LEFT_DEFAULT = 280
const LEFT_MIN = 220
const LEFT_MAX = 400
const RIGHT_DEFAULT = 420
const RIGHT_MIN = 360
const RIGHT_MAX = 560
/** 右栏折叠后的竖条宽度。 */
const RIGHT_COLLAPSED_WIDTH = 40

const SESSION_KEY_LEFT = "workspace.colLeft"
const SESSION_KEY_RIGHT = "workspace.colRight"
const SESSION_KEY_MODE = "workspace.mode"

/** 读取 sessionStorage 中的分栏宽度，回退到默认值。 */
const readColumnWidth = (key: string, fallback: number): number => {
  try {
    const raw = sessionStorage.getItem(key)
    if (raw === null) {
      return fallback
    }
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

/** 写入分栏宽度到 sessionStorage（失败不影响功能）。 */
const writeColumnWidth = (key: string, value: number): void => {
  try {
    sessionStorage.setItem(key, String(value))
  } catch {
    // 写入失败静默忽略
  }
}

/** 读取上次会话的工作台模式；默认快速出图。 */
const readMode = (): WorkspaceMode => {
  try {
    return sessionStorage.getItem(SESSION_KEY_MODE) === "advanced" ? "advanced" : "quick"
  } catch {
    return "quick"
  }
}

const clampWidth = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** 摄影信息卡默认模板的 settingsPatch（导入照片后自动应用）。 */
const PHOTO_INFO_CARD_DEFAULT_PATCH: Partial<RenderSettings> =
  BUILT_IN_TEMPLATES.find((t) => t.id === PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite)?.settingsPatch ?? {}

export const WorkspacePage = ({ runtime, engineBaseUrlRevision = 0 }: WorkspacePageProps): JSX.Element => {
  const health = useEngineHealth(undefined, engineBaseUrlRevision)
  const queue = useQueue()
  const settings = useSettings()
  const userModifiedRef = useRef(false)
  const defaultTemplateAppliedRef = useRef(false)
  const prevQueueLenRef = useRef(0)
  const presets = useShootingPresets()
  const assets = usePhotoAssets()
  const exif = useExifIndex()
  const [filmStocks, setFilmStocks] = useState<readonly FilmStock[]>([])
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [mode, setMode] = useState<WorkspaceMode>(readMode)

  // ---- 可调分栏状态 -------------------------------------------------------
  const [colLeft, setColLeft] = useState<number>(() => readColumnWidth(SESSION_KEY_LEFT, LEFT_DEFAULT))
  const [colRight, setColRight] = useState<number>(() => readColumnWidth(SESSION_KEY_RIGHT, RIGHT_DEFAULT))
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(false)
  /** 当前正在拖拽的手柄：null / left / right。 */
  const [resizing, setResizing] = useState<null | "left" | "right">(null)
  const resizeStartRef = useRef<{ readonly side: "left" | "right"; readonly startX: number; readonly startWidth: number } | null>(null)

  // 拖拽中实时写入宽度（sessionStorage 写入廉价，无需防抖）
  useEffect(() => {
    if (resizing === null) {
      return
    }
    writeColumnWidth(SESSION_KEY_LEFT, colLeft)
    writeColumnWidth(SESSION_KEY_RIGHT, colRight)
  }, [colLeft, colRight, resizing])

  // 模式切换持久化
  const handleModeChange = useCallback((nextMode: WorkspaceMode): void => {
    setMode(nextMode)
    try {
      sessionStorage.setItem(SESSION_KEY_MODE, nextMode)
    } catch {
      // 写入失败静默忽略
    }
  }, [])

  // 全局指针监听：拖拽期间跟随光标更新宽度，松开结束
  useEffect(() => {
    if (resizing === null) {
      return
    }
    const handleMove = (event: PointerEvent): void => {
      const start = resizeStartRef.current
      if (start === null) {
        return
      }
      const delta = event.clientX - start.startX
      if (start.side === "left") {
        setColLeft(clampWidth(start.startWidth + delta, LEFT_MIN, LEFT_MAX))
      } else {
        setColRight(clampWidth(start.startWidth - delta, RIGHT_MIN, RIGHT_MAX))
      }
    }
    const handleUp = (): void => {
      resizeStartRef.current = null
      setResizing(null)
    }
    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
    return () => {
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
    }
  }, [resizing])

  /** 开始拖拽某条手柄。 */
  const startResize = useCallback((side: "left" | "right") => (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    resizeStartRef.current = {
      side,
      startX: event.clientX,
      startWidth: side === "left" ? colLeft : colRight
    }
    setResizing(side)
  }, [colLeft, colRight])

  // 加载内置胶片库
  useEffect(() => {
    let active = true
    void fetchFilmStocks()
      .then((stocks) => {
        if (active) {
          setFilmStocks(stocks)
        }
      })
      .catch(() => {
        // 引擎不可用时不影响
      })
    return () => { active = false }
  }, [engineBaseUrlRevision])

  // 导入照片后自动应用「摄影信息卡」默认模板：
  // 仅当队列从空变为非空、且用户尚未手动修改过设置/模板、且没有已保存的默认模板时。
  // 用户手动选择过模板后（userModifiedRef=true），后续导入不再自动覆盖。
  useEffect(() => {
    const prevLen = prevQueueLenRef.current
    prevQueueLenRef.current = queue.items.length
    const grewFromEmpty = prevLen === 0 && queue.items.length > 0
    if (!grewFromEmpty) {
      return
    }
    if (userModifiedRef.current || defaultTemplateAppliedRef.current) {
      return
    }
    settings.update(normalizeTemplatePatch(PHOTO_INFO_CARD_DEFAULT_PATCH))
    setActivePresetId(PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite)
  }, [queue.items.length, settings])

  // 应用内置视觉模板 patch，同时更新活跃模板 id。
  // 内置模板可能含旧单段字段（textContent 等），统一走 normalizeTemplatePatch 迁移。
  const handleApplyPreset = useCallback((patch: Partial<RenderSettings>): void => {
    userModifiedRef.current = true
    settings.update(normalizeTemplatePatch(patch))
    const matched = BUILT_IN_TEMPLATES.find((t) => t.settingsPatch === patch)
    setActivePresetId(matched?.id ?? null)
  }, [settings])

  /** 应用摄影信息卡指定变体（快速模式模板卡片变体切换）。 */
  const handleApplyInfoCardVariant = useCallback((variantId: string): void => {
    const template = BUILT_IN_TEMPLATES.find((t) => t.id === variantId)
    if (template === undefined) {
      return
    }
    userModifiedRef.current = true
    settings.update(normalizeTemplatePatch(template.settingsPatch))
    setActivePresetId(variantId)
  }, [settings])

  // 包装 update，标记用户已主动修改设置（阻止默认模板覆盖）
  const handleSettingsUpdate = useCallback((patch: Partial<RenderSettings>): void => {
    userModifiedRef.current = true
    settings.update(patch)
    setActivePresetId(null)
  }, [settings])

  // 包装 updateNumber，同样标记用户已主动修改设置
  const handleSettingsUpdateNumber = useCallback(
    (key: Parameters<typeof settings.updateNumber>[0], value: number, min: number, max: number): void => {
      userModifiedRef.current = true
      settings.updateNumber(key, value, min, max)
    },
    [settings]
  )

  // 包装 updateTextLayer，同样标记用户已主动修改设置
  const handleUpdateTextLayer = useCallback(
    (layerId: string, patch: Parameters<typeof settings.updateTextLayer>[1]): void => {
      userModifiedRef.current = true
      settings.updateTextLayer(layerId, patch)
      setActivePresetId(null)
    },
    [settings]
  )

  // 包装 resetTextLayers，标记用户已主动修改设置
  const handleResetTextLayers = useCallback((): void => {
    userModifiedRef.current = true
    settings.resetTextLayers()
    setActivePresetId(null)
  }, [settings])

  // 包装 replaceTextLayers，标记用户已主动修改设置
  const handleReplaceTextLayers = useCallback(
    (layers: Parameters<typeof settings.replaceTextLayers>[0]): void => {
      userModifiedRef.current = true
      settings.replaceTextLayers(layers)
      setActivePresetId(null)
    },
    [settings]
  )

  // 加载模板时更新设置（用户主动操作，标记为已修改）。
  // 用户模板可能是旧格式（不含 textLayers），走 normalizeTemplateSettings 迁移。
  const handleLoadTemplate = useCallback((templateSettings: RenderSettings): void => {
    userModifiedRef.current = true
    settings.update(normalizeTemplateSettings(templateSettings))
    setActivePresetId(null)
  }, [settings])

  // 拖拽/导入模板：应用到当前设置（不保存）。
  // 导入的模板也可能是旧格式，走 normalizeTemplateSettings 迁移。
  const handleDropApply = useCallback((templateSettings: RenderSettings): void => {
    userModifiedRef.current = true
    settings.update(normalizeTemplateSettings(templateSettings))
    setActivePresetId(null)
  }, [settings])

  // 默认模板自动应用回调：仅在用户未手动修改过设置时生效。
  // 生效时记录 defaultTemplateAppliedRef，避免随后导入再被摄影信息卡覆盖。
  // 默认模板也可能是旧格式，走 normalizeTemplateSettings 迁移。
  const handleDefaultLoaded = useCallback((templateSettings: RenderSettings): void => {
    if (userModifiedRef.current) {
      return
    }
    defaultTemplateAppliedRef.current = true
    settings.update(normalizeTemplateSettings(templateSettings))
  }, [settings])

  // 模板管理（传入默认模板自动应用回调）
  const templates = useTemplates(handleDefaultLoaded)

  // 拖拽/导入模板：保存到模板库
  const handleDropSave = useCallback((template: Template): void => {
    const existingNames = templates.templates.map((t) => t.name)
    const uniqueName = deduplicateTemplateName(template.name, existingNames)
    templates.saveTemplate(uniqueName, template.settings)
  }, [templates])

  // 导入模板：保存到模板库
  const handleImportTemplate = useCallback((template: Template): void => {
    templates.saveTemplate(template.name, template.settings)
  }, [templates])

  // 删除摄影预设时同步清理队列中的悬空绑定（预设、图片、资产、模板相互独立）。
  const handleDeletePreset = useCallback((presetId: string): void => {
    queue.clearPresetBinding(presetId)
    presets.deletePreset(presetId)
  }, [queue, presets])

  // 计算各预设被队列中多少张图片引用（用于预设面板展示应用范围）
  const presetUsageCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of queue.items) {
      if (item.presetId !== null) {
        counts.set(item.presetId, (counts.get(item.presetId) ?? 0) + 1)
      }
    }
    return counts
  }, [queue.items])

  // 获取当前预览图片的信息
  const activeItem = queue.activeItem
  const activeTextOverride = activeItem?.textOverride ?? null

  // 预览图片变化时惰性读取 EXIF（供身份链与变量解析使用）
  useEffect(() => {
    exif.ensureExif(queue.activeFilePath)
  }, [exif.ensureExif, queue.activeFilePath])

  // 阻止窗口级默认拖放行为：拖图片到预览区等空白处时，
  // 避免 Electron/浏览器直接导航打开文件（拖入队列由 QueuePanel 处理）。
  useEffect(() => {
    const preventDefault = (event: DragEvent): void => {
      event.preventDefault()
    }
    window.addEventListener("dragover", preventDefault)
    window.addEventListener("drop", preventDefault)
    return () => {
      window.removeEventListener("dragover", preventDefault)
      window.removeEventListener("drop", preventDefault)
    }
  }, [])

  // 计算当前图片的有效摄影身份（每图覆盖 > 摄影预设 > EXIF > 空）
  const selectedIdentity = activeItem !== null
    ? queue.getEffectiveIdentity(activeItem.id, presets.presets, assets.store, exif.getExifByPath())
    : null

  // 计算当前图片各展示字段的来源标识（EXIF / 摄影预设 / 每图覆盖）
  const identitySources = useMemo(() => {
    if (activeItem === null) {
      return null
    }
    return queue.getIdentitySources(activeItem.id, presets.presets, assets.store, exif.getExifByPath())
  }, [queue, activeItem, presets.presets, assets.store, exif])

  // 快捷文字覆盖：当前图片的独立文字覆盖。
  const resolvedTextOverride = useMemo(() => {
    if (activeTextOverride === null) {
      return null
    }
    return resolveEffectiveText(activeTextOverride, selectedIdentity)
  }, [activeTextOverride, selectedIdentity])

  // 多段文字图层变量解析：对当前预览图片的每个 textLayer 解析变量
  const resolvedTextLayers = useMemo(() => {
    return settings.settings.textLayers.map((layer) => {
      if (!layer.enabled || layer.content.length === 0) {
        return null
      }
      return resolveEffectiveText(layer.content, selectedIdentity)
    })
  }, [settings.settings.textLayers, selectedIdentity])

  // 品牌标识：根据当前图片的相机信息识别品牌
  const resolvedBrand = useMemo(() => {
    if (selectedIdentity === null) {
      return null
    }
    const result = detectBrandFromIdentity(selectedIdentity.camera)
    return result.label
  }, [selectedIdentity])

  const preview = usePreview(
    queue.activeFilePath,
    settings.settings,
    settings.settingsVersion,
    resolvedTextOverride,
    resolvedTextLayers,
    resolvedBrand,
    engineBaseUrlRevision
  )

  // 引擎是否可用：仅在「健康端点连续 ready」时为 true。
  // loading/error 都视为不可用，UI 据此禁用导出按钮、提示用户当前为本地预览模式。
  const engineAvailable = health.kind === "ready"
  // 当前失败原因（error 时为诊断消息，loading/ready 时为 null）；供 PreviewPanel 解释禁用原因
  const engineUnavailableReason: string | null = health.kind === "error" ? health.message : null

  // 识别当前图片的品牌（用于品牌标识设置面板预览）
  const detectedBrand = useMemo(() => {
    if (selectedIdentity === null) {
      return null
    }
    return detectBrandFromIdentity(selectedIdentity.camera)
  }, [selectedIdentity])

  // 单张图片的批量导出解析结果（文字覆盖 + 多段文字变量 + 品牌）。
  // 与 PreviewPanel 的 ResolvedQueueItem 类型对齐。
  type ResolvedQueueItem = {
    readonly textOverride: string | null
    readonly resolvedLayers: readonly (string | null)[]
    readonly brand: string | null
  }

  // 每图解析延迟到批量导出时逐项执行：避免用户在文字框每次击键时
  // 对全队列重复做变量解析（queueResolved* 不再全量预计算）。
  // EXIF 经 getExifByPath() 读取最新缓存：导出前确保全部 EXIF 已读取，解析时取到最新值。
  const resolveQueueItem = useCallback(
    (item: QueueItem): ResolvedQueueItem => {
      const identity = queue.getEffectiveIdentity(item.id, presets.presets, assets.store, exif.getExifByPath())
      const textOverride = item.textOverride !== null
        ? resolveEffectiveText(item.textOverride, identity)
        : null
      const resolvedLayers = settings.settings.textLayers.map((layer) => {
        if (!layer.enabled || layer.content.length === 0) {
          return null
        }
        return resolveEffectiveText(layer.content, identity)
      })
      const brand = detectBrandFromIdentity(identity.camera).label
      return { textOverride, resolvedLayers, brand }
    },
    [queue, presets.presets, assets.store, settings.settings.textLayers]
  )

  // 确定性模板推荐：只改变「建议模板」标记，不修改用户设置。
  // 依据：方向（横/竖）、是否胶片、画幅、信息完整度。
  const recommendedTemplateId = useMemo(() => {
    if (activeItem === null || selectedIdentity === null) {
      return null
    }
    const currentImage = preview.kind === "active" ? preview.currentImage : null
    return recommendTemplateId({
      orientation: orientationFromSize(currentImage?.naturalWidth, currentImage?.naturalHeight),
      isFilm: selectedIdentity.film.trim().length > 0,
      captureFormatId: selectedIdentity.captureFormat.length > 0 ? selectedIdentity.captureFormat : null,
      hasCameraOrLens: selectedIdentity.camera.trim().length > 0 || selectedIdentity.lens.trim().length > 0
    })
  }, [activeItem, selectedIdentity, preview])

  // ---- 摄影预设作用域应用（当前 / 已选 / 全部） --------------------------------
  const handleApplyPresetToScope = useCallback((presetId: string, scope: BatchScope): void => {
    queue.assignPresetToScope(presetId, scope)
  }, [queue])

  const handleClearPresetFromScope = useCallback((scope: BatchScope): void => {
    queue.clearPresetFromScope(scope)
  }, [queue])

  /** 快速流程「创建摄影预设」：文本录入 -> 资产 + 预设 -> 应用到指定范围。 */
  const handleCreatePresetFromText = useCallback((draft: PresetDraft, scope: BatchScope): void => {
    const result = buildPresetFromText(draft, assets.store)
    if (result === null) {
      return
    }
    for (const camera of result.newCameras) {
      assets.saveCamera(camera)
    }
    for (const lens of result.newLenses) {
      assets.saveLens(lens)
    }
    for (const film of result.newFilms) {
      assets.saveFilm(film)
    }
    presets.savePreset(result.preset)
    queue.assignPresetToScope(result.preset.id, scope)
  }, [assets, presets, queue])

  // ---- 批量导出作用范围 --------------------------------------------------------
  // 勾选了图片则导出勾选；未勾选且多于一张则导出全部；单张未勾选不显示批量导出。
  const batchExportItems = useMemo(() => {
    if (queue.checkedItemIds.length > 0) {
      const checkedSet = new Set(queue.checkedItemIds)
      return queue.items.filter((item) => checkedSet.has(item.id))
    }
    return queue.items.length > 1 ? queue.items : []
  }, [queue.items, queue.checkedItemIds])

  const batchExportLabel = useMemo(() => {
    if (queue.checkedItemIds.length > 0) {
      return `批量导出已选 ${queue.checkedItemIds.length} 张`
    }
    return `批量导出 ${queue.items.length} 张`
  }, [queue.checkedItemIds.length, queue.items.length])

  // 快速模式空队列：欢迎页入口
  const handleWelcomePickFiles = useCallback((): void => {
    void queue.addImageFiles()
  }, [queue])

  const handleWelcomePickFolder = useCallback((): void => {
    void queue.addImageFolder()
  }, [queue])

  const handleWelcomeLoadSamples = useCallback((): void => {
    void queue.addImages()
  }, [queue])

  const handleWelcomeDropFiles = useCallback((paths: readonly string[]): void => {
    void queue.addFromPaths(paths)
  }, [queue])

  // ---- 右侧检查器折叠分组（高级编辑模式） ---------------------------------------
  // 顺序：渲染设置 / 摄影信息 / 模板 / 摄影预设 / 资产库。默认仅展开渲染设置。
  const inspectorSections = useMemo((): readonly InspectorSection[] => [
    {
      id: "settings",
      label: "渲染设置",
      defaultExpanded: true,
      content: (
        <SettingsPanel
          controller={{
            ...settings,
            update: handleSettingsUpdate,
            updateNumber: handleSettingsUpdateNumber,
            updateTextLayer: handleUpdateTextLayer,
            resetTextLayers: handleResetTextLayers,
            replaceTextLayers: handleReplaceTextLayers
          }}
          hasSelectedImage={queue.activeFilePath !== null}
          selectedFilePath={queue.activeFilePath}
          textOverride={queue.activeTextOverride}
          setTextOverride={queue.setActiveTextOverride}
          detectedBrandLabel={detectedBrand?.label ?? null}
        />
      )
    },
    {
      id: "photo-identity",
      label: "摄影信息",
      content: activeItem !== null && selectedIdentity !== null ? (
        <PhotoIdentityPanel
          effectiveIdentity={selectedIdentity}
          identityOverride={activeItem.identityOverride}
          presetId={activeItem.presetId}
          presets={presets.presets}
          assetStore={assets.store}
          onUpdateOverride={queue.setActiveIdentityOverride}
          onClearOverride={queue.clearActiveIdentityOverride}
          hasSelectedImage={true}
          sources={identitySources ?? undefined}
        />
      ) : (
        <p className="settingsCapabilityHint">请先选择一张图片。</p>
      )
    },
    {
      id: "templates",
      label: "模板",
      content: (
        <>
          <BuiltInTemplatePanel
            onApply={handleApplyPreset}
            activePresetId={activePresetId}
            currentImage={preview.kind === "active" ? preview.currentImage : null}
            currentSettings={settings.settings}
          />
          <TemplatePanel
            templateController={templates}
            currentSettings={settings.settings}
            onLoad={handleLoadTemplate}
            onImportTemplate={handleImportTemplate}
          />
        </>
      )
    },
    {
      id: "presets",
      label: "摄影预设",
      content: (
        <ShootingPresetPanel
          presets={presets.presets}
          lastError={presets.lastError}
          onSavePreset={presets.savePreset}
          onDuplicatePreset={presets.duplicatePreset}
          onDeletePreset={handleDeletePreset}
          onClearError={presets.clearError}
          onApplyToScope={handleApplyPresetToScope}
          onClearScope={handleClearPresetFromScope}
          hasSelectedImage={queue.activeFilePath !== null}
          queueCount={queue.items.length}
          checkedCount={queue.checkedCount}
          assetStore={assets.store}
          presetUsageCounts={presetUsageCounts}
        />
      )
    },
    {
      id: "assets",
      label: "摄影资产库",
      content: (
        <AssetLibraryPanel
          assetController={assets}
          filmStocks={filmStocks}
        />
      )
    }
  ], [
    settings, handleSettingsUpdate, handleSettingsUpdateNumber, handleUpdateTextLayer,
    handleResetTextLayers, handleReplaceTextLayers,
    templates, handleLoadTemplate, handleApplyPreset, activePresetId, handleImportTemplate,
    queue, activeItem, selectedIdentity, identitySources, presets, assets, filmStocks,
    handleDeletePreset, presetUsageCounts, handleApplyPresetToScope, handleClearPresetFromScope
  ])

  const workspaceStyle = {
    "--ws-left": `${colLeft}px`,
    "--ws-right": `${rightCollapsed ? RIGHT_COLLAPSED_WIDTH : colRight}px`
  } as React.CSSProperties

  // 快速模式空态：队列为空或当前预览图缺失（防御性回退，避免空白屏）
  const isEmpty = queue.items.length === 0 || queue.activeItem === null
  const showWelcome = mode === "quick" && isEmpty

  return (
    <div className="workspaceShell">
      <TopBar runtime={runtime} health={health} mode={mode} onModeChange={handleModeChange} />

      {/* 快速出图模式：空队列显示欢迎页 */}
      {showWelcome && (
        <main className="quickWelcomeHost">
          <QuickWelcome
            isBrowserMode={queue.isBrowserMode}
            onPickFiles={handleWelcomePickFiles}
            onPickFolder={handleWelcomePickFolder}
            onLoadSamples={handleWelcomeLoadSamples}
            onDropFiles={handleWelcomeDropFiles}
          />
        </main>
      )}

      {/* 快速出图模式：有照片 */}
      {mode === "quick" && !isEmpty && activeItem !== null && selectedIdentity !== null && (
        <main className="quickModeHost">
          <QuickWorkspace
            queue={queue}
            preview={preview}
            settings={settings.settings}
            activeItem={activeItem}
            selectedIdentity={selectedIdentity}
            identitySources={identitySources ?? null}
            presets={presets.presets}
            activePresetId={activePresetId}
            recommendedTemplateId={recommendedTemplateId}
            currentImage={preview.kind === "active" ? preview.currentImage : null}
            resolveQueueItem={resolveQueueItem}
            prepareExifForExport={exif.ensureExifForExport}
            resolvedBrand={resolvedBrand}
            resolvedTextOverride={resolvedTextOverride}
            resolvedTextLayers={resolvedTextLayers}
            onApplyTemplate={handleApplyPreset}
            onApplyInfoCardVariant={handleApplyInfoCardVariant}
            onApplyPreset={handleApplyPresetToScope}
            onClearPreset={handleClearPresetFromScope}
            onCreatePresetFromText={handleCreatePresetFromText}
            batchExportItems={batchExportItems}
            batchExportLabel={batchExportLabel}
            engineAvailable={engineAvailable}
            engineUnavailableReason={engineUnavailableReason}
          />
        </main>
      )}

      {/* 高级编辑模式：三栏专业工作台 */}
      {mode === "advanced" && (
        <main className={`workspace ${resizing !== null ? "workspaceResizing" : ""}`} style={workspaceStyle}>
          <div className="workspaceLeft">
            <QueuePanel queue={queue} />
          </div>
          <div className="workspaceCenter">
            <PreviewPanel
              state={preview}
              settings={settings.settings}
              hasSelectedImage={queue.activeFilePath !== null}
              queueItems={queue.items}
              batchExportItems={batchExportItems}
              batchExportLabel={batchExportLabel}
              resolveQueueItem={resolveQueueItem}
              prepareExifForExport={exif.ensureExifForExport}
              resolvedBrand={resolvedBrand}
              resolvedTextOverride={resolvedTextOverride}
              resolvedTextLayers={resolvedTextLayers}
              autoOpenExportDirectory
              engineAvailable={engineAvailable}
              engineUnavailableReason={engineUnavailableReason}
            />
          </div>
          <div className="workspaceRight">
            {rightCollapsed ? (
              <div className="collapsedRight">
                <button
                  type="button"
                  className="inspectorReopen"
                  onClick={() => setRightCollapsed(false)}
                  aria-label="展开检查器"
                >
                  <span className="inspectorReopenChevron" aria-hidden="true">«</span>
                  <span>展开检查器</span>
                </button>
              </div>
            ) : (
              <InspectorPanel
                sections={inspectorSections}
                onToggleCollapse={() => setRightCollapsed(true)}
              />
            )}
          </div>

          {/* 左栏拖拽手柄（贴近左栏右边界） */}
          <div
            className="resizeHandle resizeHandleLeft"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整源图片栏宽度"
            onPointerDown={startResize("left")}
          />
          {/* 右栏拖拽手柄（折叠时隐藏） */}
          {!rightCollapsed && (
            <div
              className="resizeHandle resizeHandleRight"
              role="separator"
              aria-orientation="vertical"
              aria-label="调整检查器栏宽度"
              onPointerDown={startResize("right")}
            />
          )}
        </main>
      )}

      {/* 引擎状态条：非阻塞顶部提示，引擎可用时自动消失。
          替代旧的全屏 EngineFailureView：工作台永远可访问，引擎不可用时仅做状态提示。 */}
      {runtime.engine.managed && <EngineStatusBar health={health} />}

      <StatusPanel
        runtime={runtime}
        health={health}
        preview={preview}
      />
      <TemplateDropOverlay
        onApply={handleDropApply}
        onSave={handleDropSave}
      />
    </div>
  )
}
