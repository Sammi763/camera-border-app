import { describe, expect, it } from "vitest"
import {
  HEIC_CONVERSION_TIMEOUT_MS,
  canLoadBundledHeicModules,
  isHeicFileCountAllowed,
  isHeicDimensionsAllowed,
  isHeicInputSizeAllowed,
  isHeicOutputSizeAllowed,
  isHeicTimeoutAllowed,
  MAX_HEIC_FILES_PER_REQUEST,
  MAX_HEIC_INPUT_BYTES,
  MAX_HEIC_OUTPUT_BYTES,
  MAX_HEIC_WIDTH,
  readPngDimensions,
} from "./heicLimits"

describe("HEIC 解码保护边界", () => {
  it("拒绝空文件、非整数和超限源文件", () => {
    expect(isHeicInputSizeAllowed(0)).toBe(false)
    expect(isHeicInputSizeAllowed(-1)).toBe(false)
    expect(isHeicInputSizeAllowed(1.5)).toBe(false)
    expect(isHeicInputSizeAllowed(MAX_HEIC_INPUT_BYTES)).toBe(true)
    expect(isHeicInputSizeAllowed(MAX_HEIC_INPUT_BYTES + 1)).toBe(false)
  })

  it("拒绝异常解码输出，防止临时文件失控增长", () => {
    expect(isHeicOutputSizeAllowed(0)).toBe(false)
    expect(isHeicOutputSizeAllowed(MAX_HEIC_OUTPUT_BYTES)).toBe(true)
    expect(isHeicOutputSizeAllowed(MAX_HEIC_OUTPUT_BYTES + 1)).toBe(false)
  })

  it("在写出 PNG 前拒绝异常像素尺寸", () => {
    expect(isHeicDimensionsAllowed(MAX_HEIC_WIDTH, 1)).toBe(true)
    expect(isHeicDimensionsAllowed(MAX_HEIC_WIDTH + 1, 1)).toBe(false)
    expect(isHeicDimensionsAllowed(1, 0)).toBe(false)
    expect(isHeicDimensionsAllowed(12_000, 12_000)).toBe(true)
    expect(isHeicDimensionsAllowed(12_000, 12_001)).toBe(false)
  })

  it("在完整解码前读取 PNG 尺寸", () => {
    const header = new Uint8Array(24)
    header.set([137, 80, 78, 71, 13, 10, 26, 10])
    header.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8)
    header.set([0, 0x00, 0x2e, 0xe0], 16)
    header.set([0, 0x00, 0x17, 0x70], 20)

    expect(readPngDimensions(header)).toEqual({ width: 12_000, height: 6_000 })
    expect(readPngDimensions(new Uint8Array(24))).toBeNull()
  })

  it("限制单次文件数量并要求正数超时", () => {
    expect(isHeicFileCountAllowed(MAX_HEIC_FILES_PER_REQUEST)).toBe(true)
    expect(isHeicFileCountAllowed(MAX_HEIC_FILES_PER_REQUEST + 1)).toBe(false)
    expect(isHeicFileCountAllowed(-1)).toBe(false)
    expect(isHeicTimeoutAllowed(HEIC_CONVERSION_TIMEOUT_MS)).toBe(true)
    expect(isHeicTimeoutAllowed(0)).toBe(false)
    expect(isHeicTimeoutAllowed(-1)).toBe(false)
    expect(isHeicTimeoutAllowed(1.2)).toBe(false)
  })

  it("能力探测遇到 worker 实际依赖缺失时失败，不会回退到系统工具", () => {
    expect(canLoadBundledHeicModules(() => ({}))).toBe(true)
    expect(canLoadBundledHeicModules((moduleName) => {
      if (moduleName === "heic-convert") throw new Error("missing")
      return {}
    })).toBe(false)
    expect(canLoadBundledHeicModules((moduleName) => {
      if (moduleName === "pngjs") throw new Error("missing")
      return {}
    })).toBe(false)
  })
})
