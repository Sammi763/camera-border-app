/**
 * 照片元数据 API：从引擎读取 EXIF 信息。
 */

import type { PhotoMetadata } from "../../types/preview"
import { getBaseUrl, toErrorMessage } from "./engineClient"

/**
 * 从 Java 引擎读取照片的 EXIF 元数据。
 * 后端接口：POST /api/photo-metadata → PhotoMetadata
 */
export const fetchPhotoMetadata = async (imagePath: string): Promise<PhotoMetadata> => {
  let response: Response

  try {
    response = await fetch(`${getBaseUrl()}/api/photo-metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagePath })
    })
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
