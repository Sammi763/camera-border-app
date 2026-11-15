import { afterEach, describe, expect, it, vi } from "vitest"
import { queryFilmReferences, registerFilmReferenceLibrary } from "./filmReferencesApi"
import type { FilmReferenceLibraryResponse } from "../../types/filmReference"

const library: FilmReferenceLibraryResponse = {
  status: "ok",
  libraryPath: "/archive",
  upstream: { name: "noeltong/FilmArchive", commit: "3001b382", licenseNote: "read-only" },
  catalog: {
    schemaVersion: 1,
    generatedAt: "2026-10-27T17:18:49Z",
    sha256: "a".repeat(64),
    documents: 1,
    visible: 1,
    hidden: 0,
    path: "/archive/catalog.json"
  },
  index: {
    references: 1,
    filesPresent: 1,
    filesMissing: 0,
    mergedBySha256: 0,
    revisionGroups: 0,
    filmLinks: 1,
    unknownSource: 0,
    notOnSaleInferred: 0,
    indexedAt: "2026-11-12T00:00:00Z"
  },
  changes: {
    previousCatalogSha256: null,
    currentCatalogSha256: "a".repeat(64),
    catalogChanged: false,
    unchanged: 0,
    added: [],
    removed: [],
    changed: [],
    newRevisions: []
  },
  references: [],
  gaps: [],
  warnings: []
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

afterEach(() => vi.unstubAllGlobals())

describe("FilmArchive 文献客户端", () => {
  it("注册本机目录并返回变更摘要", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse(library))
    vi.stubGlobal("fetch", fetchMock)

    const result = await registerFilmReferenceLibrary({ libraryPath: "/archive" })

    expect(result.upstream.commit).toBe("3001b382")
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/film-reference-libraries")
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe("POST")
  })

  it("查询参数为空时省略空值并保留筛选", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ status: "ok", total: 0, offset: 0, limit: 25, references: [] }))
    vi.stubGlobal("fetch", fetchMock)

    await queryFilmReferences({ query: "金200", manufacturer: "", limit: 25, includeHidden: false })

    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain("/api/film-references?")
    expect(url).toContain("query=%E9%87%91200")
    expect(url).toContain("limit=25")
    expect(url).toContain("includeHidden=false")
    expect(url).not.toContain("manufacturer=")
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe("GET")
  })

  it("资料库错误码保持可解释", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({
      error: "目录中没有 catalog.json",
      code: "FILM_REFERENCE_CATALOG_MISSING"
    }, 400))

    await expect(registerFilmReferenceLibrary({ libraryPath: "/empty" })).rejects.toMatchObject({
      status: 400,
      code: "FILM_REFERENCE_CATALOG_MISSING"
    })
  })
})
