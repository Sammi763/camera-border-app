import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { FilmReferencePanel } from "./FilmReferencePanel"
import type { FilmReferenceLibraryResponse, FilmReferenceQueryResponse } from "../../../types/filmReference"

const reference = {
  id: "ref-sha-123",
  title: "KODAK GOLD 200",
  manufacturer: "Kodak",
  category: "Color Negative",
  product: "Gold 200",
  type: "Technical Data",
  sourceType: "technical-data",
  authority: "manufacturer-document",
  availability: "unknown",
  pages: 4,
  sizeBytes: 100,
  hidden: false,
  sourceUrl: "https://www.kodakprofessional.com/gold",
  sourceHost: "www.kodakprofessional.com",
  upstreamCommit: "3001b382",
  upstreamPath: "Kodak/CN/gold.pdf",
  upstreamDocumentKey: "a".repeat(64),
  publicationNumber: "E7022",
  publicationNumberSource: "filename-or-url-heuristic",
  publicationDate: "2016",
  dateSource: "filename-or-url-heuristic",
  sha256: "b".repeat(64),
  fileStatus: "present",
  filePath: "/archive/Docs/Kodak/CN/gold.pdf",
  fileSizeBytes: 100,
  revisionGroup: "rev-1",
  revisionCount: 2,
  revisionHashes: ["b".repeat(64), "c".repeat(64)],
  mergedSources: [],
  filmLinks: [{ filmId: "kodak-gold-200", filmName: "Kodak Gold 200", match: "product-name", confidence: "unverified", alias: null }],
  evidenceGaps: ["出版号未确认"],
  note: null
} as const

const library: FilmReferenceLibraryResponse = {
  status: "ok",
  libraryPath: "/archive",
  upstream: { name: "noeltong/FilmArchive", commit: "3001b382", licenseNote: "read-only" },
  catalog: {
    schemaVersion: 1,
    generatedAt: "2026-10-27T17:18:49Z",
    sha256: "d".repeat(64),
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
    revisionGroups: 1,
    filmLinks: 1,
    unknownSource: 0,
    notOnSaleInferred: 0,
    indexedAt: "2026-11-12T00:00:00Z"
  },
  changes: {
    previousCatalogSha256: null,
    currentCatalogSha256: "d".repeat(64),
    catalogChanged: true,
    unchanged: 0,
    added: ["ref-sha-123"],
    removed: [],
    changed: [],
    newRevisions: ["ref-sha-123"]
  },
  references: [reference],
  gaps: ["1 条文献未能从目录字段确认出版号"],
  warnings: ["来源类型不代表是否在售"]
}

const query: FilmReferenceQueryResponse = {
  status: "ok",
  libraryPath: "/archive",
  catalogSha256: "d".repeat(64),
  total: 1,
  offset: 0,
  limit: 100,
  references: [reference]
}

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })

afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as unknown as { desktop?: unknown }).desktop
})

describe("FilmReferencePanel 资料卡", () => {
  it("关联目录、显示差异/缺口并受控打开原文与来源", async () => {
    const selectFilmArchiveFolder = vi.fn(async () => ({ libraryPath: "/archive", catalogPath: "/archive/catalog.json" }))
    const getFilmArchiveStatus = vi.fn(async () => ({ libraryPath: null, available: false }))
    const openFilmReferenceDocument = vi.fn(async () => true)
    const openFilmReferenceSource = vi.fn(async () => true)
    ;(window as unknown as { desktop?: unknown }).desktop = {
      selectFilmArchiveFolder,
      getFilmArchiveStatus,
      openFilmReferenceDocument,
      openFilmReferenceSource
    }
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      return url.includes("film-reference-libraries") ? jsonResponse(library) : jsonResponse(query)
    }))

    render(<FilmReferencePanel activeFilmId="kodak-gold-200" />)
    fireEvent.click(screen.getByRole("button", { name: "关联本机资料库" }))

    await waitFor(() => expect(screen.getByText("KODAK GOLD 200")).toBeTruthy())
    expect(screen.getByText(/资料更新/)).toBeTruthy()
    expect(screen.getByText(/出版号 E7022/)).toBeTruthy()
    expect(screen.getByText(/关联胶片/)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "打开原文" }))
    await waitFor(() => expect(openFilmReferenceDocument).toHaveBeenCalledWith("/archive/Docs/Kodak/CN/gold.pdf"))

    fireEvent.click(screen.getByRole("button", { name: "打开来源" }))
    await waitFor(() => expect(openFilmReferenceSource).toHaveBeenCalledWith("https://www.kodakprofessional.com/gold"))
  })

  it("缺失文件禁用原文打开，不伪造内容", async () => {
    ;(window as unknown as { desktop?: unknown }).desktop = {
      getFilmArchiveStatus: async () => ({ libraryPath: "/archive", available: true })
    }
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      return url.includes("film-reference-libraries")
        ? jsonResponse({ ...library, references: [{ ...reference, fileStatus: "missing", filePath: null }] })
        : jsonResponse({ ...query, references: [{ ...reference, fileStatus: "missing", filePath: null }] })
    }))

    render(<FilmReferencePanel />)
    await waitFor(() => expect(screen.getByText("KODAK GOLD 200")).toBeTruthy())
    expect((screen.getByRole("button", { name: "打开原文" }) as HTMLButtonElement).disabled).toBe(true)
  })
})
