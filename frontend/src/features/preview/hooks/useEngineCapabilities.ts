import { useCallback, useEffect, useState } from "react"
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

export type EngineCapabilitiesController = {
  readonly state: EngineCapabilitiesState
  /** 重新探测能力快照；用于「请求失败 / 缺少组件」后的手动恢复入口。 */
  readonly recheck: () => void
}

/** 引擎未 ready 时保持 fail closed；ready 后读取并缓存当前进程能力快照。 */
export const useEngineCapabilities = (engineAvailable: boolean): EngineCapabilitiesController => {
  const [state, setState] = useState<EngineCapabilitiesState>({
    kind: "unavailable",
    message: "本地引擎尚未就绪"
  })
  // recheck 令牌：变化即重新触发探测，供界面在失败后手动恢复。
  const [recheckToken, setRecheckToken] = useState(0)
  const recheck = useCallback((): void => {
    setRecheckToken((token) => token + 1)
  }, [])

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
  }, [engineAvailable, recheckToken])

  return { state, recheck }
}
