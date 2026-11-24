import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react"
import { FilmWorkspacePreview, type FilmCurveTools } from "../../editing/components/FilmWorkspacePreview"
import type { ImageProcessingConfig } from "../../../types/imageProcessing"
import { Panel } from "../../../components/layout/Panel"
import {
  calculateCompositionLayout,
  decorationScaleFor,
  calculateFocalFromPointer,
  drawBorderStyle,
  drawImageGridOverlay,
  drawPreviewToCanvas,
  type CanvasDrawableSource,
  type CompositionLayout,
  type PreviewRect
} from "../canvas/canvasRenderer"
import { calculateImagePlacementGeometry } from "../canvas/imagePlacementGeometry"
import {
  calculateOutputPixelDimensions,
  imagePlacementFromSettings,
  summarizeImageArea
} from "../../settings/utils/imageArea"
import { usePreviewViewport } from "../hooks/usePreviewViewport"
import { useActualSizePreview } from "../hooks/useActualSizePreview"
import { buildResolvedRenderSettings } from "../../settings/utils/buildTexts"
import { sourceDecodeLabel } from "../hooks/useExportController"
import { ExportDock } from "./ExportDock"
import type { ExportController } from "../hooks/useExportController"
import type { RenderSettings, SettingsUpdateOptions } from "../../settings/types"
import type { EngineSyncStatus, PreviewState } from "../types"
import type { SourceDecode } from "../../../types/preview"

export { sourceDecodeLabel } from "../hooks/useExportController"
export type { ResolvedQueueItem } from "../hooks/useExportController"

type PreviewPanelProps = {
  readonly onEditText?: ((id: string) => void) | undefined
  readonly curveTools?: FilmCurveTools | undefined
  readonly imageProcessing?: ImageProcessingConfig | null
  readonly onUpdateImageProcessing?: (config: ImageProcessingConfig, options?: { historyTag?: string; description?: string }) => void
  readonly onSourceVersion?: (version: string) => void
  readonly state: PreviewState
  readonly settings: RenderSettings
  readonly hasSelectedImage: boolean
  /** 批量导出按钮文案；空字符串表示当前范围没有可批量导出的图片。 */
  readonly batchExportLabel: string
  /** 根级控制器持有任务状态，工作台页签切换不会中断导出。 */
  readonly exportController: ExportController
  /** 当前选中图片识别到的品牌文字。 */
  readonly resolvedBrand?: string | null
  /** 当前选中图片的已解析快捷单段文字覆盖。 */
  readonly resolvedTextOverride?: string | null
  /** 当前选中图片的已解析多段文字图层内容数组。 */
  readonly resolvedTextLayers?: readonly (string | null)[] | null
  /** 当前 Java 引擎是否可用。 */
  readonly engineAvailable?: boolean
  /** 引擎不可用时的说明。 */
  readonly engineUnavailableReason?: string | null
  /** 由统一工作台快捷键发出的视口命令。 */
  readonly viewportCommand?: PreviewViewportCommand | null
  /** 预览工作区背景，不参与 RenderRecipe。 */
  readonly previewBackground?: PreviewBackground
  /** 当前内置版式 id；仅用于编辑态辅助线，不进入 RenderRecipe。 */
  readonly activeTemplateId?: string | null
  /** 最近一次输出预检得到的全分辨率有向源尺寸。 */
  readonly outputSourceDimensions?: SourcePixelDimensions | null
  /**
   * 裁切构图拖动产生的 imagePlacement 更新（含新 focalX/focalY）。
   * 由工作台经 settingsController.update 应用并标记 userModified；
   * 拖动手势经 options.historyTag 合并为一条撤销历史。
   * 缺省时裁切模式下按住拖动保持画布平移语义。
   */
  readonly onUpdateImagePlacement?: ((patch: Partial<RenderSettings>, options?: SettingsUpdateOptions) => void) | undefined
  /** 实际工作台把导出控件放入底部 Dock；单独使用 PreviewPanel 时默认保留。 */
  readonly showExportControls?: boolean
}

type SourcePixelDimensions = {
  readonly width: number
  readonly height: number
}

export type PreviewViewportCommand = {
  readonly type: "fit" | "actual"
  readonly sequence: number
}

export type PreviewBackground = "black" | "gray" | "white"

/** 引擎同步状态对应的中文文案。 */
const engineSyncLabel = (status: EngineSyncStatus): string => {
  switch (status) {
    case "idle":
      return ""
    case "syncing":
      return "正在同步引擎预览"
    case "synced":
      return "引擎预览已同步"
    case "error":
      return "引擎预览失败，当前显示即时预览"
  }
}

