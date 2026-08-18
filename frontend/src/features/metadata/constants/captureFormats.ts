/**
 * 统一拍摄画幅目录（P0-02 的前端落点）。
 *
 * 画幅同时服务两类用途：
 * - 信息展示：摄影预设与每图覆盖携带 captureFormat，供变量与身份面板展示；
 * - 边框推荐：胶片画幅 ID 与引擎 GET /api/film-formats 的 id 保持一致，
 *   便于后续把预设画幅接入边框推荐（P0-07），数码画幅暂不参与边框推荐。
 *
 * 规则：
 * - 画幅只承载「信息」，应用预设/画幅不会静默裁剪、改尺寸或覆盖用户边框设置；
 * - 未知画幅 ID 返回 null（显示为空），不抛出异常。
 */

/** 画幅归类：数码 / 胶片。 */
export type CaptureFormatKind = "digital" | "film"

/** 拍摄画幅条目。 */
export type CaptureFormat = {
  readonly id: string
  /** 显示名（面向用户，可中文）。 */
  readonly label: string
  readonly kind: CaptureFormatKind
  /** 宽高比描述（如 "3:2"），仅用于展示。 */
  readonly aspectRatio: string
}

/** 数码画幅。 */
const DIGITAL_FORMATS: readonly CaptureFormat[] = [
  { id: "m43", label: "M43", kind: "digital", aspectRatio: "4:3" },
  { id: "apsc", label: "APS-C", kind: "digital", aspectRatio: "3:2" },
  { id: "fullframe", label: "135 全画幅", kind: "digital", aspectRatio: "3:2" },
  { id: "4433", label: "4433 中画幅", kind: "digital", aspectRatio: "4:3" }
]

/**
 * 胶片画幅：id 与引擎 /api/film-formats 保持一致（顺序与引擎一致）。
 * 契约：6x10 为新增画幅，6x12 必须保留，两者同时存在于目录、摄影预设与边框推荐流程。
 */
const FILM_FORMATS: readonly CaptureFormat[] = [
  { id: "half-frame", label: "半格", kind: "film", aspectRatio: "3:4" },
  { id: "135", label: "135", kind: "film", aspectRatio: "3:2" },
  { id: "645", label: "645", kind: "film", aspectRatio: "4:3" },
  { id: "6x6", label: "6×6", kind: "film", aspectRatio: "1:1" },
  { id: "6x7", label: "6×7", kind: "film", aspectRatio: "5:4" },
  { id: "6x8", label: "6×8", kind: "film", aspectRatio: "10:7" },
  { id: "6x9", label: "6×9", kind: "film", aspectRatio: "45:28" },
  { id: "6x10", label: "6×10", kind: "film", aspectRatio: "25:14" },
  { id: "6x12", label: "6×12", kind: "film", aspectRatio: "15:7" }
]

/** 全部画幅（数码在前，胶片在后）。 */
export const CAPTURE_FORMATS: readonly CaptureFormat[] = [
  ...DIGITAL_FORMATS,
  ...FILM_FORMATS
]

/** 按归类分组（供下拉框分组展示）。 */
export const CAPTURE_FORMAT_GROUPS: readonly { readonly kind: CaptureFormatKind; readonly label: string; readonly formats: readonly CaptureFormat[] }[] = [
  { kind: "digital", label: "数码", formats: DIGITAL_FORMATS },
  { kind: "film", label: "胶片", formats: FILM_FORMATS }
]

/** 按 id 查找画幅；未知 id 返回 null。 */
export const findCaptureFormat = (id: string): CaptureFormat | null => {
  return CAPTURE_FORMATS.find((f) => f.id === id) ?? null
}

/** 画幅显示名；未知 id 返回空字符串（降级为空，不显示 undefined/null）。 */
export const captureFormatLabel = (id: string | null | undefined): string => {
  if (id === null || id === undefined || id.length === 0) {
    return ""
  }
  return findCaptureFormat(id)?.label ?? ""
}

/** 是否已知画幅 id（用于校验输入）。 */
export const isKnownCaptureFormat = (id: string): boolean => {
  return CAPTURE_FORMATS.some((f) => f.id === id)
}
