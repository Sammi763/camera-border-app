/**
 * 工作台页面：统一渐进式工作台的状态装配。
 *
 * 空队列显示统一欢迎页；有照片时固定显示左队列 / 中预览 / 右四页签 / 底部导出 Dock。
 * 详细管理能力通过抽屉打开，避免把预览区和右栏变成重复入口。
 *
 * 所有工作流共享同一份 RenderRecipe、身份合并链与导出逻辑：
 * 预览（Canvas/引擎）、单图导出、批量导出统一走 buildRecipeFromSettings 与
 * resolveQueueItem 解析，确保四条链路结果一致。
 *
 * 所有业务状态在此组装，各面板只接收 props。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { TopBar } from "../components/layout/TopBar"
import type { StudioTheme } from "../components/layout/TopBar"
import { WorkspaceTabs } from "../components/layout/WorkspaceTabs"
import type { WorkspaceTab, WorkspaceTabId } from "../components/layout/WorkspaceTabs"
import { ModalDrawer } from "../components/layout/ModalDrawer"
import { ShortcutOverlay } from "../components/layout/ShortcutOverlay"
import { HelpPanel } from "../components/layout/HelpPanel"
import { QueuePanel } from "../features/queue/components/QueuePanel"
import { PreviewPanel } from "../features/preview/components/PreviewPanel"
import type { PreviewBackground, PreviewViewportCommand } from "../features/preview/components/PreviewPanel"
import { ExportDock } from "../features/preview/components/ExportDock"
import { calculateOutputPixelDimensions } from "../features/settings/utils/imageArea"
import { buildNamingPreview, effectiveExportFormat } from "../features/preview/hooks/useExportController"
import { SettingsPanel } from "../features/settings/components/SettingsPanel"
import { FilmEditingPanel } from "../features/editing/components/FilmEditingPanel"
import { FilmReferencePanel } from "../features/editing/components/FilmReferencePanel"
import { ShootingPresetPanel } from "../features/metadata/components/ShootingPresetPanel"
import { AssetLibraryPanel } from "../features/metadata/components/AssetLibraryPanel"
import { PhotoIdentityPanel } from "../features/metadata/components/PhotoIdentityPanel"
import { PhotoInfoSummary, type PhotoInfoExifState } from "../features/metadata/components/PhotoInfoSummary"
import { PresetTextComposer } from "../features/metadata/components/PresetTextComposer"
import { TemplatePanel } from "../features/template/components/TemplatePanel"
import { TemplateGallery } from "../features/template/components/TemplateGallery"
import { useEngineHealth } from "../features/preview/hooks/useEngineHealth"
import { useEngineCapabilities } from "../features/preview/hooks/useEngineCapabilities"
import { useQueue } from "../features/queue/hooks/useQueue"
import { usePreview } from "../features/preview/hooks/usePreview"
import { useExportController } from "../features/preview/hooks/useExportController"
import { useWorkspaceDropRouter } from "../features/workspace/hooks/useWorkspaceDropRouter"
import { useSettings } from "../features/settings/hooks/useSettings"
import { buildResolvedRenderSettings } from "../features/settings/utils/buildTexts"
import { useTemplates } from "../features/template/hooks/useTemplates"
import { TemplateDropOverlay } from "../features/template/components/TemplateDropOverlay"
import { deduplicateTemplateName } from "../features/template/utils/templateJsonCodec"
import { normalizeTemplatePatch, normalizeTemplateSettings } from "../features/template/utils/normalizeTemplate"
import { useShootingPresets } from "../features/metadata/hooks/useShootingPresets"
import { usePhotoAssets } from "../features/metadata/hooks/usePhotoAssets"
import { useExifIndex } from "../features/metadata/hooks/useExifIndex"
import { resolveEffectiveText } from "../features/metadata/utils/resolveEffectiveText"
import { resolveIdentityForQueueItem } from "../features/metadata/utils/resolveIdentity"
import { detectBrandFromIdentity } from "../features/settings/utils/brandDetection"
import { BUILT_IN_TEMPLATES, PHOTO_INFO_CARD_TEMPLATE_IDS } from "../features/template/presets/builtInTemplates"
import { fetchFilmStocks } from "../services/engine/filmStocksApi"
import { WorkspaceWelcome } from "../features/workspace/components/WorkspaceWelcome"
import { EngineStatusBar } from "../features/engineHealth/EngineStatusBar"
import type { PresetDraft } from "../features/quick/utils/buildPresetFromText"
import { buildPresetFromText } from "../features/quick/utils/buildPresetFromText"
import { recommendTemplateId, orientationFromSize } from "../features/quick/utils/recommendTemplate"
import type { DesktopRuntime } from "../types/runtime"
import type { RenderSettings, SettingsUpdateOptions } from "../features/settings/types"
import type { LayoutSettings, Template } from "../features/template/types"
import type { FilmStock } from "../features/metadata/types"
import type { QueueItem } from "../features/queue/types"
import type { OperationScope } from "../features/queue/types"

type WorkspacePageProps = {
  readonly runtime: DesktopRuntime
}

// ---- 可调分栏常量 ---------------------------------------------------------
const LEFT_DEFAULT = 260
const LEFT_MIN = 240
const LEFT_MAX = 400
const RIGHT_DEFAULT = 360
const RIGHT_MIN = 360
const RIGHT_MAX = 560
/** 右栏折叠后的竖条宽度。 */
const RIGHT_COLLAPSED_WIDTH = 40

/**
 * 仅影响导出文件、不影响画布视觉的 RenderSettings 键。
 * 输出/保真设置变化不应推翻“已应用模板”状态；只有视觉键变化才清除。
 */