const engineSyncClassName = (status: EngineSyncStatus): string => {
  switch (status) {
    case "idle":
      return "previewSyncBadge previewSyncIdle"
    case "syncing":
      return "previewSyncBadge previewSyncSyncing"
    case "synced":
      return "previewSyncBadge previewSyncSynced"
    case "error":
      return "previewSyncBadge previewSyncError"
  }
}

/** 解码来源徽标。 */
const DecodeSourceBadge = ({ sourceDecode }: { readonly sourceDecode: SourceDecode | null }): JSX.Element | null => {
  if (sourceDecode === null || sourceDecode === undefined) {
    return null
  }
  const label = sourceDecodeLabel(sourceDecode)
  if (label === null) {
    return null
  }
  return (
    <span
      className={sourceDecode.mode === "embedded-jpeg" ? "decodeBadge decodeBadgeFallback" : "decodeBadge decodeBadgeDeveloped"}
      title={label}
    >
      {label}
    </span>
  )
}

/** 空态视图。 */
const IdleView = (): JSX.Element => (
  <div className="previewEmpty">
    <span className="previewEmptyLabel">暂无图片</span>
    <span className="previewEmptyHint">请从队列中选择一张图片。</span>
  </div>
)

/** 加载中视图。 */
const LoadingView = ({ filePath }: { readonly filePath: string }): JSX.Element => (
  <div className="previewEmpty">
    <span className="previewEmptyLabel">正在加载图片…</span>
    <span className="previewEmptyHint">{filePath}</span>
  </div>
)

/** 将合成几何信息暴露给可访问性提示与打包回归。 */
const writeCanvasPreviewDiagnostics = (
  canvas: HTMLCanvasElement,
  layout: CompositionLayout | null,
  settings: RenderSettings,
  sourceDimensions: { readonly width: number; readonly height: number },
  logicalWidth: number,
  logicalHeight: number,
  pixelRatio: number
): boolean => {
  const placement = imagePlacementFromSettings(settings)
  const placementGeometry = calculateImagePlacementGeometry(
    sourceDimensions.width,
    sourceDimensions.height,
    placement
  )
  canvas.dataset["previewBorderColor"] = settings.borderColor
  canvas.dataset["previewBorderTop"] = String(settings.borderTop)
  canvas.dataset["previewBorderBottom"] = String(settings.borderBottom)
  canvas.dataset["previewBorderLeft"] = String(settings.borderLeft)
  canvas.dataset["previewBorderRight"] = String(settings.borderRight)
  canvas.dataset["previewCanvasLogicalWidth"] = String(logicalWidth)
  canvas.dataset["previewCanvasLogicalHeight"] = String(logicalHeight)
  canvas.dataset["previewCanvasBackingWidth"] = String(canvas.width)
  canvas.dataset["previewCanvasBackingHeight"] = String(canvas.height)
  canvas.dataset["previewCanvasPixelRatio"] = String(pixelRatio)
  canvas.dataset["previewSourceWidth"] = String(sourceDimensions.width)
  canvas.dataset["previewSourceHeight"] = String(sourceDimensions.height)
  canvas.dataset["previewPlacementMode"] = placement.mode
  canvas.dataset["previewPlacementRotation"] = String(placement.rotation)
  canvas.dataset["previewCropAllowed"] = String(placement.mode === "fill")
  canvas.dataset["previewCropApplied"] = String(placementGeometry !== null
    && placement.mode === "fill"
    && (placementGeometry.rotatedWidth * placementGeometry.scale > placementGeometry.targetWidth + 0.01
      || placementGeometry.rotatedHeight * placementGeometry.scale > placementGeometry.targetHeight + 0.01))
  // 自然合成尺寸 = 原图空间的目标区域 + 边框（与引擎导出构图语义一致）
  canvas.dataset["previewNaturalCanvasWidth"] = placementGeometry === null
    ? ""
    : String(Math.max(1, Math.round(placementGeometry.targetWidth + settings.borderLeft + settings.borderRight)))
  canvas.dataset["previewNaturalCanvasHeight"] = placementGeometry === null
    ? ""
    : String(Math.max(1, Math.round(placementGeometry.targetHeight + settings.borderTop + settings.borderBottom)))
  canvas.dataset["previewViewScale"] = layout === null ? "" : String(layout.viewScale)
  canvas.dataset["previewImageX"] = layout === null ? "" : String(layout.photoRect.x)
  canvas.dataset["previewImageY"] = layout === null ? "" : String(layout.photoRect.y)
  canvas.dataset["previewImageWidth"] = layout === null ? "" : String(layout.photoRect.width)
  canvas.dataset["previewImageHeight"] = layout === null ? "" : String(layout.photoRect.height)
  return layout !== null
}

