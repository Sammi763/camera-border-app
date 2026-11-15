import { useEffect, useMemo, useState } from "react"
import { fetchWithTimeout } from "../../../services/engine/engineClient"

type Film = { id: string; brand: string; name: string; category: string; aliases: string[]; sourceIds: string[]; materialKind?: string; limitations?: string }
type Source = { id: string; title: string; url: string; sourceType: string }
type Curve = { filmId: string; publication: string; method: string; densityReadingUncertainty: number; channels: Record<string, [number, number][]>; modelReady: boolean }
type Index = { films: Film[]; sources: Source[]; aliases: { alias: string; filmIds: string[] }[]; characteristicCurveDatasets?: Curve[] }

/** 内置资料与数值曲线只用于查阅，选择资料不会写入图像处理配方。 */
export const FilmResearchIndex = (): JSX.Element => {
  const [index, setIndex] = useState<Index | null>(null)
  const [query, setQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void fetchWithTimeout("/api/film-reference-index", undefined, 10000).then(async (response) => {
      if (!response.ok) throw new Error("内置资料索引不可用")
      const data = await response.json() as Index
      if (!Array.isArray(data.films) || !Array.isArray(data.sources) || !Array.isArray(data.aliases)) throw new Error("内置资料索引格式不合法")
      if (active) setIndex(data)
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "资料读取失败") })
    return () => { active = false }
  }, [])
  const matches = useMemo(() => {
    if (index === null) return []
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return index.films.filter((film) => {
      const aliases = index.aliases.filter((alias) => alias.filmIds.includes(film.id)).map((a) => a.alias)
      const text = [film.brand, film.name, film.category, ...film.aliases, ...aliases].join(" ").toLowerCase()
      return words.every((word) => text.includes(word))
    })
  }, [index, query])
  return <section className="filmSection" aria-label="内置胶片资料">
    <h3>内置胶片资料</h3>
    <p>离线查阅型号、别称、来源及首批特性曲线。曲线提取与校色模型验证分别记录。</p>
    <label>内置资料检索<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="型号、品牌或玩家别称" /></label>
    {error !== null && <p role="status">{error}；不影响当前照片校色</p>}
    {index !== null && <p>{index.films.filter((f) => f.materialKind !== "paper").length} 条胶片记录 · {index.films.filter((f) => f.materialKind === "paper").length} 条纸基材料 · 匹配 {matches.length} 条</p>}
    {matches.slice(0, 12).map((film) => {
      const curve = index?.characteristicCurveDatasets?.find((c) => c.filmId === film.id)
      const points = curve === undefined ? [] : Object.values(curve.channels).flat()
      const xMin = Math.min(...points.map((p) => p[0])), xMax = Math.max(...points.map((p) => p[0]))
      return <details key={film.id}>
        <summary>{film.brand} {film.name} · {film.materialKind === "paper" ? "纸基材料" : film.category}</summary>
        <p>{film.limitations}</p>
        {curve !== undefined && <>
          <p>{curve.publication} · {curve.method === "pdf-vector-bezier" ? "矢量提取" : "栅格估读"} · 密度读数误差约 ±{curve.densityReadingUncertainty} D · 模型未标定</p>
          <svg viewBox="0 0 280 180" role="img" aria-label={`${film.name} 特性曲线`}>
            <path d="M28 8V150H270" fill="none" stroke="currentColor" />
            {Object.entries(curve.channels).map(([channel, values]) => <polyline key={channel} fill="none" stroke={channel}
              points={values.map(([x, y]) => `${28 + (x-xMin)/(xMax-xMin)*240},${150-y/4*140}`).join(" ")} />)}
            <text x="30" y="170" fill="currentColor" fontSize="10">log H (lux·s) {xMin.toFixed(1)}…{xMax.toFixed(1)} · D 0…4 (Status M)</text>
          </svg>
        </>}
        {film.sourceIds.map((id) => index?.sources.find((s) => s.id === id)).filter((s): s is Source => s !== undefined).map((source) =>
          <p key={source.id}><button type="button" disabled={window.desktop?.openFilmReferenceSource === undefined}
            onClick={() => void window.desktop?.openFilmReferenceSource?.(source.url)}>{source.title}</button> · {source.sourceType}</p>)}
      </details>
    })}
    {matches.length > 12 && <p>显示前 12 条，请输入关键词缩小范围。</p>}
  </section>
}
