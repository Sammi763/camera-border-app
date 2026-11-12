import type { ImageProcessingConfig } from "../../types/imageProcessing"
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
