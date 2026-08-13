/**
 * 内置相机机型常量。
 *
 * 首版内置常见胶片相机，按品牌分组，用于 PhotoIdentityPanel 的快速选择。
 * 选择后写入 identityOverride.camera，进入 {Camera} 变量链路。
 */

/** 内置相机机型。 */
export type BuiltInCameraModel = {
  /** 唯一标识。 */
  readonly id: string
  /** 品牌。 */
  readonly brand: string
  /** 型号。 */
  readonly model: string
  /** 展示标签，通常为 "品牌 型号"。 */
  readonly label: string
}

/** 内置相机机型列表。 */
export const BUILT_IN_CAMERA_MODELS: readonly BuiltInCameraModel[] = [
  // Nikon
  { id: "nikon-f3", brand: "Nikon", model: "F3", label: "Nikon F3" },
  { id: "nikon-fm2", brand: "Nikon", model: "FM2", label: "Nikon FM2" },
  { id: "nikon-fe2", brand: "Nikon", model: "FE2", label: "Nikon FE2" },
  { id: "nikon-zf", brand: "Nikon", model: "Zf", label: "Nikon Zf" },
  // Canon
  { id: "canon-ae1", brand: "Canon", model: "AE-1", label: "Canon AE-1" },
  { id: "canon-eos3", brand: "Canon", model: "EOS 3", label: "Canon EOS 3" },
  // Fujifilm
  { id: "fujifilm-tx1", brand: "Fujifilm", model: "TX-1", label: "Fujifilm TX-1" },
  { id: "fujifilm-klasse", brand: "Fujifilm", model: "Klasse", label: "Fujifilm Klasse" },
  // Leica
  { id: "leica-m6", brand: "Leica", model: "M6", label: "Leica M6" },
  { id: "leica-mp", brand: "Leica", model: "MP", label: "Leica MP" },
  // Pentax
  { id: "pentax-67", brand: "Pentax", model: "67", label: "Pentax 67" },
  { id: "pentax-k1000", brand: "Pentax", model: "K1000", label: "Pentax K1000" },
  // Hasselblad
  { id: "hasselblad-500cm", brand: "Hasselblad", model: "500CM", label: "Hasselblad 500CM" },
  // Contax
  { id: "contax-t2", brand: "Contax", model: "T2", label: "Contax T2" },
  // Olympus
  { id: "olympus-mju-ii", brand: "Olympus", model: "mju-II", label: "Olympus mju-II" },
  // Ricoh
  { id: "ricoh-gr1", brand: "Ricoh", model: "GR1", label: "Ricoh GR1" },
]
