/**
 * 照片元数据 API：从引擎读取 EXIF 信息。
 *
 * 带可取消超时：导出前批量读取 EXIF 时，引擎卡住会在有限时间失败并降级为空，
 * 不会永久停在「正在读取 EXIF…」。
 */

import type { PhotoMetadata } from "../../types/preview"
import { fetchWithTimeout, getBaseUrl, toErrorMessage } from "./engineClient"

/** 照片元数据请求默认超时（毫秒）。 */
export const PHOTO_METADATA_TIMEOUT_MS = 10_000

/** 读取当前元数据请求超时（毫秒），测试可注入短超时。 */
export const getPhotoMetadataTimeoutMs = (): number => PHOTO_METADATA_TIMEOUT_MS

/**
 * 从 Java 引擎读取照片的 EXIF 元数据。
 * 后端接口：POST /api/photo-metadata → PhotoMetadata
 *
 * @param imagePath 图片绝对路径
 * @param timeoutMs 请求超时毫秒（测试可注入短超时）
 */
export const fetchPhotoMetadata = async (
  imagePath: string,
  timeoutMs: number = getPhotoMetadataTimeoutMs()
): Promise<PhotoMetadata> => {
  let response: Response

  try {
    response = await fetchWithTimeout(
      `${getBaseUrl()}/api/photo-metadata`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePath })
      },
      timeoutMs
    )
  } catch {
    throw new Error("元数据请求失败：引擎不可达")
  }

  if (!response.ok) {
    const fallback = `元数据请求失败：${response.status}`
    let parsed: unknown = null
    try {
      parsed = await response.json()
    } catch {
      parsed = null
    }
    throw new Error(toErrorMessage(fallback, parsed))
  }

  return (await response.json()) as PhotoMetadata
}
