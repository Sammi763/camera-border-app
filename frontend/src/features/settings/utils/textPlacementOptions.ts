import type { TextArea } from "../types"

export type TextPlacementOption = {
  readonly value: string
  readonly label: string
}

/**
 * 按绘制区域返回全部合法位置。
 * 图片区域支持九宫格；边框区域支持上下条带的左/中/右六个位置。
 */
export const textPlacementOptions = (area: TextArea): readonly TextPlacementOption[] => {
  if (area === "image") {
    return [
      { value: "top-left", label: "左上" },
      { value: "top-center", label: "顶部居中" },
      { value: "top-right", label: "右上" },
      { value: "center-left", label: "左侧居中" },
      { value: "center", label: "正中" },
      { value: "center-right", label: "右侧居中" },
      { value: "bottom-left", label: "左下" },
      { value: "bottom-center", label: "底部居中" },
      { value: "bottom-right", label: "右下" }
    ]
  }
  return [
    { value: "top-left", label: "左上" },
    { value: "top-center", label: "顶部居中" },
    { value: "top-right", label: "右上" },
    { value: "bottom-left", label: "左下" },
    { value: "bottom-center", label: "底部居中" },
    { value: "bottom-right", label: "右下" }
  ]
}

/** 把旧/不属于当前区域的位置收敛到该区域的稳定默认值。 */
export const normalizeTextPlacement = (area: TextArea, placement: string): string => {
  const options = textPlacementOptions(area)
  // 兼容旧设置已经写入的 image-/border- 前缀；UI 状态统一保存无前缀值，
  // 切换区域时只保留位置语义，不把一个合法的角落位置悄悄重置为中心。
  const barePlacement = placement.startsWith("image-") || placement.startsWith("border-")
    ? placement.slice(placement.indexOf("-") + 1)
    : placement
  return options.some((option) => option.value === barePlacement)
    ? barePlacement
    : area === "border" ? "bottom-center" : "center"
}
