/** FilmArchive 文献索引契约；文献不是胶片 ID，也不是已验证校色配置。 */
export type FilmReferenceFilmLink = {
  readonly filmId: string | null
  readonly filmName: string | null
  readonly match: string
  readonly confidence: string
  readonly alias?: string | null
}

export type FilmReferenceMergedSource = {
  readonly sourceUrl: string | null
  readonly upstreamPath: string | null
}

export type FilmReference = {
  readonly id: string
  readonly title: string
  readonly manufacturer: string | null
  readonly category: string | null
  readonly product: string | null
  readonly type: string | null
  readonly sourceType: string
  readonly authority: string
  readonly availability: string
  readonly pages: number
  readonly sizeBytes: number
  readonly hidden: boolean
  readonly sourceUrl: string | null
  readonly sourceHost: string | null
  readonly upstreamCommit: string
  readonly upstreamPath: string | null
  readonly upstreamDocumentKey: string
  readonly publicationNumber: string | null
  readonly publicationNumberSource: string | null
  readonly publicationDate: string | null
  readonly dateSource: string | null
  readonly sha256: string | null
  readonly fileStatus: "present" | "missing" | "unsafe-path" | string
  readonly filePath: string | null
  readonly fileSizeBytes: number
  readonly revisionGroup: string
  readonly revisionCount: number
  readonly revisionHashes: readonly string[]
  readonly mergedSources: readonly FilmReferenceMergedSource[]
  readonly filmLinks: readonly FilmReferenceFilmLink[]
  readonly evidenceGaps: readonly string[]
  readonly note?: string | null
}

export type FilmReferenceLibraryRequest = {
  readonly libraryPath: string
  readonly refresh?: boolean
  readonly previousCatalogSha256?: string | null
}

export type FilmReferenceChanges = {
  readonly previousCatalogSha256: string | null
  readonly currentCatalogSha256: string
  readonly catalogChanged: boolean
  readonly unchanged: number
  readonly added: readonly string[]
  readonly removed: readonly string[]
  readonly changed: readonly string[]
  readonly newRevisions: readonly string[]
}

export type FilmReferenceLibraryResponse = {
  readonly status: string
  readonly message?: string | null
  readonly libraryPath: string
  readonly upstream: {
    readonly name: string
    readonly commit: string
    readonly licenseNote: string
  }
  readonly catalog: {
    readonly schemaVersion: number
    readonly generatedAt: string | null
    readonly sha256: string
    readonly documents: number
    readonly visible: number
    readonly hidden: number
    readonly path: string
  }
  readonly index: {
    readonly references: number
    readonly filesPresent: number
    readonly filesMissing: number
    readonly mergedBySha256: number
    readonly revisionGroups: number
    readonly filmLinks: number
    readonly unknownSource: number
    readonly notOnSaleInferred: number
    readonly indexedAt: string
  }
  readonly changes: FilmReferenceChanges
  readonly references: readonly FilmReference[]
  readonly gaps: readonly string[]
  readonly warnings: readonly string[]
}

export type FilmReferenceQueryResponse = {
  readonly status: string
  readonly message?: string | null
  readonly libraryPath?: string | null
  readonly catalogSha256?: string | null
  readonly total: number
  readonly offset: number
  readonly limit: number
  readonly references: readonly FilmReference[]
}