type CanvasRenderState = {
  readonly logicalWidth: number
  readonly logicalHeight: number
  readonly pixelRatio: number
}

/** 在 Canvas 上按图片区域叠加构图辅助线（仅编辑态；引擎渲染与导出不经过此函数）。 */
const drawGridOverlayOnCanvas = (
  canvas: HTMLCanvasElement,
  layout: CompositionLayout,
  pixelRatio: number
): void => {
  const ctx = canvas.getContext("2d")
  if (ctx === null) {
    return
  }
  ctx.save()
  if (pixelRatio !== 1) {
    ctx.scale(pixelRatio, pixelRatio)
  }
  drawImageGridOverlay(ctx, layout.photoRect)
  ctx.restore()
}

/** 配置 Canvas：CSS 使用逻辑像素，backing store 只按 DPR 放大，不改变 RenderRecipe 几何。 */
const configureCanvas = (
  canvas: HTMLCanvasElement,
  logicalWidth: number,
  logicalHeight: number
): CanvasRenderState => {
  const safeWidth = Math.max(1, Math.round(logicalWidth))
  const safeHeight = Math.max(1, Math.round(logicalHeight))
  const pixelRatio = Math.max(1, Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1)
  const backingWidth = Math.max(1, Math.round(safeWidth * pixelRatio))
  const backingHeight = Math.max(1, Math.round(safeHeight * pixelRatio))
  if (canvas.width !== backingWidth) canvas.width = backingWidth
  if (canvas.height !== backingHeight) canvas.height = backingHeight
  canvas.style.width = `${safeWidth}px`
  canvas.style.height = `${safeHeight}px`
  return { logicalWidth: safeWidth, logicalHeight: safeHeight, pixelRatio }
}

