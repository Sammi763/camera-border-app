/**
 * 相机品牌识别工具。
 *
 * 从相机型号字符串中识别品牌。支持主流相机厂商：
 * Apple、Canon、DJI、Fujifilm、GoPro、Hasselblad、Leica、Lumix、Nikon、
 * Olympus、Pentax、Ricoh、Sigma、Sony、Xiaomi。
 */

/**
 * 支持识别的品牌列表。
 */
export const SUPPORTED_BRANDS = [
  "Apple", "Canon", "DJI", "Fujifilm", "GoPro", "Hasselblad",
  "Leica", "Lumix", "Nikon", "Olympus", "Pentax", "Ricoh",
  "Sigma", "Sony", "Xiaomi"
] as const

/** 品牌识别结果。 */
export type BrandDetectionResult = {
  /** 识别到的品牌名称（如 "Nikon"），未识别时为 null。 */
  readonly brand: string | null
  /** 品牌显示文案（如 "NIKON"），未识别时为 null。 */
  readonly label: string | null
}

/**
 * 品牌关键词匹配规则。
 * 按品牌名和常见别名匹配，不区分大小写。
 */
const BRAND_KEYWORDS: ReadonlyArray<{ readonly brand: string; readonly label: string; readonly keywords: readonly string[] }> = [
  { brand: "Apple", label: "iPhone", keywords: ["apple", "iphone"] },
  { brand: "Canon", label: "Canon", keywords: ["canon", "eos"] },
  { brand: "DJI", label: "DJI", keywords: ["dji", "mavic", "osmo", "zenmuse"] },
  { brand: "Fujifilm", label: "FUJIFILM", keywords: ["fuji", "fujifilm", "x-pro", "x-t", "x100", "gfx"] },
  { brand: "GoPro", label: "GoPro", keywords: ["gopro", "hero"] },
  { brand: "Hasselblad", label: "HASSELBLAD", keywords: ["hasselblad", "500c", "x1d", "h6d"] },
  { brand: "Leica", label: "LEICA", keywords: ["leica", "m6", "m9", "q2", "cl", "leica mp"] },
  { brand: "Lumix", label: "LUMIX", keywords: ["lumix", "panasonic", "gh5", "gx"] },
  { brand: "Nikon", label: "NIKON", keywords: ["nikon", "d8", "d7", "z6", "z7", "zf", "fm2", "fe2"] },
  { brand: "Olympus", label: "OLYMPUS", keywords: ["olympus", "om-", "pen-", "mju"] },
  { brand: "Pentax", label: "PENTAX", keywords: ["pentax", "k1", "k1000", "67"] },
  { brand: "Ricoh", label: "RICOH", keywords: ["ricoh", "gr1", "gr2", "gr3", "gr-"] },
  { brand: "Sigma", label: "SIGMA", keywords: ["sigma", "dp1", "dp2", "fp"] },
  { brand: "Sony", label: "SONY", keywords: ["sony", "a7", "a9", "a1", "rx1", "alpha"] },
  { brand: "Xiaomi", label: "Xiaomi", keywords: ["xiaomi", "redmi", "mi " ] },
]

/**
 * 从相机型号字符串中识别品牌。
 *
 * 识别优先级：
 * 1. camera 字符串中包含品牌关键词
 *
 * @param camera 相机型号字符串（如 "Nikon F3"、"Leica M6"）
 * @returns 品牌识别结果
 */
export const detectCameraBrand = (camera: string): BrandDetectionResult => {
  const text = camera.trim().toLowerCase()
  if (text.length === 0) {
    return { brand: null, label: null }
  }

  for (const rule of BRAND_KEYWORDS) {
    for (const keyword of rule.keywords) {
      if (text.includes(keyword)) {
        return { brand: rule.brand, label: rule.label }
      }
    }
  }

  return { brand: null, label: null }
}

/**
 * 从 PhotoIdentity 的 camera 字段识别品牌。
 * 空字符串返回 null。
 */
export const detectBrandFromIdentity = (camera: string): BrandDetectionResult => {
  return detectCameraBrand(camera)
}
