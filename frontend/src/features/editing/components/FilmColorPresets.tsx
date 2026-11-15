import { useEffect, useState } from "react"
import type { ImageProcessingConfig } from "../../../types/imageProcessing"
import { copyPositive, readFilmColorPresets, writeFilmColorPresets, type FilmColorPreset } from "../filmColorPresets"

type Props = {
  config: ImageProcessingConfig
  onChange: (config: ImageProcessingConfig, options?: { description?: string }) => void
}
/** 独立观感预设：应用时复制实际数值，之后修改预设不追溯污染每图配方。 */
export const FilmColorPresets = ({ config, onChange }: Props): JSX.Element => {
  const [items, setItems] = useState<FilmColorPreset[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [selected, setSelected] = useState("")
  useEffect(() => {
    let active = true
    void readFilmColorPresets().then((value) => { if (active) { setItems(value); setReady(true) } })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "校色预设读取失败") })
    return () => { active = false }
  }, [])
  const persist = async (next: FilmColorPreset[], chosen: string): Promise<void> => {
    setBusy(true); setError(null)
    try { await writeFilmColorPresets(next); setItems(next); setSelected(chosen); setName("") }
    catch (e) { setError(e instanceof Error ? e.message : "校色预设写入失败") }
    finally { setBusy(false) }
  }
  return <fieldset className="filmSection" disabled={!ready || busy}>
    <legend>个人校色配方</legend>
    <p>保存曝光、RGB 平衡、黑白点、曲线与饱和度。片基、光源及裁切由当前照片保留。</p>
    <label>配方名称<input maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
    <button type="button" disabled={!name.trim() || items.length >= 500} onClick={() => {
      const entry: FilmColorPreset = { id: crypto.randomUUID(), name: name.trim(), schemaVersion: 1, positive: copyPositive(config.positive ?? {}) }
      void persist([...items, entry], entry.id)
    }}>保存当前观感</button>
    <label>个人配方<select value={selected} onChange={(e) => setSelected(e.target.value)}>
      <option value="">选择配方</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <button type="button" disabled={!selected} onClick={() => {
      const entry = items.find((item) => item.id === selected)
      if (entry !== undefined) onChange({ ...config, positive: copyPositive(entry.positive) }, { description: `应用个人校色配方：${entry.name}` })
    }}>应用观感</button>
    <button type="button" disabled={!selected} onClick={() => void persist(items.filter((item) => item.id !== selected), "")}>删除配方</button>
    {error !== null && <p role="alert">{error}；原有配方未被覆盖</p>}
  </fieldset>
}
