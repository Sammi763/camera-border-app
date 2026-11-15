import { FilmResearchIndex } from "./FilmResearchIndex"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  FilmReference,
  FilmReferenceLibraryResponse,
  FilmReferenceQueryResponse
} from "../../../types/filmReference"
import { queryFilmReferences, registerFilmReferenceLibrary } from "../../../services/engine/filmReferencesApi"

type FilmReferencePanelProps = {
  /** 当前图片的胶片库存 ID；只用于高亮关联，不自动应用任何参数。 */
  readonly activeFilmId?: string | null
}

const unique = (values: readonly (string | null)[]): string[] =>
  [...new Set(values.filter((value): value is string => value !== null && value.trim().length > 0))].sort()

/**
 * FilmArchive 资料卡（只读）。
 *
 * 文献只提供来源、版本、缺口与关联；选择胶片名称或资料卡不会修改像素配方。
 * 原文在系统默认应用中打开，路径边界由 Electron 主进程校验。
 */
export const FilmReferencePanel = ({ activeFilmId = null }: FilmReferencePanelProps): JSX.Element => {
  const bridge = window.desktop
  const requestSequence = useRef(0)
  const [libraryPath, setLibraryPath] = useState<string | null>(null)
  const [library, setLibrary] = useState<FilmReferenceLibraryResponse | null>(null)
  const [queryResult, setQueryResult] = useState<FilmReferenceQueryResponse | null>(null)
  const [query, setQuery] = useState("")
  const [manufacturer, setManufacturer] = useState("")
  const [category, setCategory] = useState("")
  const [includeHidden, setIncludeHidden] = useState(true)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const applyQuery = useCallback(async (
    nextQuery: string,
    nextManufacturer: string,
    nextCategory: string,
    nextHidden: boolean
  ): Promise<void> => {
    const sequence = ++requestSequence.current
    setLoading(true)
    setError(null)
    try {
      const result = await queryFilmReferences({
        query: nextQuery,
        manufacturer: nextManufacturer,
        category: nextCategory,
        includeHidden: nextHidden,
        limit: 100
      })
      if (sequence !== requestSequence.current) return
      setQueryResult(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "资料查询失败")
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }, [])

  const register = useCallback(async (path: string, refresh: boolean): Promise<void> => {
    const sequence = ++requestSequence.current
    setLoading(true)
    setError(null)
    try {
      const result = await registerFilmReferenceLibrary({ libraryPath: path, refresh })
      if (sequence !== requestSequence.current) return
      setLibrary(result)
      setLibraryPath(result.libraryPath)
      setMessage(`已索引 ${result.index.references} 条文献 · ${result.index.filesPresent} 份本机文件`)
      await applyQuery("", "", "", true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "资料库关联失败")
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }, [applyQuery])

  useEffect(() => {
    if (bridge?.getFilmArchiveStatus === undefined) return
    let alive = true
    void bridge.getFilmArchiveStatus().then((status) => {
      if (!alive || !status.available || status.libraryPath === null) return
      setLibraryPath(status.libraryPath)
      void register(status.libraryPath, true)
    }).catch(() => { /* 状态读取失败时仍可手动关联 */ })
    return () => { alive = false }
  }, [bridge, register])

  const connect = async (): Promise<void> => {
    if (bridge?.selectFilmArchiveFolder === undefined) {
      setError("当前运行环境不提供目录选择；请在桌面应用中使用")
      return
    }
    try {
      const selection = await bridge.selectFilmArchiveFolder()
      if (selection === null) return
      await register(selection.libraryPath, true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "目录选择失败")
    }
  }

  const references = queryResult?.references ?? library?.references ?? []
  const manufacturers = useMemo(() => unique((library?.references ?? references).map((item) => item.manufacturer)), [library, references])
  const categories = useMemo(() => unique((library?.references ?? references).map((item) => item.category)), [library, references])

  const openDocument = async (reference: FilmReference): Promise<void> => {
    if (reference.filePath === null || bridge?.openFilmReferenceDocument === undefined) return
    const opened = await bridge.openFilmReferenceDocument(reference.filePath)
    if (!opened) setError("原文打开失败：路径不在已关联目录内或系统无法打开")
  }

  const openSource = async (reference: FilmReference): Promise<void> => {
    if (reference.sourceUrl === null || bridge?.openFilmReferenceSource === undefined) return
    const opened = await bridge.openFilmReferenceSource(reference.sourceUrl)
    if (!opened) setError("来源链接打开失败：仅允许 http(s) 地址")
  }

  return (
    <section className="filmEditingPanel" aria-label="FilmArchive 资料">
      <FilmResearchIndex />
      <div className="filmPanelHeader">
        <div>
          <h2 className="filmPanelTitle">资料参考</h2>
          <p className="settingsCapabilityHint">
            FilmArchive 只读索引 · 文献不是胶片 ID，也不会自动修改校色参数
          </p>
        </div>
        <button type="button" className="ghostButton" onClick={() => void connect()} disabled={loading}>
          关联本机资料库
        </button>
      </div>
      {libraryPath !== null && (
        <p className="settingsCapabilityHint">已关联：{libraryPath}</p>
      )}
      {message !== null && <p className="settingsCapabilityHint" role="status">{message}</p>}
      {error !== null && <p className="filmCapabilityWarning" role="alert">{error}</p>}
      {library !== null && (
        <div className="filmSection">
          <dl className="workspaceOutputSummary">
            <div><dt>目录文献</dt><dd>{library.catalog.documents}</dd></div>
            <div><dt>有效记录</dt><dd>{library.index.references}</dd></div>
            <div><dt>本机文件</dt><dd>{library.index.filesPresent} / 缺失 {library.index.filesMissing}</dd></div>
            <div><dt>SHA 合并</dt><dd>{library.index.mergedBySha256}</dd></div>
            <div><dt>修订组</dt><dd>{library.index.revisionGroups}</dd></div>
            <div><dt>胶片关联</dt><dd>{library.index.filmLinks}</dd></div>
          </dl>
          <p className="settingsCapabilityHint">
            上游提交 {library.upstream.commit} · 目录 {library.catalog.generatedAt ?? "日期未记录"} ·
            {library.catalog.sha256.slice(0, 12)}…
          </p>
          {library.changes.catalogChanged && (
            <p className="settingsCapabilityHint" role="status">
              资料更新：新增 {library.changes.added.length}、移除 {library.changes.removed.length}、
              内容变化 {library.changes.changed.length}、新修订 {library.changes.newRevisions.length}。
              已编辑图片与已提交导出的参数不受影响。
            </p>
          )}
          {library.gaps.length > 0 && (
            <details>
              <summary>资料缺口（{library.gaps.length}）</summary>
              <ul>{library.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
            </details>
          )}
          {library.warnings.length > 0 && (
            <details>
              <summary>边界说明</summary>
              <ul>{library.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </details>
          )}
        </div>
      )}
      <fieldset className="filmSection">
        <legend>检索文献</legend>
        <label className="filmField"><span>关键词 / 玩家别称</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="如 金200、炮塔160、Ektar" />
        </label>
        <div className="filmFieldGrid">
          <label className="filmField"><span>厂家</span>
            <select value={manufacturer} onChange={(event) => setManufacturer(event.target.value)}>
              <option value="">全部</option>
              {manufacturers.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="filmField"><span>分类</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">全部</option>
              {categories.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="filmField filmCheckboxField"><input type="checkbox" checked={includeHidden} onChange={(event) => setIncludeHidden(event.target.checked)} /><span>包含上游 hidden</span></label>
        </div>
        <button type="button" className="ghostButton" disabled={loading || libraryPath === null}
          onClick={() => void applyQuery(query, manufacturer, category, includeHidden)}>
          检索
        </button>
      </fieldset>
      <div className="filmReferenceList">
        {references.length === 0 && <p className="settingsCapabilityHint">没有匹配的文献记录。</p>}
        {references.map((reference) => (
          <article key={reference.id} className="filmReferenceCard">
            <header>
              <strong>{reference.title}</strong>
              <span className="settingsCapabilityHint">
                {[reference.manufacturer, reference.product, reference.category, reference.type]
                  .filter((value) => value !== null && value.length > 0).join(" · ")}
              </span>
            </header>
            <p className="settingsCapabilityHint">
              {reference.publicationNumber !== null ? `出版号 ${reference.publicationNumber}（${reference.publicationNumberSource}）` : "出版号未确认"}
              {" · "}
              {reference.publicationDate !== null ? reference.publicationDate : "出版日期未确认"}
              {" · "}来源 {reference.authority === "manufacturer-document" ? "厂家文档" : "未知/第三方"}
            </p>
            <p className="settingsCapabilityHint">
              文件 {reference.fileStatus === "present" ? "本机可读" : reference.fileStatus === "unsafe-path" ? "路径越界已拒绝" : reference.fileStatus === "checksum-mismatch" ? "校验和不符，已禁止打开" : "本机缺失"}
              {reference.sha256 !== null ? ` · SHA ${reference.sha256.slice(0, 12)}…` : ""}
              {reference.revisionCount > 1 ? ` · 保留 ${reference.revisionCount} 个修订` : ""}
              {reference.mergedSources.length > 0 ? ` · 合并 ${reference.mergedSources.length} 个同内容来源` : ""}
            </p>
            {reference.filmLinks.length > 0 && (
              <p className="settingsCapabilityHint">
                关联胶片：{reference.filmLinks.map((link) => (
                  <span key={`${reference.id}-${link.filmId}`} className={link.filmId === activeFilmId ? "filmReferenceActiveLink" : undefined}>
                    {link.filmName}{link.alias === null || link.alias === undefined ? "" : `（${link.alias}）`}{" "}
                  </span>
                ))}
              </p>
            )}
            {reference.evidenceGaps.length > 0 && (
              <details><summary>证据缺口</summary>
                <ul>{reference.evidenceGaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
              </details>
            )}
            <div className="filmReferenceActions">
              <button type="button" className="ghostButton" disabled={reference.fileStatus !== "present"}
                onClick={() => void openDocument(reference)}>打开原文</button>
              <button type="button" className="ghostButton" disabled={reference.sourceUrl === null}
                onClick={() => void openSource(reference)}>打开来源</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
