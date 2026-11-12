/**
 * 100%（actual）模式的原图像素加载 Hook。
 *
 * 适配 / 100% 两态契约中，100% 必须对应「1 原图像素 = 1 CSS px」的真实像素
 * 查看，而不能把最长边 1280 的代理图插值放大称为原图细节。本 Hook 在进入
 * actual 模式时按需向引擎请求一次「裸图」全尺寸预览（无边框、无文字，
 * 复用 /api/preview 与既有预检/解码事实），加载期间由调用方继续显示代理图
 * 并明确标注「代理像素」；失败或超出上限时保持代理态并如实说明。
 *
 * 像素预算：合成最长边超过 MAX_ACTUAL_PIXEL_EDGE 时不再请求（避免超大图
 * 一次性展开），此时 100% 仍是原图坐标（几何正确），只是像素来自代理图。
 */

import { useEffect, useState } from "react"
import { requestPreview } from "../../../services/engine/previewApi"
import {
  createPreviewCacheKey,
  hashRenderRecipe,
  previewUrlCache
} from "../../../services/engine/previewCache"
import { getImageFileVersions } from "../../../services/desktop/imageFileVersion"
import { buildPlainImagePreviewRequest } from "../../../features/settings/utils/buildRecipe"

/** 100% 真实像素请求的最长边上限；超出则保持代理像素并说明。 */
export const MAX_ACTUAL_PIXEL_EDGE = 8192

export type ActualPixelsStatus =
  | "idle"
  | "loading"
  | "ready"
  | "failed"
  | "over-budget"

export type ActualPixelsState = {
  readonly image: HTMLImageElement | null
  readonly status: ActualPixelsStatus
}

const loadImageFromUrl = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = (): void => {
      if (image.naturalWidth === 0 || image.naturalHeight === 0) {
        reject(new Error("image has zero dimensions"))
        return
      }
      resolve(image)
    }
    image.onerror = (): void => reject(new Error("image load failed"))
    image.src = url
  })

/**
 * @param filePath 当前图片路径
 * @param compositionSize 源空间合成尺寸（照片目标区域 + 边框）；null 时不请求
 * @param enabled 是否处于 100%（actual）模式
 */
export const useActualSizePreview = (
  filePath: string | null,
  compositionSize: { readonly width: number; readonly height: number } | null,
  enabled: boolean
): ActualPixelsState => {
  const [state, setState] = useState<ActualPixelsState>({ image: null, status: "idle" })
  const compositionSignature = compositionSize === null
    ? "null"
    : `${Math.round(compositionSize.width)}x${Math.round(compositionSize.height)}`

  // 文件或合成尺寸变化时立即清空旧图，避免 100% 模式残留上一张的像素。
  useEffect(() => {
    setState({ image: null, status: "idle" })
  }, [filePath, compositionSignature])

  useEffect(() => {
    if (!enabled || filePath === null || compositionSize === null) {
      return
    }
    const longest = Math.max(compositionSize.width, compositionSize.height)
    if (!Number.isFinite(longest) || longest <= 0) {
      return
    }
    if (longest > MAX_ACTUAL_PIXEL_EDGE) {
      setState({ image: null, status: "over-budget" })
      return
    }

    let active = true
    const controller = new AbortController()
    const maxWidth = Math.min(MAX_ACTUAL_PIXEL_EDGE, Math.round(compositionSize.width))
    const maxHeight = Math.min(MAX_ACTUAL_PIXEL_EDGE, Math.round(compositionSize.height))
    const request = buildPlainImagePreviewRequest(filePath, maxWidth, maxHeight)

    const load = async (): Promise<void> => {
      setState({ image: null, status: "loading" })
      let modifiedAtMs: number | null = null
      let sizeBytes: number | null = null
      try {
        const [version] = await getImageFileVersions([filePath])
        modifiedAtMs = version?.mtimeMs ?? null
        sizeBytes = version?.sizeBytes ?? null
      } catch {
        // 版本信息不可用时仍允许请求，仅损失缓存命中。
      }
      if (!active) return
      const cacheKey = createPreviewCacheKey({
        imagePath: filePath,
        maxWidth,
        maxHeight,
        modifiedAtMs,
        sourceSizeBytes: sizeBytes,
        recipeHash: hashRenderRecipe(request.recipe)
      })
      const cached = previewUrlCache.get(cacheKey)
      if (cached !== null) {
        const image = await loadImageFromUrl(cached)
        if (!active) return
        setState({ image, status: "ready" })
        return
      }

      const response = await requestPreview(request, undefined, controller.signal)
      if (!active || !response.previewAvailable) {
        if (active) setState({ image: null, status: "failed" })
        return
      }
      const previewUrl = response.previewUrl
      if (!/^\/previews\/[A-Za-z0-9_-]+$/.test(previewUrl)) {
        if (active) setState({ image: null, status: "failed" })
        return
      }
      const fetchResponse = await fetch(previewUrl, { signal: controller.signal })
      if (!fetchResponse.ok) {
        throw new Error("actual-size preview response failed")
      }
      const blob = await fetchResponse.blob()
      if (!active) return
      const objectUrl = URL.createObjectURL(blob)
      let image: HTMLImageElement
      try {
        image = await loadImageFromUrl(objectUrl)
      } catch (error) {
        // 解码失败：object URL 尚未交给缓存，必须在这里释放，避免大 blob 泄漏。
        URL.revokeObjectURL(objectUrl)
        throw error
      }
      if (!active) {
        URL.revokeObjectURL(objectUrl)
        return
      }
      // 缓存接管 object URL；字节预算淘汰（含超大条目被拒绝保留）时由缓存 revoke。
      previewUrlCache.set(cacheKey, objectUrl, blob.size)
      setState({ image, status: "ready" })
    }

    void load().catch(() => {
      if (!active || controller.signal.aborted) return
      // 失败不静默：保持代理像素并由界面说明「原图像素暂不可用」。
      setState({ image: null, status: "failed" })
    })

    return () => {
      active = false
      controller.abort()
      // object URL 的释放只在两处：解码失败/卸载竞态内联 revoke；
      // 成功后归 previewUrlCache 所有（含预算淘汰时的缓存侧 revoke）。
    }
    // compositionSignature 以内容参与依赖，避免每次渲染新对象引用触发重复请求。
  }, [enabled, filePath, compositionSignature])

  return state
}