/** Canvas 即时预览组件。 */
const CanvasPreview = ({
  state,
  settings,
  viewportCommand,
  previewBackground = "gray",
  activeTemplateId = null,
  outputSourceDimensions = null,
  onUpdateImagePlacement,
  onEditText
}: {
  readonly state: Extract<PreviewState, { kind: "active" }>
  readonly settings: RenderSettings
  readonly viewportCommand?: PreviewViewportCommand | null
  readonly previewBackground?: PreviewBackground
  readonly activeTemplateId?: string | null
  readonly outputSourceDimensions?: SourcePixelDimensions | null
  readonly onEditText?: ((id: string) => void) | undefined
  readonly onUpdateImagePlacement?: ((patch: Partial<RenderSettings>, options?: SettingsUpdateOptions) => void) | undefined
}): JSX.Element => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [textHits, setTextHits] = useState<readonly { id: string; index: number; rect: PreviewRect }[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawFnRef = useRef<(() => void) | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const logoImageRef = useRef<CanvasDrawableSource | null>(null)
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null)
  const settingsRef = useRef(settings)
  const [isPreviewAreaInsufficient, setIsPreviewAreaInsufficient] = useState(false)
  const renderDimensionsRef = useRef<CanvasRenderState>({ logicalWidth: 1, logicalHeight: 1, pixelRatio: 1 })
  const [renderDimensions, setRenderDimensions] = useState<CanvasRenderState>(renderDimensionsRef.current)
  // ---- 编辑态叠加（不进入 RenderRecipe） ------------------------------------
  /** 按住查看无边框原图（\ 键或工具栏按钮按住）。 */
  const [showOriginal, setShowOriginal] = useState(false)
  /** 构图辅助线开关（三分线 + 中心十字，仅 Canvas 预览绘制）。 */
  const [showGrid, setShowGrid] = useState(false)
  /** 裁切模式下按住拖动 = 更新构图焦点，而非平移画布。 */
  const focalDragRef = useRef(false)
  /** 焦点拖动进行中：用于光标反馈（ref 不触发重绘）。 */
  const [isFocalDragging, setIsFocalDragging] = useState(false)
  /** 焦点拖动手势序号：每次按下递增，两次独立拖动不合并进同一条撤销历史。 */
  const focalGestureRef = useRef(0)
  /** \ 键当前是否被按住：切图后据此决定是否继续显示新图的无边框原图。 */
  const originalKeyHeldRef = useRef(false)
  /** drawFn 闭包读取的最新网格开关（闭包每次渲染重建，ref 保证读取到当前值）。 */
  const gridEnabledRef = useRef(showGrid)
  gridEnabledRef.current = showGrid
  settingsRef.current = settings
  logoImageRef.current = logoImage

  const viewport = usePreviewViewport(state.filePath)
  const viewportState = viewport.state
  const { resetToFit, resetToActual, handleDoubleClick, setDimensions } = viewport
  // 绘制闭包经 ref 读取最新视口状态，避免拖动平移时每次重建回调。
  const viewportStateRef = useRef(viewportState)
  viewportStateRef.current = viewportState
  // 绘制闭包读取的最新像素来源（真实原图像素优先，否则代理图）。
  const pixelImageRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    const logoPath = settings.logo.imagePath ?? null
    const loader = window.desktop?.loadLocalImagePreview
    if (logoPath === null || logoPath.length === 0 || loader === undefined) {
      setLogoImage(null)
      return
    }
    let active = true
    setLogoImage(null)
    void loader(logoPath, 512, 512).then((preview) => {
      if (!active || preview === null) return
      const image = new Image()
      image.onload = () => {
        if (active) setLogoImage(image)
      }
      image.src = preview.dataUrl
    }).catch(() => {
      if (active) setLogoImage(null)
    })
    return () => { active = false }
  }, [settings.logo.imagePath])

  // 按住 \ 查看无边框原图，松开恢复；输入控件与对话框打开期间不拦截。
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) {
        return false
      }
      return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "\\" || event.repeat) {
        return
      }
      // 模态对话框（快捷键速查、管理抽屉）打开期间暂停，与工作台快捷键语义一致。
      if (isEditableTarget(event.target) || document.querySelector('[role="dialog"]') !== null) {
        return
      }
      originalKeyHeldRef.current = true
      setShowOriginal(true)
    }
    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.key === "\\") {
        originalKeyHeldRef.current = false
        setShowOriginal(false)
      }
    }
    // 窗口失焦（如 Cmd+Tab 切走）收不到 keyup，必须显式退出叠加，避免原图卡住。
    const handleBlur = (): void => {
      originalKeyHeldRef.current = false
      setShowOriginal(false)
      focalDragRef.current = false
      setIsFocalDragging(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", handleBlur)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", handleBlur)
    }
  }, [])

  // 切换图片时旧图叠加不残留；若 \ 仍被按住则继续显示新图的无边框原图。
  useEffect(() => {
    setShowOriginal(originalKeyHeldRef.current)
  }, [state.filePath])

  /**
   * 自然合成尺寸：原图空间的目标照片区域 + 边框（RenderRecipe 语义）。
   * 100% 模式的坐标契约 = 1 原图像素 : 1 CSS px，视口状态据此钳制平移范围。
   * 源尺寸未知（引擎事实缺失）时退化为代理图尺寸，与旧几何语义一致。
   */
  const naturalCanvasDimensions = useCallback((currentSettings: RenderSettings): { width: number; height: number } => {
    const source = outputSourceDimensions ?? (state.currentImage === null ? null : {
      width: state.currentImage.naturalWidth, height: state.currentImage.naturalHeight
    })
    if (source === null) return { width: 0, height: 0 }
    const geometry = calculateImagePlacementGeometry(source.width, source.height, imagePlacementFromSettings(currentSettings))
    if (geometry === null) return { width: 0, height: 0 }
    const scale = decorationScaleFor(currentSettings, geometry.targetWidth, geometry.targetHeight)
    return {
      width: Math.max(1, Math.round(geometry.targetWidth + (currentSettings.borderLeft + currentSettings.borderRight) * scale)),
      height: Math.max(1, Math.round(geometry.targetHeight + (currentSettings.borderTop + currentSettings.borderBottom) * scale))
    }
  }, [outputSourceDimensions, state.currentImage])

  useEffect(() => {
    if (viewportCommand?.type === "fit") {
      viewport.resetToFit()
    } else if (viewportCommand?.type === "actual") {
      viewport.resetToActual()
    }
  }, [viewport.resetToActual, viewport.resetToFit, viewportCommand?.sequence, viewportCommand?.type])

  // 100% 模式按需加载原图像素；几何始终使用原图坐标，像素来源如实标注。
  const naturalComposition = useMemo(() => naturalCanvasDimensions(settings), [naturalCanvasDimensions, settings])
  const actualPixels = useActualSizePreview(
    state.filePath,
    outputSourceDimensions === null ? null : naturalComposition,
    viewportState.mode === "actual"
  )
  // 像素来源：真实原图像素优先；未就绪/失败/超出预算时退回代理图，界面如实标注。
  const pixelImage = actualPixels.image ?? state.currentImage
  const pixelsAreProxy = actualPixels.image === null
  pixelImageRef.current = pixelImage

  useEffect(() => {
    const canvas = canvasRef.current
    const image = pixelImage
    if (canvas === null || image === null) {
      drawFnRef.current = null
      return
    }
    drawFnRef.current = () => {
      const currentImage = pixelImageRef.current
      if (currentImage === null) return
      const sourceDecode = state.engineResponse?.sourceDecode
      canvas.dataset["previewSourceDecodeMode"] = sourceDecode?.mode ?? ""
      canvas.dataset["previewSourceOrientation"] = String(sourceDecode?.orientation ?? 1)
      canvas.dataset["previewOrientationApplied"] = String(sourceDecode?.orientationApplied === true)
      const renderDimensions = renderDimensionsRef.current
      // 源尺寸优先取引擎/预检事实；不可用时退化为像素来源自身尺寸（代理语义）。
      const sourceDimensions = outputSourceDimensions
        ?? { width: currentImage.naturalWidth, height: currentImage.naturalHeight }
      const currentSettings = settingsRef.current
      const layout = calculateCompositionLayout(
        renderDimensions.logicalWidth,
        renderDimensions.logicalHeight,
        sourceDimensions.width,
        sourceDimensions.height,
        currentSettings,
        imagePlacementFromSettings(currentSettings),
        { mode: viewportStateRef.current.mode, offsetX: viewportStateRef.current.offsetX, offsetY: viewportStateRef.current.offsetY }
      )
      const canDrawPhoto = writeCanvasPreviewDiagnostics(
        canvas,
        layout,
        currentSettings,
        sourceDimensions,
        renderDimensions.logicalWidth,
        renderDimensions.logicalHeight,
        renderDimensions.pixelRatio
      )
      setIsPreviewAreaInsufficient((previous) => previous === !canDrawPhoto ? previous : !canDrawPhoto)
      if (!canDrawPhoto) {
        // 尺寸不足时清空旧帧，不能把上一次的纯边框误认为本次成功预览。
        canvas.width = canvas.width
        setTextHits(previous => previous.length > 0 ? [] : previous)
        return
      }
      const hits: { id: string; index: number; rect: PreviewRect }[] = []
      drawPreviewToCanvas(
        canvas,
        currentImage,
        currentSettings,
        logoImageRef.current,
        renderDimensions,
        sourceDimensions,
        { mode: viewportStateRef.current.mode, offsetX: viewportStateRef.current.offsetX, offsetY: viewportStateRef.current.offsetY },
        onEditText === undefined ? undefined : (id, index, rect) => hits.push({ id, index, rect })
      )
      setTextHits(previous => JSON.stringify(previous) === JSON.stringify(hits) ? previous : hits)
      if (gridEnabledRef.current && layout !== null) {
        drawGridOverlayOnCanvas(canvas, layout, renderDimensions.pixelRatio)
      }
    }
  })

  useEffect(() => {
    drawFnRef.current?.()
  }, [logoImage])

  // 网格开关切换时重绘一次：辅助线只叠在 Canvas 预览上，不影响导出。
  useEffect(() => {
    drawFnRef.current?.()
  }, [showGrid])

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (container === null || canvas === null) return

    const updateLayout = (): void => {
      const rect = container.getBoundingClientRect()
      const currentSettings = settingsRef.current
      const natural = naturalCanvasDimensions(currentSettings)
      setDimensions(rect.width, rect.height, natural.width, natural.height)
      // 两种模式下 Canvas 元素都等于容器尺寸：fit 由渲染器缩放合成，actual
      // 以 1:1 原图坐标平移绘制可视区域，backing store 始终受容器 × DPR 约束。
      const logical = {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height))
      }
      const nextRenderDimensions = configureCanvas(canvas, logical.width, logical.height)
      renderDimensionsRef.current = nextRenderDimensions
      setRenderDimensions((previous) => previous.logicalWidth === nextRenderDimensions.logicalWidth
        && previous.logicalHeight === nextRenderDimensions.logicalHeight
        && previous.pixelRatio === nextRenderDimensions.pixelRatio
        ? previous
        : nextRenderDimensions)
      drawFnRef.current?.()
    }

    updateLayout()
    const observer = new ResizeObserver(updateLayout)
    observer.observe(container)
    return () => observer.disconnect()
  }, [naturalCanvasDimensions, setDimensions])

  useEffect(() => {
    drawFnRef.current?.()
  }, [settings, pixelImage, state.engineResponse, viewportState])

  // 焦点拖动/引导覆盖层需要的照片目标区域：与绘制完全同一份合成布局，
  // 但跳过最小可见边长保护——交互换算在极小视口下也必须成立。
  const placement = imagePlacementFromSettings(settings)
  const interactionSource = outputSourceDimensions
    ?? (pixelImage === null ? null : { width: pixelImage.naturalWidth, height: pixelImage.naturalHeight })
  const layoutForInteraction = pixelImage === null || interactionSource === null
    ? null
    : calculateCompositionLayout(
      renderDimensions.logicalWidth,
      renderDimensions.logicalHeight,
      interactionSource.width,
      interactionSource.height,
      settings,
      placement,
      { mode: viewportState.mode, offsetX: viewportState.offsetX, offsetY: viewportState.offsetY },
      { skipMinVisibleGuard: true }
    )
  const targetRect = layoutForInteraction === null
    ? null
    : {
      left: layoutForInteraction.targetRect.x,
      top: layoutForInteraction.targetRect.y,
      width: layoutForInteraction.targetRect.width,
      height: layoutForInteraction.targetRect.height
    }
  const placementGeometry = interactionSource === null
    ? null
    : calculateImagePlacementGeometry(interactionSource.width, interactionSource.height, placement)
  const cropApplied = placementGeometry !== null
    && placement.mode === "fill"
    && (placementGeometry.rotatedWidth * placementGeometry.scale > placementGeometry.targetWidth + 0.01
      || placementGeometry.rotatedHeight * placementGeometry.scale > placementGeometry.targetHeight + 0.01)
  const placementStatus = placement.mode === "fill"
    ? cropApplied ? "填满图片区域 · 已裁切" : "填满图片区域 · 未裁切"
    : "适应画布 · 完整图片"

  // 拖拽/焦点计算需要读取最新渲染值；闭包经 ref 间接访问，避免回调频繁重建。
  // targetRect 使用 left/top 命名，焦点换算统一转成 PreviewRect 的 x/y。
  const targetRectRef = useRef<PreviewRect | null>(null)
  targetRectRef.current = targetRect === null
    ? null
    : { x: targetRect.left, y: targetRect.top, width: targetRect.width, height: targetRect.height }
  const cropAppliedRef = useRef(cropApplied)
  cropAppliedRef.current = cropApplied

  // 指针在 canvas 上的逻辑坐标：canvas 的 CSS 尺寸即逻辑尺寸，
  // getBoundingClientRect 已包含视口平移与滚动偏移。
  const pointerToCanvasLogical = (event: { clientX: number; clientY: number }, canvas: HTMLCanvasElement): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  /**
   * 裁切构图拖动：把指针换算为焦点并经工作台设置控制器应用（标记 userModified）。
   * 每次拖动手势携带独立 historyTag，全部 mousemove 合并为一条撤销历史。
   */
  const applyFocalFromEvent = useCallback((event: { clientX: number; clientY: number }): void => {
    const canvas = canvasRef.current
    const rect = targetRectRef.current
    if (canvas === null || rect === null || onUpdateImagePlacement === undefined) {
      return
    }
    const focal = calculateFocalFromPointer(pointerToCanvasLogical(event, canvas), rect)
    if (focal === null) {
      return
    }
    onUpdateImagePlacement({
      imagePlacement: { ...imagePlacementFromSettings(settingsRef.current), ...focal }
    }, { historyTag: `image-placement-drag-${focalGestureRef.current}` })
  }, [onUpdateImagePlacement])

  const handleMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    // 裁切模式下在图片区域内按下：进入构图焦点拖动，不平移画布。
    if (cropAppliedRef.current && targetRectRef.current !== null) {
      const canvas = canvasRef.current
      if (canvas !== null) {
        const focal = calculateFocalFromPointer(pointerToCanvasLogical(event, canvas), targetRectRef.current)
        if (focal !== null) {
          focalDragRef.current = true
          setIsFocalDragging(true)
          // 每次按下手势递增：两次独立拖动不得合并进同一条撤销历史。
          focalGestureRef.current += 1
          applyFocalFromEvent(event)
          return
        }
      }
    }
    dragStartRef.current = { x: event.clientX, y: event.clientY }
    viewport.startDrag()
  }, [applyFocalFromEvent, viewport.startDrag])

  const handleMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>): void => {
    if (focalDragRef.current) {
      // 防御：指针上已无按键（如原生拖拽逃逸后重入）时立即结束手势。
      if (event.buttons === 0) {
        focalDragRef.current = false
        setIsFocalDragging(false)
        return
      }
      applyFocalFromEvent(event)
      return
    }
    if (dragStartRef.current === null) return
    const deltaX = event.clientX - dragStartRef.current.x
    const deltaY = event.clientY - dragStartRef.current.y
    dragStartRef.current = { x: event.clientX, y: event.clientY }
    viewport.handleDragMove(deltaX, deltaY)
  }, [applyFocalFromEvent, viewport.handleDragMove])

  const handleMouseUp = useCallback((): void => {
    focalDragRef.current = false
    setIsFocalDragging(false)
    dragStartRef.current = null
    viewport.endDrag()
  }, [viewport.endDrag])

  const modeLabel = viewportState.mode === "fit" ? "适应" : "100%"

  return (
    <div className="previewCanvasContainer">
      <div
        ref={containerRef}
        className={`previewCanvasWrapper previewBackground${previewBackground.charAt(0).toUpperCase()}${previewBackground.slice(1)}`}
        style={{ overflow: "hidden", position: "relative", cursor: viewport.isDragging || isFocalDragging ? "grabbing" : "grab" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={viewport.handleDoubleClick}
      >
        <canvas
          ref={canvasRef}
          className="previewCanvas"
          style={{ position: "absolute", left: 0, top: 0 }}
        />
        {!showOriginal && onEditText !== undefined && textHits.map(({ id, index, rect }) => (
          <button key={id} type="button" className="previewTextHit"
            aria-label={index === 0 ? "编辑主文字" : `编辑文字 ${index + 1}`}
            style={{ left: rect.x, top: rect.y - 4, width: rect.width, height: Math.max(16, rect.height + 8) }}
            onMouseDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}
            onClick={() => onEditText(id)} />
        ))}
        {activeTemplateId === "polaroid" && targetRect !== null && (
          <div
            className="polaroidImageGuide"
            data-testid="polaroid-image-guide"
            aria-hidden="true"
            style={{
              left: `${targetRect.left}px`,
              top: `${targetRect.top}px`,
              width: `${targetRect.width}px`,
              height: `${targetRect.height}px`
            }}
          >
            <span>图片区</span>
          </div>
        )}
        {showOriginal && state.currentImage !== null && (
          <div className="previewOriginalOverlay" data-testid="preview-original-overlay" role="img" aria-label="无边框原图预览">
            <img className="previewOriginalImage" src={state.currentImage.src} alt="" />
            <span className="previewOriginalBadge" aria-hidden="true">原图</span>
          </div>
        )}
        {isPreviewAreaInsufficient && (
          <div className="previewAreaInsufficient" role="status">
            <strong>预览区域不足</strong>
            <span>请扩大窗口或调整右侧面板后再查看照片。</span>
          </div>
        )}
      </div>
      <div className="previewMetaBar">
        <span className="previewMetaFileName">{state.fileName}</span>
        <div className="previewMetaDetails" aria-label="预览尺寸摘要">
          <span data-testid="preview-image-area">图片区域：{summarizeImageArea(settings, state.currentImage?.naturalWidth, state.currentImage?.naturalHeight).label}</span>
          <span data-testid="preview-css-size">预览：{renderDimensions.logicalWidth}×{renderDimensions.logicalHeight} CSS px</span>
          <span data-testid="preview-output-size">
            输出：{(() => {
              const dimensions = state.currentImage === null
                ? null
                : outputSourceDimensions === null
                  ? null
                  : calculateOutputPixelDimensions(outputSourceDimensions.width, outputSourceDimensions.height, settings)
              return dimensions === null ? "待预检" : `${dimensions.width}×${dimensions.height} px`
            })()}
          </span>
        </div>
        <span className="previewPlacementStatus" data-preview-placement-mode={placement.mode} data-preview-crop-applied={cropApplied ? "true" : "false"}>
          {placementStatus}
        </span>
        {engineSyncLabel(state.engineSyncStatus).length > 0 && (
          <span className={engineSyncClassName(state.engineSyncStatus)}>{engineSyncLabel(state.engineSyncStatus)}</span>
        )}
        <DecodeSourceBadge sourceDecode={state.engineResponse?.sourceDecode ?? null} />
        {viewportState.mode === "actual" && (
          <span
            className={pixelsAreProxy
              ? "decodeBadge decodeBadgeFallback"
              : "decodeBadge decodeBadgeDeveloped"}
            data-testid="preview-pixel-source"
            title={pixelsAreProxy
              ? actualPixels.status === "loading"
                ? "正在加载原图像素，当前为代理图插值放大，不能用于原图细节判断"
                : actualPixels.status === "over-budget"
                  ? "合成尺寸超出 100% 真实像素上限，当前为代理图插值放大"
                  : "原图像素暂不可用，当前为代理图插值放大，不能用于原图细节判断"
              : "1 原图像素 = 1 CSS 像素，引擎真实像素"}
          >
            {pixelsAreProxy
              ? actualPixels.status === "loading" ? "100% · 加载原图像素…" : "100% · 代理像素"
              : "100% · 原图像素"}
          </span>
        )}
        <span className="previewViewportControls">
          <button
            type="button"
            className={`ghostButton previewViewportBtn${showGrid ? " previewViewportBtnActive" : ""}`}
            aria-pressed={showGrid}
            title="构图辅助线：三分线 + 中心十字（仅预览叠加，不影响导出）"
            onClick={() => setShowGrid((previous) => !previous)}
          >
            网格
          </button>
          <button
            type="button"
            className="ghostButton previewViewportBtn"
            title="按住查看无边框原图（快捷键 \\）"
            onPointerDown={() => setShowOriginal(true)}
            onPointerUp={() => setShowOriginal(false)}
            onPointerLeave={() => setShowOriginal(false)}
          >
            原图
          </button>
          <button type="button" className="ghostButton previewViewportBtn" onClick={resetToFit}>适应</button>
          <span className="previewZoomLabel">{modeLabel}</span>
          <button type="button" className="ghostButton previewViewportBtn" onClick={resetToActual}>100%</button>
        </span>
      </div>
    </div>
  )
}

