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
  const inRange = (v: unknown, min: number, max: number): boolean => v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max)
  if (isRecord(positive)) {
    if (!inRange(positive["exposureEv"], -5, 5) || !inRange(positive["blackPoint"], 0, 1) || !inRange(positive["whitePoint"], 0, 1) || !inRange(positive["saturation"], 0, 2)) return false
    if ((positive["blackPoint"] ?? 0) as number >= ((positive["whitePoint"] ?? 1) as number)) return false
    if (Array.isArray(positive["rgbBalanceEv"]) && !positive["rgbBalanceEv"].every(v => inRange(v, -4, 4))) return false
  }
  for (const [name, spaces] of [["encodedInput", ["embedded", "srgb", "adobe-rgb", "prophoto-rgb", "linear-srgb", "linear-rec2020"]], ["flextightInput", ["linear-srgb", "linear-rec2020"]], ["linearInput", ["linear-srgb", "linear-rec2020", "linear-camera-rgb"]]] as const) {
    const input = value[name]
    if (input != null && (!isRecord(input) || !(spaces as readonly unknown[]).includes(input["colorSpace"]) || (input["bitDepth"] !== undefined && input["bitDepth"] !== 16 && !(name === "encodedInput" && input["bitDepth"] === 8)))) return false
    if (isRecord(input) && name === "encodedInput" && input["alphaBackground"] !== undefined && !["white", "black"].includes(String(input["alphaBackground"]))) return false
  }
  const raw = value["raw"]
  if (raw != null && (!isRecord(raw) || (raw["whiteBalance"] !== undefined && !["camera", "daylight"].includes(String(raw["whiteBalance"]))) || (raw["gamma"] !== undefined && raw["gamma"] !== "linear") || (raw["autoBright"] !== undefined && raw["autoBright"] !== false))) return false
  if (isRecord(raw) && ((raw["crop"] !== undefined && !["vendor-inset", "full-sensor"].includes(String(raw["crop"]))) || (raw["highlight"] !== undefined && !["clip", "unclip"].includes(String(raw["highlight"]))))) return false
  const geometry = value["sourceGeometry"]
  const validRoi = (roi: unknown): boolean => isRecord(roi) && [roi["x"], roi["y"], roi["width"], roi["height"]].every(v => typeof v === "number" && Number.isFinite(v)) && (roi["x"] as number) >= 0 && (roi["y"] as number) >= 0 && (roi["width"] as number) > 0 && (roi["height"] as number) > 0 && (roi["x"] as number) + (roi["width"] as number) <= 1 && (roi["y"] as number) + (roi["height"] as number) <= 1
  if (isRecord(geometry) && ((geometry["crop"] != null && !validRoi(geometry["crop"])) || !inRange(geometry["rotationDegrees"], -45, 45))) return false
  const negative = value["negative"]
  if (isRecord(negative)) {
    const light = negative["lightSource"], base = negative["filmBase"]
    if (isRecord(light) && light["kind"] !== undefined && !["camera-white-balance", "calibration"].includes(String(light["kind"]))) return false
    if (isRecord(base) && base["kind"] !== undefined && !["roi", "manual", "reference-frame"].includes(String(base["kind"]))) return false
    for (const [item, key] of [[light, "rgbGain"], [base, "rgb"]] as const) {
      if (isRecord(item) && item[key] != null && (!Array.isArray(item[key]) || item[key].length !== 3 || !(item[key] as unknown[]).every(v => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= (key === "rgb" ? 4 : 10)))) return false
    }
    if (isRecord(negative["density"]) && (!inRange(negative["density"]["min"], 0, 6) || !inRange(negative["density"]["max"], 0, 6) || Number(negative["density"]["max"] ?? 3) - Number(negative["density"]["min"] ?? 0) < 0.1)) return false
    if (isRecord(negative["filmBase"]) && (negative["filmBase"]["roi"] != null && !validRoi(negative["filmBase"]["roi"]))) return false
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
  const schemaVersion = value["schemaVersion"]
  if (schemaVersion === 2) {
    if (value["algorithmVersion"] !== "film-color-v2") {
      return { config: null, error: "旧会话中的胶片校色算法版本不受支持，已关闭处理" }
    }
    const source = value["inputSource"]
    if (source !== "camera-raw" && source !== "encoded-raster"
      && source !== "linear-tiff" && source !== "flextight-fff") {
      return { config: null, error: "旧会话中的胶片输入来源非法，已关闭处理" }
    }
    if (value["filmPolarity"] !== "positive" && value["filmPolarity"] !== "color-negative") {
      return { config: null, error: "旧会话中的胶片正负性质非法，已关闭处理" }
    }
    if (source === "camera-raw" && !isRecord(value["raw"])) {
      return { config: null, error: "旧会话中的 RAW 输入配置缺失，已关闭处理" }
    }
    if (source === "encoded-raster" && !isRecord(value["encodedInput"])) {
      return { config: null, error: "旧会话中的扫描输入配置缺失，已关闭处理" }
    }
    if (source === "linear-tiff" && !isRecord(value["linearInput"])) {
      return { config: null, error: "旧会话中的线性输入配置缺失，已关闭处理" }
    }
    if (source === "flextight-fff" && !isRecord(value["flextightInput"])) {
      return { config: null, error: "旧会话中的 FFF 扫描输入配置缺失，已关闭处理" }
    }
    if (!validNestedProcessing(value)) {
      return { config: null, error: "旧会话中的胶片嵌套配置或曲线损坏，已关闭处理" }
    }
    return { config: cloneImageProcessing(value as unknown as ImageProcessingConfig), error: null }
  }
  if (schemaVersion !== 1) {
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
