/** 单个 HEIC/HEIF 源文件最大字节数。 */
export const MAX_HEIC_INPUT_BYTES = 200 * 1024 * 1024
/** HEIC/HEIF 解码输出最大字节数。 */
export const MAX_HEIC_OUTPUT_BYTES = 800 * 1024 * 1024
/** 单张解码结果的最大宽高和像素数，防止异常尺寸占满 worker 内存。 */
export const MAX_HEIC_WIDTH = 12_000
export const MAX_HEIC_HEIGHT = 12_000
export const MAX_HEIC_PIXELS = 144_000_000
/** 隔离解码 worker 最长运行时间。 */
export const HEIC_CONVERSION_TIMEOUT_MS = 30_000
/** 单次 IPC 最多处理的文件数。 */
export const MAX_HEIC_FILES_PER_REQUEST = 200

export type PngDimensions = {
  readonly width: number
  readonly height: number
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

const readUint32Be = (bytes: Uint8Array, offset: number): number => (
  bytes[offset]! * 0x1000000
  + bytes[offset + 1]! * 0x10000
  + bytes[offset + 2]! * 0x100
  + bytes[offset + 3]!
)

/** 在完整解码前读取 PNG IHDR，避免先为超大图分配解码缓冲。 */
export const readPngDimensions = (bytes: Uint8Array): PngDimensions | null => {
  if (bytes.length < 24) return null
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return null
  }

  if (readUint32Be(bytes, 8) !== 13) return null
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return null
  }

  const width = readUint32Be(bytes, 16)
  const height = readUint32Be(bytes, 20)
  if (width <= 0 || height <= 0) return null
  return { width, height }
}

/** 校验源文件大小；0、负数、非整数和超限值都拒绝。 */
export const isHeicInputSizeAllowed = (size: number): boolean =>
  Number.isSafeInteger(size) && size > 0 && size <= MAX_HEIC_INPUT_BYTES

/** 校验解码结果大小；0、负数、非整数和超限值都拒绝。 */
export const isHeicOutputSizeAllowed = (size: number): boolean =>
  Number.isSafeInteger(size) && size > 0 && size <= MAX_HEIC_OUTPUT_BYTES

/** 校验解码结果的像素尺寸；检查在编码前完成。 */
export const isHeicDimensionsAllowed = (width: number, height: number): boolean =>
  Number.isSafeInteger(width) && Number.isSafeInteger(height)
    && width > 0 && height > 0
    && width <= MAX_HEIC_WIDTH && height <= MAX_HEIC_HEIGHT
    && width * height <= MAX_HEIC_PIXELS

/** 将随包模块加载器抽象出来，便于测试缺依赖时能力探测会失败。 */
export const canLoadBundledHeicModules = (
  load: (moduleName: string) => unknown
): boolean => {
  try {
    // worker 实际通过 heic-convert + pngjs 完成解码和 PNG 编码。
    // heic-convert 的 heic-decode 是其依赖，不再把一个未被 worker 直接
    // require 的包名当成单独能力条件，避免依赖安装布局导致错误降级。
    load("heic-convert")
    load("pngjs")
    return true
  } catch {
    return false
  }
}

/** 校验单次请求数量；空数组由调用方作为无操作处理。 */
export const isHeicFileCountAllowed = (count: number): boolean =>
  Number.isSafeInteger(count) && count >= 0 && count <= MAX_HEIC_FILES_PER_REQUEST

/** 校验 worker 超时参数，避免负数造成立即且不明确的失败。 */
export const isHeicTimeoutAllowed = (timeoutMs: number): boolean =>
  Number.isSafeInteger(timeoutMs) && timeoutMs > 0
