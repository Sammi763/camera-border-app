/**
 * 画幅格式 API：从引擎获取支持的画幅列表及推荐边框值。
 */

import type { FilmFormatInfo } from "../../types/preview"
import { getBaseUrl } from "./engineClient"

/**
 * 从 Java 引擎获取支持的画幅格式列表。
 * 后端接口：GET /api/film-formats → FilmFormatInfo[]
 *
 * 后端直接返回 JSON 数组，不做外层包装。
 */
export const fetchFilmFormats = async (): Promise<readonly FilmFormatInfo[]> => {
  const response = await fetch(`${getBaseUrl()}/api/film-formats`)

  if (!response.ok) {
    throw new Error(`加载画幅格式失败：${response.status}`)
  }

  const data = (await response.json()) as unknown

  if (!Array.isArray(data)) {
    return []
  }

  return data as readonly FilmFormatInfo[]
}
