import { afterEach, describe, expect, it, vi } from "vitest"
import { cancelFilmRequests, isFilmCancellation } from "./filmRequestsApi"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("filmRequestsApi", () => {
  it("DELETE /api/film-requests/{clientId}?generation=n 并接受 204", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(cancelFilmRequests("view_1", 7)).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/film-requests/view_1?generation=7",
      expect.objectContaining({ method: "DELETE" })
    )
  })

  it("非 2xx 返回结构化错误", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "bad", code: "FILM_REQUEST_INVALID" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )))

    await expect(cancelFilmRequests("view_1", 2)).rejects.toMatchObject({
      status: 400,
      code: "FILM_REQUEST_INVALID"
    })
  })

  it("取消与被替代是正常状态，不按引擎不可达处理", () => {
    expect(isFilmCancellation({ status: 408, code: "FILM_REQUEST_CANCELLED" })).toBe(true)
    expect(isFilmCancellation({ name: "AbortError" })).toBe(true)
    expect(isFilmCancellation(new Error("引擎不可达"))).toBe(false)
  })
})
