import type { PositiveAdjustments } from "../../types/imageProcessing"
import { migrateImageProcessing } from "../queue/imageProcessingSession"

export type FilmColorPreset = { id: string; name: string; schemaVersion: 1; positive: PositiveAdjustments }
const keys = ["exposureEv", "rgbBalanceEv", "blackPoint", "whitePoint", "saturation", "masterCurve", "redCurve", "greenCurve", "blueCurve"] as const

/** 观感仅复制正片调整；不带源路径、几何或负片设备校准。 */
export const copyPositive = (value: PositiveAdjustments): PositiveAdjustments => {
  const selected: Record<string, unknown> = {}
  for (const key of keys) if (value[key] !== undefined) selected[key] = value[key]
  return JSON.parse(JSON.stringify(selected)) as PositiveAdjustments
}
export const parseFilmColorPresets = (json: string): FilmColorPreset[] => {
  const value: unknown = JSON.parse(json)
  if (!Array.isArray(value) || value.length > 500) throw new Error("校色预设格式或数量不合法")
  const ids = new Set<string>()
  return value.map((entry: unknown) => {
    if (entry === null || typeof entry !== "object") throw new Error("校色预设条目损坏")
    const p = entry as FilmColorPreset
    if (p.schemaVersion !== 1 || typeof p.id !== "string" || !p.id || ids.has(p.id)
      || typeof p.name !== "string" || !p.name.trim() || p.name.length > 100
      || p.positive === null || typeof p.positive !== "object" || Array.isArray(p.positive)) throw new Error("校色预设版本或条目损坏")
    ids.add(p.id)
    const migration = migrateImageProcessing({ schemaVersion: 2, algorithmVersion: "film-color-v2",
      inputSource: "linear-tiff", filmPolarity: "positive", linearInput: { colorSpace: "linear-rec2020" }, positive: p.positive })
    if (migration.error !== null) throw new Error(migration.error)
    const v = p.positive
    if (Math.abs(v.exposureEv ?? 0) > 5 || (v.rgbBalanceEv ?? [0, 0, 0]).some((n) => Math.abs(n) > 4)
      || (v.blackPoint ?? 0) < 0 || (v.whitePoint ?? 1) > 1 || (v.blackPoint ?? 0) >= (v.whitePoint ?? 1)
      || (v.saturation ?? 1) < 0 || (v.saturation ?? 1) > 2) throw new Error("校色预设数值超出范围")
    return { id: p.id, name: p.name.trim(), schemaVersion: 1, positive: copyPositive(v) }
  })
}
const storageKey = "film.color-presets.v1"
export const readFilmColorPresets = async (): Promise<FilmColorPreset[]> => parseFilmColorPresets(
  typeof window.desktop?.readFilmColorPresets === "function"
    ? await window.desktop.readFilmColorPresets() : localStorage.getItem(storageKey) ?? "[]")
export const writeFilmColorPresets = async (value: FilmColorPreset[]): Promise<void> => {
  const json = JSON.stringify(parseFilmColorPresets(JSON.stringify(value)))
  if (typeof window.desktop?.writeFilmColorPresets === "function") await window.desktop.writeFilmColorPresets(json)
  else localStorage.setItem(storageKey, json)
}
