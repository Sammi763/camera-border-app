/**
 * 工作台页面：三栏布局的主工作区。
 *
 * 布局：左（源图片队列）、中（主预览）、右（检查器）。
 * - 左右两栏宽度可拖拽调整，并持久化到 sessionStorage，会话内保持。
 * - 右栏可折叠为竖条，给预览区让出空间。
 * - 检查器用折叠分组承载：渲染设置 / 摄影信息 / 模板 / 摄影预设 / 资产库。
 * 所有业务状态在此组装，各面板只接收 props。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { TopBar } from "../components/layout/TopBar"
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
import { BUILT_IN_TEMPLATES } from "../features/template/presets/builtInTemplates"
import { fetchFilmStocks } from "../services/engine/filmStocksApi"
import type { DesktopRuntime } from "../types/runtime"
import type { RenderSettings } from "../features/settings/types"
import type { Template } from "../features/template/types"
import type { FilmStock } from "../features/metadata/types"
import type { QueueItem } from "../features/queue/types"

type WorkspacePageProps = {
  readonly runtime: DesktopRuntime
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

const clampWidth = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const WorkspacePage = ({ runtime }: WorkspacePageProps): JSX.Element => {
  const health = useEngineHealth()
  const queue = useQueue()
  const settings = useSettings()
  const userModifiedRef = useRef(false)
  const presets = useShootingPresets()
  const assets = usePhotoAssets()
  const exif = useExifIndex()
  const [filmStocks, setFilmStocks] = useState<readonly FilmStock[]>([])
  const [activePresetId, setActivePresetId] = useState<string | null>(null)

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
  }, [])

  // 应用内置视觉模板 patch，同时更新活跃模板 id。
  // 内置模板可能含旧单段字段（textContent 等），统一走 normalizeTemplatePatch 迁移。
  const handleApplyPreset = useCallback((patch: Partial<RenderSettings>): void => {
    userModifiedRef.current = true
    settings.update(normalizeTemplatePatch(patch))
    const matched = BUILT_IN_TEMPLATES.find((t) => t.settingsPatch === patch)
    setActivePresetId(matched?.id ?? null)
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
  // 默认模板也可能是旧格式，走 normalizeTemplateSettings 迁移。
  const handleDefaultLoaded = useCallback((templateSettings: RenderSettings): void => {
    if (userModifiedRef.current) {
      return
    }
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

  // 清除全部图片的预设绑定
  const handleClearAllPresetBindings = useCallback((): void => {
    queue.clearAllPresetBindings()
  }, [queue])

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

  // 获取当前选中图片的信息
  const selectedItem = queue.items.find((item) => item.isSelected)
  const selectedTextOverride = selectedItem?.textOverride ?? null

  // 选中图片变化时惰性读取 EXIF（供身份链与变量解析使用）
  useEffect(() => {
    exif.ensureExif(queue.selectedFilePath)
  }, [exif.ensureExif, queue.selectedFilePath])

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
  // getExifByPath() 读取最新缓存：导出等待 EXIF 期间刚到达的数据也能即时生效
  const selectedIdentity = selectedItem !== undefined
    ? queue.getEffectiveIdentity(selectedItem.id, presets.presets, assets.store, exif.getExifByPath())
    : null

  // 快捷文字覆盖：当前图片的独立文字覆盖。
  // 用于 buildTextsFromSettings 中覆盖 textLayers[0].content。
  // 变量解析后传给 usePreview 和 PreviewPanel。
  const resolvedTextOverride = useMemo(() => {
    if (selectedTextOverride === null) {
      return null
    }
    return resolveEffectiveText(selectedTextOverride, selectedIdentity)
  }, [selectedTextOverride, selectedIdentity])

  // 多段文字图层变量解析：对当前选中图片的每个 textLayer 解析变量
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
    queue.selectedFilePath,
    settings.settings,
    settings.settingsVersion,
    resolvedTextOverride,
    resolvedTextLayers,
    resolvedBrand
  )

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

  // ---- 右侧检查器折叠分组 ---------------------------------------------------
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
          hasSelectedImage={queue.selectedFilePath !== null}
          selectedFilePath={queue.selectedFilePath}
          textOverride={queue.selectedTextOverride}
          setTextOverride={queue.setSelectedTextOverride}
          detectedBrandLabel={detectedBrand?.label ?? null}
        />
      )
    },
    {
      id: "photo-identity",
      label: "摄影信息",
      content: selectedItem !== undefined && selectedIdentity !== null ? (
        <PhotoIdentityPanel
          effectiveIdentity={selectedIdentity}
          identityOverride={selectedItem.identityOverride}
          presetId={selectedItem.presetId}
          presets={presets.presets}
          assetStore={assets.store}
          onUpdateOverride={queue.setSelectedIdentityOverride}
          onClearOverride={queue.clearSelectedIdentityOverride}
          hasSelectedImage={true}
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
          onApplyToSelected={queue.assignPresetToSelected}
          onApplyToAll={queue.assignPresetToAll}
          onClearSelectedPreset={queue.clearSelectedPreset}
          onClearAllPresetBindings={handleClearAllPresetBindings}
          hasSelectedImage={queue.selectedFilePath !== null}
          queueCount={queue.items.length}
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
    queue, selectedItem, selectedIdentity, presets, assets, filmStocks,
    handleDeletePreset, handleClearAllPresetBindings, presetUsageCounts
  ])

  const workspaceStyle = {
    "--ws-left": `${colLeft}px`,
    "--ws-right": `${rightCollapsed ? RIGHT_COLLAPSED_WIDTH : colRight}px`
  } as React.CSSProperties

  return (
    <div className="workspaceShell">
      <TopBar runtime={runtime} health={health} />
      <main className={`workspace ${resizing !== null ? "workspaceResizing" : ""}`} style={workspaceStyle}>
        <div className="workspaceLeft">
          <QueuePanel queue={queue} />
        </div>
        <div className="workspaceCenter">
          <PreviewPanel
            state={preview}
            settings={settings.settings}
            hasSelectedImage={queue.selectedFilePath !== null}
            queueItems={queue.items}
            resolveQueueItem={resolveQueueItem}
            prepareExifForExport={exif.ensureExifForExport}
            resolvedBrand={resolvedBrand}
            resolvedTextOverride={resolvedTextOverride}
            resolvedTextLayers={resolvedTextLayers}
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
