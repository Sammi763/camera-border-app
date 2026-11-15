import type {
  FilmReferenceLibraryRequest,
  FilmReferenceLibraryResponse,
  FilmReferenceQueryResponse
} from "../../types/filmReference"
import { fetchWithTimeout, getBaseUrl, readEngineHttpError } from "./engineClient"

export const FILM_REFERENCE_TIMEOUT_MS = 30000

const postJson = async <T>(path: string, body: unknown, timeoutMs: number,
  signal?: AbortSignal): Promise<T> => {
  let response: Response
  try {
    response = await fetchWithTimeout(
      `${getBaseUrl()}${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        ...(signal === undefined ? {} : { signal })
      },
      timeoutMs
    )
  } catch {
    throw new Error("资料库请求失败：引擎不可达")
  }
  if (!response.ok) {
    throw await readEngineHttpError(response, `资料库请求失败：${response.status}`)
  }
  return (await response.json()) as T
}

/** 注册/刷新本机 FilmArchive 目录。 */
export const registerFilmReferenceLibrary = async (
  request: FilmReferenceLibraryRequest,
  timeoutMs: number = FILM_REFERENCE_TIMEOUT_MS,
  signal?: AbortSignal
): Promise<FilmReferenceLibraryResponse> =>
  postJson("/api/film-reference-libraries", request, timeoutMs, signal)

export type FilmReferenceQuery = {
  readonly query?: string
  readonly manufacturer?: string
  readonly category?: string
  readonly filmId?: string
  readonly includeHidden?: boolean
  readonly offset?: number
  readonly limit?: number
}

/** 查询已索引文献；不触发目录重扫。 */
export const queryFilmReferences = async (
  request: FilmReferenceQuery = {},
  timeoutMs: number = FILM_REFERENCE_TIMEOUT_MS,
  signal?: AbortSignal
): Promise<FilmReferenceQueryResponse> => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(request)) {
    if (value === undefined || value === null || value === "") continue
    params.set(key, String(value))
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ""
  let response: Response
  try {
    response = await fetchWithTimeout(
      `${getBaseUrl()}/api/film-references${suffix}`,
      {
        method: "GET",
        ...(signal === undefined ? {} : { signal })
      },
      timeoutMs
    )
  } catch {
    throw new Error("资料库查询失败：引擎不可达")
  }
  if (!response.ok) {
    throw await readEngineHttpError(response, `资料库查询失败：${response.status}`)
  }
  return (await response.json()) as FilmReferenceQueryResponse
}
