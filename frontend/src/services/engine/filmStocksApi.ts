/**
 * 内置胶片库 API：从引擎获取胶片列表。
 */

import type { FilmStock } from "../../features/metadata/types"
import { getBaseUrl, toErrorMessage } from "./engineClient"

/**
 * 从 Java 引擎获取内置胶片库列表。
 * 后端接口：GET /api/assets/film-stocks → FilmStock[]
 */
export const fetchFilmStocks = async (): Promise<readonly FilmStock[]> => {
  let response: Response

  try {
    response = await fetch(`${getBaseUrl()}/api/assets/film-stocks`)
  } catch {
    throw new Error("胶片库请求失败：引擎不可达")
  }

  if (!response.ok) {
    const fallback = `胶片库请求失败：${response.status}`
    let parsed: unknown = null
    try {
      parsed = await response.json()
    } catch {
      parsed = null
    }
    throw new Error(toErrorMessage(fallback, parsed))
  }

  return (await response.json()) as readonly FilmStock[]
}
