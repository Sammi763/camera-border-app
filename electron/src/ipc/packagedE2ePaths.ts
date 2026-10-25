/**
 * 组装打包 E2E 的图片选择结果。
 *
 * 失败样片只用于验证真实逐项失败与重试路径；没有主样片时不能单独注入，
 * 避免测试替身改变普通的单样片导入语义。
 */
export const composePackagedE2eImagePaths = (
  sample: string | null,
  retrySample: string | null,
  extraSamples: readonly string[] = []
): readonly string[] => {
  if (sample === null) {
    return []
  }
  return retrySample === null
    ? [sample, ...extraSamples]
    : [sample, ...extraSamples, retrySample]
}