const OUTPUT_SETTING_KEYS: ReadonlySet<keyof RenderSettings> = new Set([
  "exportFormat",
  "exportNaming",
  "jpegQuality",
  "outputSizePreset",
  "customOutputLongEdge",
  "preserveMetadata",
  "preserveColorProfile",
  "preferHighBitDepth",
  "tier",
  "colorProfilePolicy",
  "metadataPolicy",
  "bitDepthPolicy"
])

/** patch 是否包含任何视觉设置键（空 patch 或纯输出 patch 返回 false）。 */
const patchContainsVisualSettings = (patch: Partial<RenderSettings>): boolean =>
  Object.keys(patch).some((key) => !OUTPUT_SETTING_KEYS.has(key as keyof RenderSettings))

const SESSION_KEY_LEFT = "workspace.colLeft"
const SESSION_KEY_RIGHT = "workspace.colRight"
const LOCAL_KEY_THEME = "workspace.theme"
const LOCAL_KEY_PREVIEW_BACKGROUND = "workspace.preview-background"

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

/** 读取界面主题；新用户默认跟随系统，已保存的 dark / warm / system 偏好原样保留。 */
const readTheme = (): StudioTheme => {
  try {
    const value = localStorage.getItem(LOCAL_KEY_THEME)
    return value === "dark" || value === "warm" || value === "system" ? value : "system"
  } catch {
    return "system"
  }
}

const readPreviewBackground = (): PreviewBackground => {
  try {
    const value = localStorage.getItem(LOCAL_KEY_PREVIEW_BACKGROUND)
    return value === "black" || value === "white" ? value : "gray"
  } catch {
    return "gray"
  }
}

const clampWidth = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** 摄影信息卡默认模板的 settingsPatch（导入照片后自动应用）。 */
const PHOTO_INFO_CARD_DEFAULT_PATCH: Partial<RenderSettings> =
  BUILT_IN_TEMPLATES.find((t) => t.id === PHOTO_INFO_CARD_TEMPLATE_IDS.centerWhite)?.settingsPatch ?? {}

/** 应用只含视觉字段的版式，并明确保留当前独立 OutputPreset 对应的输出设置。 */
const applyLayoutSettings = (
  current: RenderSettings,
  incoming: Partial<RenderSettings>
): Partial<RenderSettings> => {
  const layout = normalizeTemplateSettings(incoming)
  return {
    ...layout,
    exportFormat: current.exportFormat,
    jpegQuality: current.jpegQuality,
    outputSizePreset: current.outputSizePreset,
    customOutputLongEdge: current.customOutputLongEdge,
    preserveMetadata: current.preserveMetadata,
    preserveColorProfile: current.preserveColorProfile,
    preferHighBitDepth: current.preferHighBitDepth,
    ...(current.tier === undefined ? {} : { tier: current.tier }),
    ...(current.colorProfilePolicy === undefined ? {} : { colorProfilePolicy: current.colorProfilePolicy }),
    ...(current.metadataPolicy === undefined ? {} : { metadataPolicy: current.metadataPolicy }),
    ...(current.bitDepthPolicy === undefined ? {} : { bitDepthPolicy: current.bitDepthPolicy })
  }
}

