/**
 * 浏览器模式下的样片发现 API。
 *
 * 当 window.desktop 不存在时（即非 Electron 环境），
 * 前端通过此接口从 Java 引擎获取 photos/ 目录下的样片路径列表，
 * 作为系统文件选择器的降级方案。
 */

import { getBaseUrl } from "./engineClient"

/**
 * 从 Java 引擎获取开发样片的绝对路径列表。
 * 后端接口：GET /api/dev/photos → { photos: [{ fileName, imagePath }] }
 */
export const fetchDevPhotos = async (): Promise<readonly string[]> => {
  const response = await fetch(`${getBaseUrl()}/api/dev/photos`)

  if (!response.ok) {
    throw new Error(`加载样片失败：${response.status}`)
  }

  const data = (await response.json()) as {
    readonly photos?: readonly {
      readonly imagePath?: string
    }[]
  }

  return (data.photos ?? [])
    .map((photo) => photo.imagePath)
    .filter((imagePath): imagePath is string => imagePath !== undefined && imagePath.trim() !== "")
}
