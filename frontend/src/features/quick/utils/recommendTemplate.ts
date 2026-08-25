/**
 * 确定性模板推荐规则（快速出图模式）。
 *
 * 只改变「建议模板」标记，不修改用户已设置的边框、裁剪与导出尺寸。
 * 规则固定、可测试：同一输入永远得到同一推荐。
 *
 * 推荐优先级（从上到下命中即返回）：
 * 1. 中画幅/大画幅（645、6x6、6x7、6x8、6x9、6x10、6x12、4433）-> 中画幅留白；
 * 2. 胶片照片（身份含胶片名）-> 摄影信息卡（展示 {Film}）；
 * 3. 数码照片且已有相机或镜头信息 -> 摄影信息卡；
 * 4. 其它（缺少可展示信息）-> 竖图推荐极简黑边，其余推荐经典白边。
 */

/** 中画幅/大画幅画幅 id（含数码 4433）。 */
const MEDIUM_LARGE_FORMATS: readonly string[] = [
  "4433", "645", "6x6", "6x7", "6x8", "6x9", "6x10", "6x12"
]

/** 推荐规则输入。 */
export type TemplateRecommendInput = {
  /** 照片方向；null 表示暂无法判断（如预览图未加载）。 */
  readonly orientation: "landscape" | "portrait" | "square" | null
  /** 是否为胶片照片（有效身份含胶片名）。 */
  readonly isFilm: boolean
  /** 当前拍摄画幅 id（见 constants/captureFormats.ts）。 */
  readonly captureFormatId: string | null
  /** 是否已有相机或镜头信息（EXIF/预设/覆盖均可）。 */
  readonly hasCameraOrLens: boolean
}

/** 推荐的模板 id（对应 BUILT_IN_TEMPLATES 中的 id）。 */
export const recommendTemplateId = (input: TemplateRecommendInput): string => {
  const { orientation, isFilm, captureFormatId, hasCameraOrLens } = input

  if (captureFormatId !== null && MEDIUM_LARGE_FORMATS.includes(captureFormatId)) {
    return "medium-format-margin"
  }
  if (isFilm) {
    return "photo-info-card"
  }
  if (hasCameraOrLens) {
    return "photo-info-card"
  }
  // 无可用信息：竖图用极简黑边，横图/方形用经典白边
  return orientation === "portrait" ? "minimal-black" : "classic-white"
}

/** 根据图片自然宽高判断方向；任一维度缺失时返回 null。 */
export const orientationFromSize = (
  width: number | null | undefined,
  height: number | null | undefined
): TemplateRecommendInput["orientation"] => {
  if (width === null || width === undefined || height === null || height === undefined || width <= 0 || height <= 0) {
    return null
  }
  if (width > height) {
    return "landscape"
  }
  if (width < height) {
    return "portrait"
  }
  return "square"
}
