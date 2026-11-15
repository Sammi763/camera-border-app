import type { ImageProcessingConfig } from "./imageProcessing"

/** 只读图像探针请求；imageProcessing 可选，仅用于核对声明与文件事实。 */
export type ImageProbeRequest = {
  readonly imagePath: string
  readonly imageProcessing?: ImageProcessingConfig | null
}

export type ImageProbeContainer = {
  readonly width: number
  readonly height: number
  readonly bitDepth: number
  readonly bands: number
  readonly alpha: boolean
  readonly colorModel: string
  readonly imageCount: number
  readonly tiffContainer: boolean
}

export type ImageProbeIcc = {
  readonly present: boolean
  readonly sha256: string | null
  readonly source: string
}

export type ImageProbePreview = {
  readonly available: boolean
  readonly width: number
  readonly height: number
  readonly note?: string | null
}

export type ImageProbeRaw = {
  readonly available: boolean
  readonly decoder?: string | null
  readonly decoderVersion?: string | null
  readonly make?: string | null
  readonly model?: string | null
  readonly rawWidth: number
  readonly rawHeight: number
  readonly width: number
  readonly height: number
  readonly sensorBitDepth: number
  readonly black: number
  readonly maximum: number
  readonly linearMax?: readonly number[] | null
  readonly cropMode?: string | null
  readonly flip: number
  readonly exifOrientation: number
  readonly reason?: string | null
}

export type ImageProbeFlextight = {
  readonly available: boolean
  readonly mainImage: string
  readonly width: number
  readonly height: number
  readonly bitDepth: number
  readonly bands: number
  readonly attachedImageCount: number
  readonly reason?: string | null
}

export type ImageProbeDeclared = {
  readonly valid: boolean
  readonly inputSource?: string | null
  readonly filmPolarity?: string | null
  readonly reason?: string | null
}

export type ImageProbePairing = {
  readonly candidatePath: string | null
  readonly candidateFormat: string | null
  readonly dimensionsMatch: boolean
  readonly orientationMatch: boolean
  readonly bitDepthMatch: boolean
  readonly aspectRatioMatch: boolean
  readonly aspectRatioDelta: number
  readonly warnings: readonly string[]
}

export type ImageProbeResponse = {
  readonly status: string
  readonly imagePath: string
  readonly format: string
  readonly sourceVersion: string
  readonly orientation: number
  readonly width: number
  readonly height: number
  readonly container: ImageProbeContainer
  readonly icc: ImageProbeIcc | null
  readonly preview: ImageProbePreview
  readonly raw?: ImageProbeRaw | null
  readonly flextight?: ImageProbeFlextight | null
  readonly inputSources: readonly string[]
  readonly recommendedInputSource: string | null
  readonly warnings: readonly string[]
  readonly declared?: ImageProbeDeclared | null
  readonly pairing?: ImageProbePairing | null
}
