/**
 * 默认文字图层工厂。
 *
 * 从 useSettings.ts 抽出，供 TextLayerEditor 空状态恢复、
 * SettingsPanel 快捷文字 fallback 等场景共享调用，避免复制。
 */

import type { TextLayerSettings } from "../types"

/**
 * 创建默认 3 段文字图层。
 * 首版固定 3 段：文字 1 / 文字 2 / 文字 3。
 */
export const createDefaultTextLayers = (): readonly TextLayerSettings[] => [
  {
    id: "layer-1",
    enabled: true,
    content: "{Camera} · {Lens}",
    fontFamily: "sans-serif",
    fontSize: 20,
    color: "#222222",
    placement: "bottom-center",
    textArea: "border",
    marginX: 0,
    marginY: 20,
    lineSpacing: 0,
    letterSpacing: 0,
    backgroundEnabled: false,
    backgroundColor: "#000000",
    backgroundPaddingX: 6,
    backgroundPaddingY: 3,
    shadowEnabled: false,
    shadowColor: "#000000",
    shadowBlur: 0,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    strokeEnabled: false,
    strokeColor: "#000000",
    strokeWidth: 1,
  },
  {
    id: "layer-2",
    enabled: true,
    content: "{CaptureFormat} · {Film} · {Location}",
    fontFamily: "sans-serif",
    fontSize: 16,
    color: "#666666",
    placement: "bottom-center",
    textArea: "border",
    marginX: 0,
    marginY: 45,
    lineSpacing: 0,
    letterSpacing: 0,
    backgroundEnabled: false,
    backgroundColor: "#000000",
    backgroundPaddingX: 6,
    backgroundPaddingY: 3,
    shadowEnabled: false,
    shadowColor: "#000000",
    shadowBlur: 0,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    strokeEnabled: false,
    strokeColor: "#000000",
    strokeWidth: 1,
  },
  {
    id: "layer-3",
    enabled: false,
    content: "",
    fontFamily: "sans-serif",
    fontSize: 14,
    color: "#888888",
    placement: "top-center",
    textArea: "border",
    marginX: 0,
    marginY: 8,
    lineSpacing: 0,
    letterSpacing: 0,
    backgroundEnabled: false,
    backgroundColor: "#000000",
    backgroundPaddingX: 6,
    backgroundPaddingY: 3,
    shadowEnabled: false,
    shadowColor: "#000000",
    shadowBlur: 0,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    strokeEnabled: false,
    strokeColor: "#000000",
    strokeWidth: 1,
  },
]
