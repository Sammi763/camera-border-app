import { useEffect, useState } from "react"
import { fetchCapabilities } from "../../../services/engine/capabilitiesApi"
import type { CapabilitiesResponse } from "../../../types/preview"
import type { PackageCapabilities } from "../../../types/runtime"

export type EngineCapabilitiesState =
  | { readonly kind: "unavailable"; readonly message: string }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly capabilities: CapabilitiesResponse }
  | { readonly kind: "error"; readonly message: string }

const readPackageCapabilities = async (): Promise<PackageCapabilities | null> => {
  const reader = window.desktop?.getPackageCapabilities
  if (reader === undefined) return null
  try {
    return await reader()
  } catch {
    return null
  }
}

/** 将 Electron 侧的 bundled decoder 真值合并到 Java 能力，避免缺助手时误报 HEIC 可用。 */
const applyPackageGates = (
  capabilities: CapabilitiesResponse,
  packageCapabilities: PackageCapabilities | null
): CapabilitiesResponse => {
  if (packageCapabilities === null) return capabilities
  const heicAvailable = packageCapabilities.bundledHeicDecoder && capabilities.input["heic"] === true
  const fontsAvailable = packageCapabilities.bundledFonts.length > 0
    && (capabilities.components["fonts"]?.available ?? true)
  return {
    ...capabilities,
    input: {
      ...capabilities.input,
      heic: heicAvailable,
      heif: heicAvailable
    },
    components: {
      ...capabilities.components,
      "heic-decoder": {
        available: packageCapabilities.bundledHeicDecoder,
        reason: packageCapabilities.bundledHeicDecoder ? null : "随包 HEIC 解码助手不可用"
      },
      fonts: {
        ...(capabilities.components["fonts"] ?? {}),
        available: fontsAvailable,
        reason: fontsAvailable ? null : "随包字体不可用"
      }
    }
  }
}

/** 引擎未 ready 时保持 fail closed；ready 后读取并缓存当前进程能力快照。 */
export const useEngineCapabilities = (engineAvailable: boolean): EngineCapabilitiesState => {
  const [state, setState] = useState<EngineCapabilitiesState>({
    kind: "unavailable",
    message: "本地引擎尚未就绪"
  })

  useEffect(() => {
    let active = true
    if (!engineAvailable) {
      setState({ kind: "unavailable", message: "本地引擎尚未就绪" })
      return () => { active = false }
    }
    setState({ kind: "loading" })
    void Promise.all([fetchCapabilities(), readPackageCapabilities()]).then(([capabilities, packageCapabilities]) => {
      if (active) setState({ kind: "ready", capabilities: applyPackageGates(capabilities, packageCapabilities) })
    }).catch((error: unknown) => {
      if (active) {
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "能力探测失败"
        })
      }
    })
    return () => { active = false }
  }, [engineAvailable])

  return state
}