export const PreviewPanel = ({
  state,
  settings,
  hasSelectedImage,
  batchExportLabel,
  exportController,
  resolvedBrand,
  resolvedTextOverride,
  resolvedTextLayers,
  engineAvailable = true,
  engineUnavailableReason = null,
  viewportCommand = null,
  previewBackground = "gray",
  activeTemplateId = null,
  outputSourceDimensions = null,
  onUpdateImagePlacement,
  imageProcessing = null,
  onUpdateImageProcessing,
  onSourceVersion,
  curveTools,
  onEditText,
  showExportControls = true
}: PreviewPanelProps): JSX.Element => {
  const resolvedSettings = buildResolvedRenderSettings(settings, resolvedTextOverride, resolvedTextLayers, resolvedBrand)
  const knownSourceDimensions = state.kind === "active"
    ? (() => {
        const item = exportController.lastPreflight?.items.find((candidate) => candidate.imagePath === state.filePath)
        const preflightSource = item?.report?.source
        const responseDecode = state.engineResponse?.sourceDecode
        const responseSource = state.engineResponse?.fidelityReport?.source
        const width = responseDecode?.fullWidth
          ?? preflightSource?.orientedWidth
          ?? preflightSource?.width
          ?? responseSource?.orientedWidth
          ?? responseSource?.width
        const height = responseDecode?.fullHeight
          ?? preflightSource?.orientedHeight
          ?? preflightSource?.height
          ?? responseSource?.orientedHeight
          ?? responseSource?.height
        return outputSourceDimensions
          ?? (typeof width === "number" && typeof height === "number" && width > 0 && height > 0
            ? { width, height }
            : null)
      })()
    : null

  return (
    <Panel label="预览" title="预览区域" className="previewPanel">
      <div className={`previewFrame previewBackground${previewBackground.charAt(0).toUpperCase()}${previewBackground.slice(1)}`}>
        {state.kind === "idle" && <IdleView />}
        {state.kind === "active" && state.filmMode === true && (
          <FilmWorkspacePreview state={state} settings={resolvedSettings} config={imageProcessing}
            onChange={onUpdateImageProcessing} onSourceVersion={onSourceVersion} viewportCommand={viewportCommand} curveTools={curveTools} onEditText={onEditText} />
        )}
        {state.kind === "active" && state.filmMode !== true && state.currentImage === null && <LoadingView filePath={state.filePath} />}
        {state.kind === "active" && state.filmMode !== true && state.currentImage !== null && (
          <CanvasPreview
            state={state}
            settings={resolvedSettings}
            viewportCommand={viewportCommand}
            previewBackground={previewBackground}
            activeTemplateId={activeTemplateId}
            outputSourceDimensions={knownSourceDimensions}
            onUpdateImagePlacement={onUpdateImagePlacement}
            onEditText={onEditText}
          />
        )}
      </div>
      {showExportControls && (
        <div className="previewExportBar">
          <ExportDock
            state={state}
            hasSelectedImage={hasSelectedImage}
            batchExportLabel={batchExportLabel}
            exportController={exportController}
            engineAvailable={engineAvailable}
            engineUnavailableReason={engineUnavailableReason}
            compact
          />
        </div>
      )}
    </Panel>
  )
}
