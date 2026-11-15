import type { ImageProcessingConfig } from "../../types/imageProcessing"
import type { ImageProbeResponse } from "../../types/imageProbe"
import { isRawFile } from "../metadata/constants/rawExtensions"

/** 线性测试输入支持的文件扩展名（与 FilmLinearTiffReader 的 16-bit TIFF 路径一致）。 */
const LINEAR_TIFF_EXTENSIONS = [".tif", ".tiff"]

export const isLinearTiffPath = (path: string | null): boolean => {
  if (path === null) return false
  const lower = path.toLowerCase()
  return LINEAR_TIFF_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

export const isFilmCapablePath = (path: string | null): boolean =>
  path !== null && (isRawFile(path) || isLinearTiffPath(path))

/** v2 胶片校色可接受已转正扫描/数码正片，不再只限 RAW 与线性 TIFF。 */
const COLOR_GRADING_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp", ".fff", ".3fr"
]

export const isColorGradingCapablePath = (path: string | null): boolean =>
  path !== null && (isRawFile(path)
    || COLOR_GRADING_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension)))

/**
 * v2 正片/彩负默认配方：输入来源和正负性质分开。
 *
 * 已编码栅格按探测结果使用嵌入 ICC；没有 ICC 时默认 sRGB 只是显式保存的选择，
 * 不表示文件已经被证明为 sRGB。FFF 只使用显式线性扫描输入模型。
 */
export const createDefaultFilmColorProcessing = (
  sourcePath: string,
  polarity: "positive" | "color-negative",
  probe?: ImageProbeResponse | null
): ImageProcessingConfig | null => {
  if (!isColorGradingCapablePath(sourcePath)) return null
  const base = {
    schemaVersion: 2,
    algorithmVersion: "film-color-v2",
    filmPolarity: polarity,
    negative: polarity === "color-negative"
      ? {
          enabled: true,
          lightSource: { kind: "camera-white-balance" } as const,
          filmBase: {
            kind: "roi" as const,
            roi: { x: 0.02, y: 0.02, width: 0.08, height: 0.05 },
            stage: "linear-working" as const
          },
          density: { min: 0, max: 3 },
          profile: "generic-color-negative-v1" as const
        }
      : null,
    positive: {
      exposureEv: 0,
      rgbBalanceEv: [0, 0, 0] as const,
      blackPoint: 0,
      whitePoint: 1,
      saturation: 1,
      masterCurve: null,
      redCurve: null,
      greenCurve: null,
      blueCurve: null
    },
    sourceGeometry: {
      crop: { x: 0, y: 0, width: 1, height: 1 },
      rotationDegrees: 0
    }
  }

  if (probe?.flextight?.available === true || (sourcePath.toLowerCase().endsWith(".fff") && probe?.raw?.available !== true)) {
    return {
      ...base,
      inputSource: "flextight-fff",
      flextightInput: {
        device: "flextight",
        mainImage: "rgb16",
        colorSpace: "linear-rec2020",
        transferFunction: "linear",
        bitDepth: 16
      }
    }
  }
  if (isRawFile(sourcePath) && !(sourcePath.toLowerCase().endsWith(".fff") && probe?.raw?.available !== true)) {
    return {
      ...base,
      inputSource: "camera-raw",
      raw: {
        whiteBalance: "camera",
        autoBright: false,
        gamma: "linear",
        highlight: "clip",
        crop: "vendor-inset"
      }
    }
  }
  const bitDepth = probe?.container?.bitDepth === 16 ? 16 : 8
  const colorSpace = probe?.icc?.present === true ? "embedded" : "srgb"
  return {
    ...base,
    inputSource: "encoded-raster",
    encodedInput: {
      colorSpace,
      bitDepth,
      alphaBackground: "white",
      ...(probe?.icc?.sha256 === null || probe?.icc?.sha256 === undefined
        ? {}
        : { iccSha256: probe.icc.sha256 })
    }
  } as ImageProcessingConfig
}

/**
 * 新建每图底片配置的默认值：真实 RAW 走 sensor-raw，TIFF 走显式线性测试输入。
 * 默认片基为同图 ROI，光源为相机白平衡；零正片调整是恒等。
 */
export const createDefaultFilmProcessing = (sourcePath: string): ImageProcessingConfig | null => {
  if (!isFilmCapablePath(sourcePath)) return null
  const sensorRaw = isRawFile(sourcePath)
  return {
    schemaVersion: 1,
    algorithmVersion: "film-digitization-v1",
    inputMode: sensorRaw ? "sensor-raw" : "linear-tiff",
    raw: sensorRaw
      ? { whiteBalance: "camera", autoBright: false, gamma: "linear", highlight: "clip", crop: "vendor-inset" }
      : null,
    linearInput: sensorRaw
      ? null
      : { transferFunction: "linear", colorSpace: "linear-rec2020", bitDepth: 16 },
    negative: {
      enabled: true,
      lightSource: { kind: "camera-white-balance" },
      filmBase: {
        kind: "roi",
        roi: { x: 0.02, y: 0.02, width: 0.08, height: 0.05 },
        stage: "linear-working"
      },
      density: { min: 0, max: 3 },
      profile: "generic-color-negative-v1"
    },
    positive: {
      exposureEv: 0,
      rgbBalanceEv: [0, 0, 0],
      blackPoint: 0,
      whitePoint: 1,
      saturation: 1,
      masterCurve: null,
      redCurve: null,
      greenCurve: null,
      blueCurve: null
    },
    sourceGeometry: {
      crop: { x: 0, y: 0, width: 1, height: 1 },
      rotationDegrees: 0
    }
  }
}
