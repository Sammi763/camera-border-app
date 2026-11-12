import type { ImageProcessingConfig } from "../../types/imageProcessing"

/**
 * 队列会话中的每图底片处理迁移（T08）。
 *
 * 旧会话没有 imageProcessing 时迁移为 null（普通模式）；损坏/未知版本的数据
 * 不能静默恢复成“看似已调好”的图，必须返回可解释错误并关闭处理。
 */
export type MigratedImageProcessing = {
  readonly config: ImageProcessingConfig | null
  readonly error: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const hasString = (value: Record<string, unknown>, key: string): boolean =>
  typeof value[key] === "string"

/** 恢复时先检查嵌套形状和有限值，避免损坏曲线直接进入组件导致启动崩溃。 */
const validNestedProcessing = (value: Record<string, unknown>): boolean => {
  const finiteTree = (node: unknown, depth = 0): boolean => {
    if (depth > 20) return false
    if (typeof node === "number") return Number.isFinite(node)
    if (Array.isArray(node)) return node.every((child) => finiteTree(child, depth + 1))
    if (isRecord(node)) return Object.values(node).every((child) => finiteTree(child, depth + 1))
    return true
  }
  if (!finiteTree(value)) return false
  for (const key of ["negative", "positive", "sourceGeometry"]) {
    if (value[key] != null && !isRecord(value[key])) return false
  }
  const positive = value["positive"]
  if (isRecord(positive)) {
    for (const key of ["exposureEv", "blackPoint", "whitePoint", "saturation"]) {
      if (positive[key] !== undefined && typeof positive[key] !== "number") return false
    }
    const balance = positive["rgbBalanceEv"]
    if (balance !== undefined && (!Array.isArray(balance) || balance.length !== 3
      || !balance.every((item) => typeof item === "number"))) return false
    for (const key of ["masterCurve", "redCurve", "greenCurve", "blueCurve"]) {
      const curve = positive[key]
      if (curve == null) continue
      if (!isRecord(curve) || (curve["interpolation"] !== undefined && curve["interpolation"] !== "linear")) return false
      const points = curve["points"]
      if (!Array.isArray(points) || points.length < 2 || points.length > 17) return false
      let lastX = -1
      let lastY = -1
      for (const point of points) {
        if (!isRecord(point) || typeof point["x"] !== "number" || typeof point["y"] !== "number"
          || point["x"] <= lastX || point["x"] < 0 || point["x"] > 1
          || point["y"] < lastY || point["y"] < 0 || point["y"] > 1) return false
        lastX = point["x"]
        lastY = point["y"]
      }
      if (points[0].x !== 0 || points[0].y !== 0 || lastX !== 1 || lastY !== 1) return false
    }
  }
  const negative = value["negative"]
  if (isRecord(negative)) {
    for (const key of ["lightSource", "filmBase", "density"]) {
      if (negative[key] != null && !isRecord(negative[key])) return false
    }
  }
  return true
}

export const migrateImageProcessing = (value: unknown): MigratedImageProcessing => {
  if (value === null || value === undefined) {
    return { config: null, error: null }
  }
  if (!isRecord(value)) {
    return { config: null, error: "旧会话中的底片配置不是对象，已关闭处理" }
  }
  if (value["schemaVersion"] !== 1) {
    return { config: null, error: "旧会话中的底片配置版本不受支持，已关闭处理" }
  }
  if (!hasString(value, "algorithmVersion") || value["algorithmVersion"] !== "film-digitization-v1") {
    return { config: null, error: "旧会话中的底片算法版本不受支持，已关闭处理" }
  }
  if (value["inputMode"] !== "sensor-raw" && value["inputMode"] !== "linear-tiff") {
    return { config: null, error: "旧会话中的底片输入模式非法，已关闭处理" }
  }
  if (value["inputMode"] === "sensor-raw" && !isRecord(value["raw"])) {
    return { config: null, error: "旧会话中的底片 RAW 配置缺失，已关闭处理" }
  }
  if (value["inputMode"] === "linear-tiff" && !isRecord(value["linearInput"])) {
    return { config: null, error: "旧会话中的线性输入配置缺失，已关闭处理" }
  }
  if (!validNestedProcessing(value)) {
    return { config: null, error: "旧会话中的底片嵌套配置或曲线损坏，已关闭处理" }
  }
  return { config: cloneImageProcessing(value as unknown as ImageProcessingConfig), error: null }
}

/** JSON 复制断开嵌套曲线/数值数组引用；每图配置不能与共享校准对象共用引用。 */
export const cloneImageProcessing = (
  config: ImageProcessingConfig | null | undefined
): ImageProcessingConfig | null => {
  if (config === null || config === undefined) return null
  return JSON.parse(JSON.stringify(config)) as ImageProcessingConfig
}