export const WorkspacePage = ({ runtime }: WorkspacePageProps): JSX.Element => {
  const health = useEngineHealth()
  const queue = useQueue()
  const settings = useSettings()
  const userModifiedRef = useRef(settings.restoredFromStorage)
  const defaultTemplateAppliedRef = useRef(settings.restoredFromStorage)
  const prevQueueLenRef = useRef(0)
  const presets = useShootingPresets()
  const assets = usePhotoAssets()
  const exif = useExifIndex()
  const [filmStocks, setFilmStocks] = useState<readonly FilmStock[]>([])
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [theme, setTheme] = useState<StudioTheme>(readTheme)
  const [previewBackground, setPreviewBackground] = useState<PreviewBackground>(readPreviewBackground)
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>("style")
  const [drawer, setDrawer] = useState<"templates" | "presets" | "assets" | "help" | null>(null)
  const [shortcutOverlayOpen, setShortcutOverlayOpen] = useState(false)
  const [viewportCommand, setViewportCommand] = useState<PreviewViewportCommand | null>(null)
  /** 所有批量行为共享同一个根级操作范围，不在各面板各自维护。 */
  const [operationScope, setOperationScope] = useState<OperationScope>("active")

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

  const handleThemeChange = useCallback((nextTheme: StudioTheme): void => {
    setTheme(nextTheme)
    try {
      localStorage.setItem(LOCAL_KEY_THEME, nextTheme)
    } catch {
      // 写入失败静默忽略
    }
  }, [])

  const handlePreviewBackgroundChange = useCallback((nextBackground: PreviewBackground): void => {
    setPreviewBackground(nextBackground)
    try {
      localStorage.setItem(LOCAL_KEY_PREVIEW_BACKGROUND, nextBackground)
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

  // U14：分栏手柄键盘调节（role=separator），方向键步进（Shift 加速），Home 回到默认宽度。
  const resizeWithKeyboard = useCallback((side: "left" | "right") => (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 48 : 16
    let handled = true
    if (event.key === "ArrowLeft") {
      if (side === "left") {
        setColLeft((previous) => clampWidth(previous - step, LEFT_MIN, LEFT_MAX))
      } else {
        setColRight((previous) => clampWidth(previous + step, RIGHT_MIN, RIGHT_MAX))
      }
    } else if (event.key === "ArrowRight") {
      if (side === "left") {
        setColLeft((previous) => clampWidth(previous + step, LEFT_MIN, LEFT_MAX))
      } else {
        setColRight((previous) => clampWidth(previous - step, RIGHT_MIN, RIGHT_MAX))
      }
    } else if (event.key === "Home") {
      if (side === "left") setColLeft(LEFT_DEFAULT)
      else setColRight(RIGHT_DEFAULT)
    } else {
      handled = false
    }
    if (handled) {
      event.preventDefault()
    }
  }, [])

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
  }, [])

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
  }, [settings.update])

  /** 应用摄影信息卡指定变体（统一版式画廊中的卡片变体切换）。 */
  const handleApplyInfoCardVariant = useCallback((variantId: string): void => {
    const template = BUILT_IN_TEMPLATES.find((t) => t.id === variantId)
    if (template === undefined) {
      return
    }
    userModifiedRef.current = true
    settings.update(normalizeTemplatePatch(template.settingsPatch))
    setActivePresetId(variantId)
  }, [settings.update])

  // 包装 update，标记用户已主动修改设置（阻止默认模板覆盖）。
  // options.historyTag 由连续手势（裁切构图拖动）传入，合并为一条撤销历史。
  const handleSettingsUpdate = useCallback((patch: Partial<RenderSettings>, options?: SettingsUpdateOptions): void => {
    userModifiedRef.current = true
    settings.update(patch, options)
    // 输出/保真设置不影响画布视觉，不应让当前模板的“已应用”状态误消失。
    if (patchContainsVisualSettings(patch)) {
      setActivePresetId(null)
    }
  }, [settings.update])

  // 裁切构图拖动：与其它手动设置变更共用 userModified 语义。
  const handleUpdateImagePlacement = handleSettingsUpdate

  // 包装 updateNumber，同样标记用户已主动修改设置
  const handleSettingsUpdateNumber = useCallback(
    (key: Parameters<typeof settings.updateNumber>[0], value: number, min: number, max: number): void => {
      userModifiedRef.current = true
      settings.updateNumber(key, value, min, max)
      // 数值设置里除 JPEG 质量/自定义长边等输出参数外都是视觉参数；
      // 视觉数值变化后不再代表已应用的内置模板。
      if (!OUTPUT_SETTING_KEYS.has(key)) {
        setActivePresetId(null)
      }
    },
    [settings.updateNumber]
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
  const handleLoadTemplate = useCallback((templateSettings: LayoutSettings): void => {
    userModifiedRef.current = true
    settings.update(applyLayoutSettings(settings.settings, templateSettings))
    setActivePresetId(null)
  }, [settings])

  // 拖拽/导入模板：应用到当前设置（不保存）。
  // 导入的模板也可能是旧格式，走 normalizeTemplateSettings 迁移。
  const handleDropApply = useCallback((templateSettings: LayoutSettings): void => {
    userModifiedRef.current = true
    settings.update(applyLayoutSettings(settings.settings, templateSettings))
    setActivePresetId(null)
  }, [settings])

  // 默认模板自动应用回调：仅在用户未手动修改过设置时生效。
  // 生效时记录 defaultTemplateAppliedRef，避免随后导入再被摄影信息卡覆盖。
  // 默认模板也可能是旧格式，走 normalizeTemplateSettings 迁移。
  const handleDefaultLoaded = useCallback((templateSettings: LayoutSettings): void => {
    if (userModifiedRef.current) {
      return
    }
    defaultTemplateAppliedRef.current = true
    settings.update(applyLayoutSettings(settings.settings, templateSettings))
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

  // 预览图片变化时惰性读取 EXIF；HEIC 使用助手生成的带元数据工作 PNG。
  useEffect(() => {
    exif.ensureExif(activeItem?.filePath ?? queue.activeFilePath)
  }, [activeItem?.filePath, exif.ensureExif, queue.activeFilePath])

  // 计算当前图片的有效摄影身份（每图覆盖 > 摄影预设 > EXIF > 空）。
  // 缓存结果，避免每次渲染生成新对象导致模板画廊 memo 与下游解析重复执行。
  const selectedIdentity = useMemo(() => {
    if (activeItem === null) {
      return null
    }
    return queue.getEffectiveIdentity(activeItem.id, presets.presets, assets.store, exif.exifByPath)
  }, [activeItem, queue.getEffectiveIdentity, presets.presets, assets.store, exif.exifByPath])

  // 计算当前图片各展示字段的来源标识（EXIF / 摄影预设 / 每图覆盖）
  const identitySources = useMemo(() => {
    if (activeItem === null) {
      return null
    }
    return queue.getIdentitySources(activeItem.id, presets.presets, assets.store, exif.getExifByPath())
  }, [queue, activeItem, presets.presets, assets.store, exif])

  // 当前照片 EXIF 读取状态（U12 空态）：失败 / 在途 / 引擎确认无信息。
  const activeExifState = useMemo((): PhotoInfoExifState | null => {
    if (activeItem === null) {
      return null
    }
    const failure = exif.exifFailures.get(activeItem.sourcePath) ?? exif.exifFailures.get(activeItem.filePath)
    if (failure !== undefined) {
      return { status: "failed", message: failure }
    }
    if (exif.exifInFlight.has(activeItem.sourcePath) || exif.exifInFlight.has(activeItem.filePath)) {
      return { status: "loading" }
    }
    if (exif.exifByPath.has(activeItem.sourcePath) || exif.exifByPath.has(activeItem.filePath)) {
      return { status: "empty" }
    }
    // 尚未发起读取（如浏览器模式）：不臆断原因，保持逐字段「未设置」。
    return null
  }, [activeItem, exif])

  const retryActiveExif = useCallback((): void => {
    if (activeItem !== null) {
      exif.ensureExif(activeItem.filePath)
    }
  }, [activeItem, exif])

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

  // 版式画廊缩略图与主预览共用同一份「有效渲染设置」：变量解析、每图覆盖与
  // 品牌结果在此解析一次，缩略图不再显示未解析的 {Camera} 占位符（U03）。
  const resolvedGallerySettings = useMemo(
    () => buildResolvedRenderSettings(settings.settings, resolvedTextOverride, resolvedTextLayers, resolvedBrand),
    [settings.settings, resolvedTextOverride, resolvedTextLayers, resolvedBrand]
  )

  const preview = usePreview(
    queue.activeFilePath,
    settings.settings,
    settings.settingsVersion,
    resolvedTextOverride,
    resolvedTextLayers,
    resolvedBrand,
    queue.activeImageProcessing
  )

  // 缩略图几何的原图事实：与主预览同源（引擎解码/预检），缺省时退化为代理图语义。
  const gallerySourceDimensions = useMemo(() => {
    if (preview.kind !== "active") {
      return null
    }
    const decode = preview.engineResponse?.sourceDecode
    const width = decode?.fullWidth ?? preview.engineResponse?.fidelityReport?.source?.orientedWidth
      ?? preview.engineResponse?.fidelityReport?.source?.width
    const height = decode?.fullHeight ?? preview.engineResponse?.fidelityReport?.source?.orientedHeight
      ?? preview.engineResponse?.fidelityReport?.source?.height
    return typeof width === "number" && typeof height === "number" && width > 0 && height > 0
      ? { width, height }
      : null
  }, [preview])

  // 引擎是否可用：仅在「健康端点连续 ready」时为 true。
  // loading/error 都视为不可用，UI 据此禁用导出按钮、提示用户当前为本地预览模式。
  const engineAvailable = health.kind === "ready"
  const { state: capabilitiesState, recheck: recheckCapabilities } = useEngineCapabilities(engineAvailable)
  const capabilities = capabilitiesState.kind === "ready" ? capabilitiesState.capabilities : null
  // U07：档位不可用时在选择保存位置之前解释并禁用提交；后端预检仍是最终防线。
  const exportTier = queue.activeImageProcessing != null ? "custom" : settings.settings.tier ?? "standard-delivery"
  const tierUnavailableReason: string | null = capabilitiesState.kind === "ready" && exportTier !== "custom"
    ? (capabilitiesState.capabilities.tiers[exportTier]?.available === true
      ? null
      : (capabilitiesState.capabilities.tiers[exportTier]?.reason ?? "当前引擎能力不足，所选导出档位不可用"))
    : null
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
  // 冻结设置由 useExportController 显式传入，避免等待 EXIF 时读取到之后的编辑。
  type ResolvedQueueItem = {
    readonly textOverride: string | null
    readonly resolvedLayers: readonly (string | null)[]
    readonly brand: string | null
  }

  // 每图解析延迟到批量导出时逐项执行：避免用户在文字框每次击键时
  // 对全队列重复做变量解析（queueResolved* 不再全量预计算）。
  // EXIF 经 getExifByPath() 读取最新缓存：导出前确保全部 EXIF 已读取，解析时取到最新值。
  const resolveQueueItem = useCallback(
    (item: QueueItem, renderSettings: RenderSettings = settings.settings): ResolvedQueueItem => {
      // 导出控制器传入的是任务开始时复制的 QueueItem；不能再按 id 回读实时队列，
      // 否则用户在 EXIF 等待期间编辑每图覆盖会污染已经冻结的 RenderRecipe。
      const identity = resolveIdentityForQueueItem(
        item,
        presets.presets,
        assets.store,
        exif.getExifByPath()
      )
      const textOverride = item.textOverride !== null
        ? resolveEffectiveText(item.textOverride, identity)
        : null
      const resolvedLayers = renderSettings.textLayers.map((layer) => {
        if (!layer.enabled || layer.content.length === 0) {
          return null
        }
        return resolveEffectiveText(layer.content, identity)
      })
      const brand = detectBrandFromIdentity(identity.camera).label
      return { textOverride, resolvedLayers, brand }
    },
    [queue, presets.presets, assets.store, settings.settings]
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
  const handleApplyPresetToScope = useCallback((presetId: string, scope: OperationScope): void => {
    queue.assignPresetToScope(presetId, scope)
  }, [queue])

  const handleClearPresetFromScope = useCallback((scope: OperationScope): void => {
    queue.clearPresetFromScope(scope)
  }, [queue])

  /** 文本创建摄影预设：沿用资产复用与作用范围语义，迁移到预设管理抽屉。 */
  const handleCreatePresetFromText = useCallback((draft: PresetDraft, scope: OperationScope): void => {
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

  // ---- 导出作用范围 ------------------------------------------------------------
  // 与预设、每图管理共享 operationScope；active 与 checked 始终是独立状态。
  const batchExportItems = useMemo(() => {
    switch (operationScope) {
      case "active":
        return queue.activeItem === null ? [] : [queue.activeItem]
      case "checked": {
        const checkedSet = new Set(queue.checkedItemIds)
        return queue.items.filter((item) => checkedSet.has(item.id))
      }
      case "all":
        return queue.items
    }
  }, [operationScope, queue.activeItem, queue.checkedItemIds, queue.items])

  // U13：批量命名样例（实际输出文件名前 3 个）。
  const namingPreview = useMemo(() => {
    const naming = settings.settings.exportNaming ?? { mode: "original-suffix" as const, prefix: "" }
    return buildNamingPreview(batchExportItems, naming, (_item, index) => {
      const format = effectiveExportFormat(settings.settings, batchExportItems[index]?.imageProcessing)
      return format === "jpeg" ? "jpg" : format === "tiff" ? "tif" : "png"
    })
  }, [batchExportItems, settings.settings])

  const batchExportLabel = useMemo(() => {
    if (batchExportItems.length === 0) {
      return ""
    }
    switch (operationScope) {
      case "active":
        return "按范围导出当前图片"
      case "checked":
        return `批量导出已选 ${batchExportItems.length} 张`
      case "all":
        return `批量导出 ${batchExportItems.length} 张`
    }
  }, [batchExportItems.length, operationScope])

  // 导出控制器位于页面根级：页签切换不会卸载已提交任务的状态，
  // 进度与取消入口始终由底部 Dock 持有并可恢复操作。
  const exportController = useExportController({
    state: preview,
    settings: settings.settings,
    queueItems: queue.items,
    batchExportItems,
    resolveQueueItem,
    prepareExifForExport: exif.ensureExifForExport,
    autoOpenExportDirectory: true,
    engineAvailable,
    capabilities
  })

  // 输出摘要（U04）：从实际档位/格式设置与已知源图事实生成，展示在 Dock。
  // 源图尺寸未知时省略尺寸，不猜测；快速分享档位不使用「原图尺寸」等误导文案。
  const exportSummary = useMemo(() => {
    const currentSettings = settings.settings
    const tierLabels: Record<string, string> = {
      "quick-share": "快速分享",
      "standard-delivery": "标准交付",
      "high-fidelity-archive": "高保真归档",
      custom: "自定义"
    }
    const filmMode = queue.activeImageProcessing != null
    const tierLabel = filmMode ? (currentSettings.borderlessMaster ? "底片无框母版" : "底片带框输出") : tierLabels[currentSettings.tier ?? "standard-delivery"] ?? "标准交付"
    const formatLabel = filmMode
      ? ({ "srgb-jpeg": "sRGB JPEG · 8-bit", "tiff16-srgb": "sRGB TIFF · 16-bit", "tiff16-rec2020": "线性 Rec.2020 TIFF · 16-bit" }[currentSettings.filmOutput ?? (currentSettings.exportFormat === "tiff" ? "tiff16-srgb" : "srgb-jpeg")])
      : currentSettings.exportFormat.toUpperCase()
    const locationLabel = currentSettings.metadataPolicy === "strip"
      ? "移除全部元数据"
      : currentSettings.metadataPolicy === "remove-location"
        ? "移除位置信息"
        : "保留元数据"
    const sourceItem = exportController.lastPreflight?.items[0]?.report?.source ?? null
    const decode = preview.kind === "active" ? preview.engineResponse?.sourceDecode ?? null : null
    const sourceWidth = sourceItem?.orientedWidth ?? sourceItem?.width ?? decode?.fullWidth ?? null
    const sourceHeight = sourceItem?.orientedHeight ?? sourceItem?.height ?? decode?.fullHeight ?? null
    const dimensions = !filmMode && sourceWidth !== null && sourceHeight !== null && sourceWidth > 0 && sourceHeight > 0
      ? calculateOutputPixelDimensions(sourceWidth, sourceHeight, currentSettings)
      : null
    const sizeLabel = dimensions === null
      ? null
      : `${dimensions.width}×${dimensions.height} px`
    return [
      tierLabel,
      formatLabel,
      ...(sizeLabel === null ? [] : [sizeLabel]),
      locationLabel
    ].join(" · ")
  }, [exportController.lastPreflight, preview, settings.settings, queue.activeImageProcessing])


  // ---- 全局撤销协调（U05） ----------------------------------------------------
  // 队列与设置各自维护撤销栈（既有结构），这里只按栈顶全局序号选择最近一次
  // 可撤销操作，不引入全局状态框架。栈顶描述同时用于按钮提示。
  const coordinatedUndo = useCallback((): void => {
    const queueTop = queue.topUndo
    const settingsTop = settings.topUndo
    if (queueTop !== null && (settingsTop === null || queueTop.seq >= settingsTop.seq)) {
      queue.undo()
      return
    }
    if (settingsTop !== null) {
      // 撤销设置会恢复到某个历史快照，无法可靠推断它对应哪个视觉模板；
      // 清除“已应用”标记，避免显示虚假的模板状态。
      setActivePresetId(null)
      settings.undo()
    }
  }, [queue, settings])

  const coordinatedRedo = useCallback((): void => {
    const queueTop = queue.topRedo
    const settingsTop = settings.topRedo
    // 重做栈沿用原操作序号，应先恢复较早发生的操作，与撤销选最新操作相反。
    if (queueTop !== null && (settingsTop === null || queueTop.seq <= settingsTop.seq)) {
      queue.redo()
      return
    }
    if (settingsTop !== null) {
      // 与撤销一致：历史快照不携带模板标记，重做后不保留可能失真的“已应用”。
      setActivePresetId(null)
      settings.redo()
    }
  }, [queue, settings])

  /** 统一工作台快捷键；输入控件和管理抽屉内不拦截用户文本编辑。 */
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) {
        return false
      }
      return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
    }
    /** 原生可交互元素自行处理 Space/Delete/方向键；全局单键快捷键不得劫持。 */
    const INTERACTIVE_TARGET_SELECTOR = [
      "button",
      "a",
      "summary",
      "[role='button']",
      "[role='tab']",
      "[role='menuitem']",
      "[role='separator']"
    ].join(", ")
    const isInteractiveTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) {
        return false
      }
      if (target instanceof HTMLElement
        && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) {
        return true
      }
      return target.closest(INTERACTIVE_TARGET_SELECTOR) !== null
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target) || (event.target instanceof HTMLElement && event.target.closest('[role="dialog"]') !== null)) {
        return
      }
      // 快捷键速查面板打开时暂停工作台快捷键；关闭行为由面板自身处理（Esc 或 ?）。
      if (shortcutOverlayOpen) {
        return
      }
      const key = event.key.toLowerCase()
      const withModifier = event.metaKey || event.ctrlKey

      // `?` 打开快捷键速查面板；输入控件内已由上方守卫排除。
      // 帮助抽屉等模态对话框打开期间不叠加第二个面板（与 \ 守卫一致）。
      if (event.key === "?" && document.querySelector('[role="dialog"]') === null) {
        event.preventDefault()
        setShortcutOverlayOpen(true)
        return
      }

      if (withModifier && key === "z") {
        event.preventDefault()
        if (event.shiftKey) {
          coordinatedRedo()
        } else {
          coordinatedUndo()
        }
        return
      }
      if (withModifier && event.key === "Enter") {
        event.preventDefault()
        void (operationScope === "active"
          ? exportController.startSingleExport()
          : exportController.startBatchExport())
        return
      }

      // `?` 与带修饰键的全局命令之后，交互控件保留原生键盘行为：
      // Space 激活按钮、Delete 由控件自行决定、方向键用于页签/分栏手柄。
      if (isInteractiveTarget(event.target)) {
        return
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        if (queue.items.length === 0) return
        const currentIndex = queue.items.findIndex((item) => item.id === queue.activeItemId)
        const baseIndex = currentIndex < 0 ? 0 : currentIndex
        const nextIndex = event.key === "ArrowUp"
          ? Math.max(0, baseIndex - 1)
          : Math.min(queue.items.length - 1, baseIndex + 1)
        if (queue.items[nextIndex] !== undefined && nextIndex !== currentIndex) {
          event.preventDefault()
          queue.setActive(queue.items[nextIndex]!.id)
        }
        return
      }
      if (event.key === " ") {
        if (queue.activeItemId !== null) {
          event.preventDefault()
          queue.toggleChecked(queue.activeItemId)
        }
        return
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (queue.activeItemId !== null) {
          event.preventDefault()
          queue.removeItem(queue.activeItemId)
        }
        return
      }
      if (key === "f") {
        event.preventDefault()
        setViewportCommand((previous) => ({ type: "fit", sequence: (previous?.sequence ?? 0) + 1 }))
        return
      }
      if (event.key === "1") {
        event.preventDefault()
        setViewportCommand((previous) => ({ type: "actual", sequence: (previous?.sequence ?? 0) + 1 }))
        return
      }
      if (key === "e") {
        event.preventDefault()
        void (operationScope === "active"
          ? exportController.startSingleExport()
          : exportController.startBatchExport())
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [coordinatedRedo, coordinatedUndo, exportController, operationScope, queue, shortcutOverlayOpen])

  // 空队列统一显示欢迎页；有照片后固定进入渐进式三栏工作台。
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

  // 根级唯一拖放路由：模板和图片绝不会同时处理同一个 drop 事件。
  const workspaceDrop = useWorkspaceDropRouter({ onImagePaths: handleWelcomeDropFiles })

  const settingsController = useMemo(() => ({
    ...settings,
    update: handleSettingsUpdate,
    updateNumber: handleSettingsUpdateNumber,
    updateTextLayer: handleUpdateTextLayer,
    resetTextLayers: handleResetTextLayers,
    replaceTextLayers: handleReplaceTextLayers,
    // 设置面板内的撤销/重做同样会让模板标记失真，与全局协调撤销保持一致。
    undo: (): void => {
      setActivePresetId(null)
      settings.undo()
    },
    redo: (): void => {
      setActivePresetId(null)
      settings.redo()
    }
  }), [handleResetTextLayers, handleReplaceTextLayers, handleSettingsUpdate, handleSettingsUpdateNumber, handleUpdateTextLayer, settings])

  const identitySourceFallback = {
    camera: null,
    lens: null,
    film: null,
    location: null,
    frameNumber: null,
    captureFormat: null
  } as const

  // 右侧页签：样式 / 摄影信息 / 底片 / 输出；资料库、预设和用户版式均在抽屉中管理。
  const workspaceTabs = useMemo((): readonly WorkspaceTab[] => [
    {
      id: "style",
      label: "样式",
      content: (
        <div className="workspaceTabStack">
          <fieldset className="workspacePreviewBackground">
            <legend className="settingLabel">预览背景</legend>
            <div className="workspacePreviewBackgroundButtons" role="group" aria-label="预览背景">
              {(["black", "gray", "white"] as const).map((background) => (
                <button
                  key={background}
                  type="button"
                  className={`ghostButton workspacePreviewBackgroundButton${previewBackground === background ? " workspacePreviewBackgroundButtonActive" : ""}`}
                  aria-pressed={previewBackground === background}
                  onClick={() => handlePreviewBackgroundChange(background)}
                >
                  {background === "black" ? "中性黑" : background === "gray" ? "中性灰" : "中性白"}
                </button>
              ))}
            </div>
          </fieldset>
          <TemplateGallery
            activePresetId={activePresetId}
            recommendedTemplateId={recommendedTemplateId}
            currentImage={preview.kind === "active" ? preview.currentImage : null}
            currentSettings={resolvedGallerySettings}
            sourceDimensions={gallerySourceDimensions}
            onApply={handleApplyPreset}
            onApplyInfoCardVariant={handleApplyInfoCardVariant}
          />
          <button type="button" className="ghostButton workspaceManagementButton" onClick={() => setDrawer("templates")}>
            管理用户版式
          </button>
          <SettingsPanel
            controller={settingsController}
            hasSelectedImage={queue.activeFilePath !== null}
            selectedFilePath={queue.activeFilePath}
            textOverride={queue.activeTextOverride}
            setTextOverride={queue.setActiveTextOverride}
            detectedBrandLabel={detectedBrand?.label ?? null}
            capabilities={capabilities}
            showOutputSettings={false}
          />
        </div>
      )
    },
    {
      id: "info",
      label: "摄影信息",
      content: activeItem !== null && selectedIdentity !== null ? (
        <div className="workspaceTabStack">
          <PhotoInfoSummary
            effectiveIdentity={selectedIdentity}
            sources={identitySources ?? identitySourceFallback}
            exifState={activeExifState}
            onRetryExif={retryActiveExif}
          />
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
          <div className="workspaceManagementActions">
            <button type="button" className="ghostButton workspaceManagementButton" onClick={() => setDrawer("presets")}>
              管理拍摄信息预设
            </button>
            <button type="button" className="ghostButton workspaceManagementButton" onClick={() => setDrawer("assets")}>
              打开资料库
            </button>
          </div>
        </div>
      ) : (
          <p className="settingsCapabilityHint">请先选择一张图片。</p>
      )
    },
    {
      id: "film",
      label: "底片",
      content: (
        <div className="workspaceFilmTab">
          <FilmEditingPanel
            config={queue.activeImageProcessing}
            error={queue.activeImageProcessingError}
            sourcePath={queue.activeItem?.sourcePath ?? null}
            capabilities={capabilities}
            onChange={queue.setActiveImageProcessing}
            operationScope={operationScope}
            onOperationScopeChange={setOperationScope}
            onSync={queue.syncImageProcessing}
          />
          <FilmReferencePanel />
        </div>
      )
    },
    {
      id: "output",
      label: "输出",
      content: (
        <div className="workspaceOutputTab">
          <h2 className="workspaceOutputTitle">输出</h2>
          <p className="settingsCapabilityHint">提交按钮固定在底部 Dock；这里的设置用于生成导出文件。</p>
          <dl className="workspaceOutputSummary">
            <div><dt>格式</dt><dd>{settings.settings.exportFormat.toUpperCase()}</dd></div>
            <div><dt>尺寸</dt><dd>{settings.settings.outputSizePreset === "original" ? "原图尺寸" : settings.settings.outputSizePreset}</dd></div>
            <div><dt>范围</dt><dd>{operationScope === "active" ? "当前图片" : operationScope === "checked" ? `已选 ${queue.checkedCount} 张` : `全部 ${queue.items.length} 张`}</dd></div>
          </dl>
          {queue.activeImageProcessing !== null && (
            <fieldset className="filmSection">
              <legend>底片输出</legend>
              <label className="filmField">
                <span>输出组合</span>
                <select
                  value={settings.settings.filmOutput ?? (settings.settings.exportFormat === "tiff" ? "tiff16-srgb" : "srgb-jpeg")}
                  onChange={(event) => {
                    const value = event.target.value as "srgb-jpeg" | "tiff16-srgb" | "tiff16-rec2020"
                    settingsController.update({
                      filmOutput: value,
                      exportFormat: value === "srgb-jpeg" ? "jpeg" : "tiff"
                    })
                  }}
                >
                  <option value="srgb-jpeg" disabled={capabilities?.filmDigitization?.outputs["srgb-jpeg"] !== true}>sRGB JPEG 分享成品（8-bit）</option>
                  <option value="tiff16-srgb" disabled={capabilities?.filmDigitization?.outputs["tiff16-srgb"] !== true}>16-bit sRGB TIFF 母版</option>
                  <option value="tiff16-rec2020" disabled={capabilities?.filmDigitization?.outputs["tiff16-rec2020"] !== true}>16-bit 线性 Rec.2020 TIFF 母版</option>
                </select>
              </label>
              <label className="filmField filmCheckboxField">
                <input
                  type="checkbox"
                  checked={settings.settings.borderlessMaster ?? false}
                  onChange={(event) => settingsController.update({ borderlessMaster: event.target.checked })}
                />
                <span>不带框母版（禁用边框、文字、Logo）</span>
              </label>
              <p className="settingsCapabilityHint">
                照片与装饰使用浮点合成，支持带框及不带框母版。输出 ICC 与像素编码匹配，元数据按当前导出策略写回。
              </p>
            </fieldset>
          )}
          <SettingsPanel
            controller={settingsController}
            hasSelectedImage={queue.activeFilePath !== null}
            selectedFilePath={queue.activeFilePath}
            textOverride={queue.activeTextOverride}
            setTextOverride={queue.setActiveTextOverride}
            detectedBrandLabel={detectedBrand?.label ?? null}
            capabilities={capabilities}
            capabilitiesState={capabilitiesState}
            onRecheckCapabilities={recheckCapabilities}
            namingPreview={namingPreview}
            filmMode={queue.activeImageProcessing != null}
            showStyleSettings={false}
          />
          <p className="settingsCapabilityHint">快捷键：⌘/Ctrl + Enter 导出当前范围。</p>
        </div>
      )
    }
  ], [
    activeItem, activePresetId, assets, detectedBrand, handleApplyInfoCardVariant, handleApplyPreset,
    handlePreviewBackgroundChange, identitySources, operationScope, presets, selectedIdentity,
    preview, previewBackground, queue, recommendedTemplateId, settings, settingsController, capabilities
  ])

  const workspaceStyle = {
    "--ws-left": `${colLeft}px`,
    "--ws-right": `${rightCollapsed ? RIGHT_COLLAPSED_WIDTH : colRight}px`
  } as React.CSSProperties

  const isEmpty = queue.items.length === 0

  return (
    <div className="workspaceShell" data-theme={theme}>
      <TopBar
        runtime={runtime}
        hasPhotos={!isEmpty}
        theme={theme}
        onThemeChange={handleThemeChange}
        onPickFiles={handleWelcomePickFiles}
        onPickFolder={handleWelcomePickFolder}
        onOpenHelp={() => setDrawer("help")}
      />

      {isEmpty ? (
        <main className="workspaceWelcomeHost">
          <WorkspaceWelcome
            isBrowserMode={queue.isBrowserMode}
            onPickFiles={handleWelcomePickFiles}
            onPickFolder={handleWelcomePickFolder}
            onLoadSamples={handleWelcomeLoadSamples}
          />
        </main>
      ) : (
        <>
          <main className={`workspace ${resizing !== null ? "workspaceResizing" : ""}`} style={workspaceStyle}>
          <div className="workspaceLeft">
            <QueuePanel queue={queue} showImportActions={false} />
          </div>
          <div className="workspaceCenter">
            <PreviewPanel
              state={preview}
              settings={settings.settings}
              hasSelectedImage={queue.activeFilePath !== null}
              batchExportLabel={batchExportLabel}
              exportController={exportController}
              resolvedBrand={resolvedBrand}
              resolvedTextOverride={resolvedTextOverride}
              resolvedTextLayers={resolvedTextLayers}
              engineAvailable={engineAvailable}
              engineUnavailableReason={engineUnavailableReason}
              viewportCommand={viewportCommand}
              previewBackground={previewBackground}
              activeTemplateId={activePresetId}
              imageProcessing={queue.activeImageProcessing}
              onUpdateImageProcessing={queue.setActiveImageProcessing}
              onSourceVersion={(version) => { if (queue.activeItemId !== null) queue.recordSourceVersion(queue.activeItemId, version) }}
              showExportControls={false}
              onUpdateImagePlacement={handleUpdateImagePlacement}
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
              <div className="workspaceInspector">
                <header className="workspaceInspectorHeader">
                  <div>
                    <span className="workspaceInspectorKicker">WORKSPACE</span>
                    <h2 className="workspaceInspectorTitle">工作台</h2>
                  </div>
                  <button
                    type="button"
                    className="inspectorCollapseButton"
                    onClick={() => setRightCollapsed(true)}
                    aria-label="折叠工作台面板"
                    title="折叠工作台面板"
                  >
                    收起
                  </button>
                </header>
                <WorkspaceTabs tabs={workspaceTabs} activeTab={activeTab} onChange={setActiveTab} />
              </div>
            )}
          </div>

          {/* 左栏拖拽手柄（贴近左栏右边界） */}
          <div
            className="resizeHandle resizeHandleLeft"
            role="separator"
            aria-orientation="vertical"
            aria-label="调整源图片栏宽度"
            aria-valuenow={Math.round(colLeft)}
            aria-valuemin={LEFT_MIN}
            aria-valuemax={LEFT_MAX}
            tabIndex={0}
            onPointerDown={startResize("left")}
            onKeyDown={resizeWithKeyboard("left")}
          />
          {/* 右栏拖拽手柄（折叠时隐藏） */}
          {!rightCollapsed && (
            <div
              className="resizeHandle resizeHandleRight"
              role="separator"
              aria-orientation="vertical"
              aria-label="调整检查器栏宽度"
              aria-valuenow={Math.round(colRight)}
              aria-valuemin={RIGHT_MIN}
              aria-valuemax={RIGHT_MAX}
              tabIndex={0}
              onPointerDown={startResize("right")}
              onKeyDown={resizeWithKeyboard("right")}
            />
          )}
          </main>
          <div className="workspaceExportDock">
            <ExportDock
              state={preview}
              hasSelectedImage={queue.activeFilePath !== null}
              batchExportLabel={batchExportLabel}
              exportController={exportController}
              engineAvailable={engineAvailable}
              engineUnavailableReason={engineUnavailableReason}
              operationScope={operationScope}
              onOperationScopeChange={setOperationScope}
              checkedCount={queue.checkedCount}
              queueCount={queue.items.length}
              exportSummary={exportSummary}
              tierUnavailableReason={tierUnavailableReason}
            />
          </div>
        </>
      )}

      {/* 健康时不渲染；异常只有一条非阻塞横幅，诊断内容在抽屉中查看。 */}
      {runtime.engine.managed && health.kind !== "ready" && <EngineStatusBar health={health} />}
      <TemplateDropOverlay
        droppedFile={workspaceDrop.droppedTemplateFile}
        onDismiss={workspaceDrop.dismissDroppedTemplate}
        onApply={handleDropApply}
        onSave={handleDropSave}
      />

      <ModalDrawer open={drawer === "templates"} title="管理用户版式" onClose={() => setDrawer(null)}>
        <TemplatePanel
          templateController={templates}
          currentSettings={settings.settings}
          currentImage={preview.kind === "active" ? preview.currentImage : null}
          onLoad={handleLoadTemplate}
          onImportTemplate={handleImportTemplate}
        />
      </ModalDrawer>
      <ModalDrawer open={drawer === "presets"} title="管理拍摄信息预设" onClose={() => setDrawer(null)}>
        <PresetTextComposer
          operationScope={operationScope}
          onCreate={handleCreatePresetFromText}
        />
        <ShootingPresetPanel
          presets={presets.presets}
          lastError={presets.lastError}
          onSavePreset={presets.savePreset}
          onDuplicatePreset={presets.duplicatePreset}
          onDeletePreset={handleDeletePreset}
          onClearError={presets.clearError}
          onApplyToScope={handleApplyPresetToScope}
          onClearScope={handleClearPresetFromScope}
          operationScope={operationScope}
          onOperationScopeChange={setOperationScope}
          hasSelectedImage={queue.activeFilePath !== null}
          queueCount={queue.items.length}
          checkedCount={queue.checkedCount}
          assetStore={assets.store}
          presetUsageCounts={presetUsageCounts}
        />
      </ModalDrawer>
      <ModalDrawer open={drawer === "assets"} title="资料库" onClose={() => setDrawer(null)}>
        <AssetLibraryPanel assetController={assets} filmStocks={filmStocks} />
      </ModalDrawer>
      <ModalDrawer open={drawer === "help"} title="帮助" onClose={() => setDrawer(null)}>
        <HelpPanel />
      </ModalDrawer>

      <ShortcutOverlay open={shortcutOverlayOpen} onClose={() => setShortcutOverlayOpen(false)} />
    </div>
  )
}
